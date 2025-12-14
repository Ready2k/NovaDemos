#!/usr/bin/env node

/**
 * Test Client for Balance First + Multiple Workflows
 * 3. Asks for balance FIRST
 * 4. Enables Banking AND Mortgage workflows
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');   

class BalanceFirstTestClient {
    constructor() {
        this.ws = null;
        this.sessionId = null;
        this.WS_URL = 'ws://localhost:8080/sonic';
    }

    async loadPrompt(filename) {
        try {
            const PROMPTS_DIR = path.join(__dirname, '../backend/prompts');
            const promptPath = path.join(PROMPTS_DIR, filename);
            if (!fs.existsSync(promptPath)) {
                throw new Error(`Prompt file not found: ${promptPath}`);
            }
            return fs.readFileSync(promptPath, 'utf-8').trim();
        } catch (err) {
            console.error(`[BalanceTest] Failed to load prompt ${filename}:`, err);
            throw err;
        }
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('[BalanceTest] Connecting to server...');
            this.ws = new WebSocket(this.WS_URL);

            this.ws.on('open', () => {
                console.log('[BalanceTest] ✅ Connected to server');
                resolve();
            });

            this.ws.on('error', (error) => {
                console.error('[BalanceTest] ❌ Connection error:', error);
                reject(error);
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code) => {
                console.log(`[BalanceTest] 🔌 Disconnected (code: ${code})`);
            });
        });
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'connected':
                    this.sessionId = message.sessionId;
                    console.log(`[BalanceTest] 🎯 Session ID: ${this.sessionId}`);
                    break;

                case 'transcript':
                    const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
                    const finalStatus = message.isFinal ? '✓ FINAL' : '⋯ STREAMING';
                    if (message.isFinal || message.role === 'user') {
                        console.log(`[BalanceTest] ${role}: "${message.text}"`);
                    }
                    break;

                case 'debugInfo':
                    if (message.data.toolUse) {
                        console.log(`[BalanceTest] 🔧 Tool Use: ${message.data.toolUse.name} ${JSON.stringify(message.data.toolUse.input || {})}`);
                    }
                    break;

                case 'error':
                    console.error(`[BalanceTest] ❌ Error: ${message.message}`);
                    break;
            }
        } catch (e) {
            // Ignore binary data
        }
    }

    async sendConfig() {
        const systemPrompt = await this.loadPrompt('persona-banking_bot.txt');

        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: systemPrompt,
                voiceId: 'matthew',
                brainMode: 'raw_nova',
                // ESSENTIAL: Link both workflows to reproduce the issue
                linkedWorkflows: ['banking', 'persona-mortgage'],
                selectedTools: [
                    'agentcore_balance',
                    // Banking Tools
                    'get_account_transactions',
                    'lookup_merchant_alias',
                    'create_dispute_case',
                    'manage_recent_interactions',
                    'perform_idv_check',
                    'update_dispute_case',
                    // Mortgage Tools
                    'check_credit_score',
                    'value_property',
                    'calculate_max_loan',
                    'get_mortgage_rates'
                ],
                userLocation: 'London, UK',
                userTimezone: 'Europe/London'
            }
        };

        console.log('[BalanceTest] 📤 Sending configuration (Both Workflows)...');
        this.ws.send(JSON.stringify(config));

        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async sendTextMessage(text) {
        const message = {
            type: 'textInput',
            text: text
        };

        console.log(`\n[BalanceTest] 📤 User Saying: "${text}"`);
        this.ws.send(JSON.stringify(message));
    }

    async runTest() {
        try {
            await this.connect();
            await this.sendConfig();

            console.log('\n[BalanceTest] 🧪 Starting Balance First + Multi-Workflow Scenario...\n');

            // Step 1: "Balance First" trigger
            await this.sendTextMessage("Hi, can you tell me my balance?");
            await this.wait(6000);

            // Step 2: Now switch to dispute
            await this.sendTextMessage("I want to raise a dispute.");
            await this.wait(5000);

            // Step 3: Provide details (Should trigger IDV + History Check)
            // This is where the loop previously happened (IDV -> History -> Loop?)
            await this.sendTextMessage("My account is 12345678 and sort code 112233.");
            await this.wait(8000);

            // Step 4: Check if loop happens here. 
            // In the previous bug, 'retrieve_history' kept looping.
            // Let's see if having Mortgage workflow active confuses it.

            // Step 5: Proceed to transaction
            await this.sendTextMessage("I don't recognise the transaction for ABC-Holdings.");
            await this.wait(6000);

            // Step 6: End
            await this.sendTextMessage("Thanks, bye.");
            await this.wait(3000);

            console.log('\n[BalanceTest] ✅ Scenario completed');

        } catch (error) {
            console.error('[BalanceTest] ❌ Test failed:', error);
        } finally {
            if (this.ws) {
                this.ws.close();
            }
        }
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

async function main() {
    const client = new BalanceFirstTestClient();
    process.on('SIGINT', () => {
        client.ws.close();
        process.exit(0);
    });
    await client.runTest();
}

if (require.main === module) {
    main().catch(console.error);
}
