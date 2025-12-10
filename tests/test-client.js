#!/usr/bin/env node

/**
 * Test Client for Nova Sonic Direct Mode
 * Simulates a user asking for the current time via chat (text input)
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class TestClient {
    constructor() {
        this.ws = null;
        this.sessionId = null;
        this.WS_URL = 'ws://localhost:8080/sonic';
    }

    async loadPrompt(filename) {
        try {
            const PROMPTS_DIR = path.join(__dirname, '../backend/prompts');
            return fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
        } catch (err) {
            console.error(`[TestClient] Failed to load prompt ${filename}:`, err);
            return 'You are a helpful AI assistant.';
        }
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('[TestClient] Connecting to server...');
            this.ws = new WebSocket(this.WS_URL);

            this.ws.on('open', () => {
                console.log('[TestClient] ✅ Connected to server');
                resolve();
            });

            this.ws.on('error', (error) => {
                console.error('[TestClient] ❌ Connection error:', error);
                reject(error);
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code) => {
                console.log(`[TestClient] 🔌 Disconnected (code: ${code})`);
            });
        });
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'connected':
                    this.sessionId = message.sessionId;
                    console.log(`[TestClient] 🎯 Session ID: ${this.sessionId}`);
                    break;
                    
                case 'transcript':
                    const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
                    const finalStatus = message.isFinal ? '✓ FINAL' : '⋯ STREAMING';
                    console.log(`[TestClient] ${role}: "${message.text}" (${finalStatus})`);
                    break;
                    
                case 'debugInfo':
                    if (message.data.toolUse) {
                        console.log(`[TestClient] 🔧 Tool Use: ${message.data.toolUse.name}`);
                    }
                    if (message.data.systemInfo) {
                        console.log(`[TestClient] 📊 System: ${message.data.systemInfo.mode} - ${message.data.systemInfo.persona}`);
                    }
                    break;
                    
                case 'error':
                    console.error(`[TestClient] ❌ Error: ${message.message}`);
                    break;
                    
                default:
                    // Ignore other message types for cleaner output
                    break;
            }
        } catch (e) {
            // Ignore binary data (audio)
        }
    }

    async sendConfig() {
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: await this.loadPrompt('core-tool_usage_assistant.txt'),
                voiceId: 'matthew',
                brainMode: 'raw_nova', // Direct mode
                selectedTools: ['get_server_time'], // Only enable time tool for testing
                userLocation: 'London, UK',
                userTimezone: 'Europe/London'
            }
        };

        console.log('[TestClient] 📤 Sending configuration...');
        this.ws.send(JSON.stringify(config));
        
        // Wait a moment for config to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async sendTextMessage(text) {
        const message = {
            type: 'textInput',
            text: text
        };

        console.log(`[TestClient] 📤 Sending: "${text}"`);
        this.ws.send(JSON.stringify(message));
    }

    async runTest() {
        try {
            // Connect
            await this.connect();
            
            // Configure session
            await this.sendConfig();
            
            // Test sequence
            console.log('\n[TestClient] 🧪 Starting test sequence...\n');
            
            // Test 1: Simple greeting
            await this.sendTextMessage("Hello!");
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Test 2: Time request (the main test)
            console.log('\n[TestClient] 🕐 Testing time tool...\n');
            await this.sendTextMessage("What's the current time?");
            
            // Wait for response
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Test 3: Follow-up
            await this.sendTextMessage("Thank you!");
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log('\n[TestClient] ✅ Test completed');
            
        } catch (error) {
            console.error('[TestClient] ❌ Test failed:', error);
        } finally {
            if (this.ws) {
                this.ws.close();
            }
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Run the test
async function main() {
    console.log('🚀 Nova Sonic Direct Mode Test Client');
    console.log('=====================================\n');
    
    const client = new TestClient();
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n[TestClient] 🛑 Stopping test...');
        client.disconnect();
        process.exit(0);
    });
    
    await client.runTest();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TestClient;