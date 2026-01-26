#!/usr/bin/env node

/**
 * Test Client for Banking Fraud Flow (Nova Sonic)
 * Simulates a customer reporting fraud (persisting after alias lookup).
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class FraudTestClient {
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
            console.error(`[FraudTest] Failed to load prompt ${filename}:`, err);
            throw err;
        }
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('[FraudTest] Connecting to server...');
            this.ws = new WebSocket(this.WS_URL);

            this.ws.on('open', () => {
                console.log('[FraudTest] ✅ Connected to server');
                resolve();
            });

            this.ws.on('error', (error) => {
                console.error('[FraudTest] ❌ Connection error:', error);
                reject(error);
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code) => {
                console.log(`[FraudTest] 🔌 Disconnected (code: ${code})`);
            });
        });
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'connected':
                    this.sessionId = message.sessionId;
                    console.log(`[FraudTest] 🎯 Session ID: ${this.sessionId}`);
                    break;

                case 'transcript':
                    const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
                    // Only log final transcripts to keep output clean, or user messages
                    if (message.isFinal || message.role === 'user') {
                        console.log(`[FraudTest] ${role}: "${message.text}"`);
                    }
                    break;

                case 'debugInfo':
                    if (message.data.toolUse) {
                        console.log(`[FraudTest] 🔧 Tool Use: ${message.data.toolUse.name} ${JSON.stringify(message.data.toolUse.input || {})}`);
                    }
                    break;

                case 'error':
                    console.error(`[FraudTest] ❌ Error: ${message.message}`);
                    break;
            }
        } catch (e) {
            // Ignore binary data (audio)
        }
    }

    async sendConfig() {
        const systemPrompt = await this.loadPrompt('persona-banking_bot.txt');

        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: systemPrompt,
                voiceId: 'matthew',
                brainMode: 'raw_nova', // Using Nova Sonic direct mode
                selectedTools: [
                    'agentcore_balance',
                    'get_account_transactions',
                    'lookup_merchant_alias',
                    'create_dispute_case',
                    'manage_recent_interactions',
                    'perform_idv_check',
                    'update_dispute_case'
                ],
                userLocation: 'London, UK',
                userTimezone: 'Europe/London'
            }
        };

        console.log('[FraudTest] 📤 Sending configuration...');
        this.ws.send(JSON.stringify(config));

        // Wait a moment for config to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async sendTextMessage(text) {
        const message = {
            type: 'textInput',
            text: text
        };

        console.log(`\n[FraudTest] 📤 User Saying: "${text}"`);
        this.ws.send(JSON.stringify(message));
    }

    async runTest() {
        try {
            // Connect and Configure
            await this.connect();
            await this.sendConfig();

            console.log('\n[FraudTest] 🧪 Starting Banking Fraud scenario...\n');

            // Step 1: Greeting / Intent
            await this.sendTextMessage("I want to raise a dispute.");
            await this.wait(5000); // Wait for response

            // Step 2: Provide details
            await this.sendTextMessage("My account is 12345678 and sort code 112233.");
            await this.wait(6000); // IDV Check

            // Step 3: Check Balance (Context)
            await this.sendTextMessage("What is my balance?");
            await this.wait(5000);

            // Step 4: Check Transactions
            await this.sendTextMessage("What are my recent transactions?");
            await this.wait(6000);

            // Step 5: Dispute Transaction
            await this.sendTextMessage("I don't recognise the transaction for ABC-Holdings.");
            await this.wait(8000);
            // Wait for tool call AND the new "Inform User" wrapper which should occur here.

            // Step 6: Persist in Fraud (Failure to recognize alias)
            await this.sendTextMessage("No, I've never heard of Love Coffee. I definitely didn't authorize this. It's fraud.");
            await this.wait(8000);

            // Step 7: End (Assuming routed to Fraud)
            await this.sendTextMessage("Okay, thanks for transferring me.");
            await this.wait(4000);

            console.log('\n[FraudTest] ✅ Scenario completed');

        } catch (error) {
            console.error('[FraudTest] ❌ Test failed:', error);
        } finally {
            if (this.ws) {
                this.ws.close();
            }
        }
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Run the test
async function main() {
    console.log('🚀 Banking Fraud Flow Test (Nova Sonic)');
    console.log('======================================\n');

    const client = new FraudTestClient();

    process.on('SIGINT', () => {
        console.log('\n[FraudTest] 🛑 Stopping test...');
        client.disconnect();
        process.exit(0);
    });

    await client.runTest();
}

if (require.main === module) {
    main().catch(console.error);
}
