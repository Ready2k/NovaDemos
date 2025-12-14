#!/usr/bin/env node

/**
 * Test Client for Banking Dispute Flow (Nova Sonic)
 * Simulates a customer raising a dispute.
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class DisputeTestClient {
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
            console.error(`[DisputeTest] Failed to load prompt ${filename}:`, err);
            throw err;
        }
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('[DisputeTest] Connecting to server...');
            this.ws = new WebSocket(this.WS_URL);

            this.ws.on('open', () => {
                console.log('[DisputeTest] ✅ Connected to server');
                resolve();
            });

            this.ws.on('error', (error) => {
                console.error('[DisputeTest] ❌ Connection error:', error);
                reject(error);
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code) => {
                console.log(`[DisputeTest] 🔌 Disconnected (code: ${code})`);
            });
        });
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'connected':
                    this.sessionId = message.sessionId;
                    console.log(`[DisputeTest] 🎯 Session ID: ${this.sessionId}`);
                    break;

                case 'transcript':
                    const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
                    const finalStatus = message.isFinal ? '✓ FINAL' : '⋯ STREAMING';
                    // Only log final transcripts to keep output clean, or user messages
                    if (message.isFinal || message.role === 'user') {
                        console.log(`[DisputeTest] ${role}: "${message.text}"`);
                    }
                    break;

                case 'debugInfo':
                    if (message.data.toolUse) {
                        console.log(`[DisputeTest] 🔧 Tool Use: ${message.data.toolUse.name} ${JSON.stringify(message.data.toolUse.input || {})}`);
                    }
                    break;

                case 'error':
                    console.error(`[DisputeTest] ❌ Error: ${message.message}`);
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

        console.log('[DisputeTest] 📤 Sending configuration...');
        this.ws.send(JSON.stringify(config));

        // Wait a moment for config to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async sendTextMessage(text) {
        const message = {
            type: 'textInput',
            text: text
        };

        console.log(`\n[DisputeTest] 📤 User Saying: "${text}"`);
        this.ws.send(JSON.stringify(message));
    }

    async runTest() {
        try {
            // Connect and Configure
            await this.connect();
            await this.sendConfig();

            console.log('\n[DisputeTest] 🧪 Starting Banking Dispute scenario...\n');

            // Step 1: Greeting / Intent
            await this.sendTextMessage("I want to raise a dispute.");
            await this.wait(5000); // Wait for response

            // Step 2: Provide details
            await this.sendTextMessage("My account is 12345678 and sort code 112233.");
            await this.wait(8000); // longer wait for IDV check

            // Step 3: Check Balance
            await this.sendTextMessage("What is my balance?");
            await this.wait(5000);

            // Step 4: Check Transactions
            await this.sendTextMessage("What are my recent transactions?");
            await this.wait(6000);

            // Step 5: Dispute Transaction
            await this.sendTextMessage("I don't recognise the transaction for ABC-Holdings.");
            await this.wait(6000);

            // Step 6: End
            await this.sendTextMessage("Okay, that makes sense. Thank you, goodbye.");
            await this.wait(4000);

            console.log('\n[DisputeTest] ✅ Scenario completed');

        } catch (error) {
            console.error('[DisputeTest] ❌ Test failed:', error);
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
    console.log('🚀 Banking Dispute Flow Test (Nova Sonic)');
    console.log('========================================\n');

    const client = new DisputeTestClient();

    process.on('SIGINT', () => {
        console.log('\n[DisputeTest] 🛑 Stopping test...');
        client.disconnect();
        process.exit(0);
    });

    await client.runTest();
}

if (require.main === module) {
    main().catch(console.error);
}
