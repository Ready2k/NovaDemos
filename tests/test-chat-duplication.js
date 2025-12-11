#!/usr/bin/env node

/**
 * Test Chat Duplication Fix
 * 
 * This test verifies that Nova Sonic responses are not duplicated/concatenated
 * when sending multiple text inputs in sequence.
 * 
 * Expected behavior: Each response should be independent, not accumulated.
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class ChatDuplicationTest {
    constructor() {
        this.ws = null;
        this.responses = [];
        this.testMessages = [
            "Hello",
            "What's your name?", 
            "Can you help me?"
        ];
        this.currentMessageIndex = 0;
        this.testStartTime = Date.now();
        this.logFile = path.join(__dirname, 'logs', `chat-duplication-test-${Date.now()}.log`);
        
        // Ensure logs directory exists
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);
        fs.appendFileSync(this.logFile, logMessage + '\n');
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.log('Connecting to WebSocket server...');
            this.ws = new WebSocket('ws://localhost:8080/sonic');
            
            this.ws.on('open', () => {
                this.log('Connected to WebSocket server');
                resolve();
            });
            
            this.ws.on('error', (error) => {
                this.log(`WebSocket error: ${error.message}`);
                reject(error);
            });
            
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            
            this.ws.on('close', () => {
                this.log('WebSocket connection closed');
            });
        });
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'transcript' && message.role === 'assistant' && message.isFinal) {
                this.log(`Received response ${this.responses.length + 1}: "${message.text}"`);
                this.responses.push({
                    messageIndex: this.currentMessageIndex - 1,
                    text: message.text,
                    timestamp: Date.now()
                });
                
                // Check for duplication in this response
                this.checkForDuplication(message.text, this.responses.length);
                
                // Send next message after a short delay
                setTimeout(() => {
                    this.sendNextMessage();
                }, 2000);
            }
        } catch (error) {
            this.log(`Error parsing message: ${error.message}`);
        }
    }

    checkForDuplication(responseText, responseNumber) {
        // Check if this response contains text from previous responses
        const previousResponses = this.responses.slice(0, -1);
        
        for (let i = 0; i < previousResponses.length; i++) {
            const prevText = previousResponses[i].text;
            if (responseText.includes(prevText) && prevText.length > 10) {
                this.log(`❌ DUPLICATION DETECTED in response ${responseNumber}!`);
                this.log(`   Current response: "${responseText}"`);
                this.log(`   Contains previous response ${i + 1}: "${prevText}"`);
                return true;
            }
        }
        
        this.log(`✅ Response ${responseNumber} is independent (no duplication detected)`);
        return false;
    }

    async sendSessionConfig() {
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: `You are a helpful assistant. Keep your responses short and different each time. 
                
Rules:
1. Give brief, unique responses to each question
2. Don't repeat previous responses
3. Be conversational but concise`,
                speechPrompt: '',
                voiceId: 'matthew',
                brainMode: 'raw_nova',
                selectedTools: []
            }
        };
        
        this.log('Sending session configuration...');
        this.ws.send(JSON.stringify(config));
        
        // Wait for configuration to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    sendNextMessage() {
        if (this.currentMessageIndex >= this.testMessages.length) {
            this.completeTest();
            return;
        }
        
        const message = this.testMessages[this.currentMessageIndex];
        this.log(`Sending message ${this.currentMessageIndex + 1}: "${message}"`);
        
        this.ws.send(JSON.stringify({
            type: 'textInput',
            text: message
        }));
        
        this.currentMessageIndex++;
    }

    completeTest() {
        this.log('\n=== TEST RESULTS ===');
        
        let duplicationsFound = 0;
        let totalResponses = this.responses.length;
        
        // Final duplication analysis
        for (let i = 0; i < this.responses.length; i++) {
            const currentResponse = this.responses[i];
            
            // Check against all previous responses
            for (let j = 0; j < i; j++) {
                const prevResponse = this.responses[j];
                
                if (currentResponse.text.includes(prevResponse.text) && prevResponse.text.length > 10) {
                    duplicationsFound++;
                    this.log(`❌ Duplication found: Response ${i + 1} contains Response ${j + 1}`);
                    break;
                }
            }
        }
        
        this.log(`\nTotal responses: ${totalResponses}`);
        this.log(`Duplications found: ${duplicationsFound}`);
        this.log(`Test duration: ${Date.now() - this.testStartTime}ms`);
        
        if (duplicationsFound === 0) {
            this.log('\n🎉 TEST PASSED: No response duplication detected!');
            process.exit(0);
        } else {
            this.log('\n❌ TEST FAILED: Response duplication detected!');
            process.exit(1);
        }
    }

    async runTest() {
        try {
            this.log('Starting Chat Duplication Test...');
            await this.connect();
            await this.sendSessionConfig();
            
            // Start sending messages
            this.sendNextMessage();
            
            // Set timeout for test completion
            setTimeout(() => {
                this.log('Test timeout reached');
                this.completeTest();
            }, 30000); // 30 second timeout
            
        } catch (error) {
            this.log(`Test failed with error: ${error.message}`);
            process.exit(1);
        }
    }
}

// Run the test
const test = new ChatDuplicationTest();
test.runTest().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});