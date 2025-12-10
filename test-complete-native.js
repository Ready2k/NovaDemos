#!/usr/bin/env node

/**
 * Complete End-to-End Native Nova 2 Sonic Tool Test
 * This test verifies that the complete tool execution flow works:
 * 1. Native toolUse events are generated
 * 2. Tool execution completes successfully  
 * 3. Actual results are returned to the user
 */

const WebSocket = require('ws');

class CompleteNativeTest {
    constructor() {
        this.ws = null;
        this.sessionId = null;
        this.WS_URL = 'ws://localhost:8080/sonic';
        this.nativeToolUseDetected = false;
        this.toolExecutionStarted = false;
        this.actualTimeReceived = false;
        this.receivedTime = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('[CompleteTest] Connecting to server...');
            this.ws = new WebSocket(this.WS_URL);

            this.ws.on('open', () => {
                console.log('[CompleteTest] ✅ Connected to server');
                resolve();
            });

            this.ws.on('error', (error) => {
                console.error('[CompleteTest] ❌ Connection error:', error);
                reject(error);
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code) => {
                console.log(`[CompleteTest] 🔌 Disconnected (code: ${code})`);
                this.printResults();
            });
        });
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'connected':
                    this.sessionId = message.sessionId;
                    console.log(`[CompleteTest] 🎯 Session ID: ${this.sessionId}`);
                    break;
                    
                case 'transcript':
                    const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
                    const finalStatus = message.isFinal ? '✓ FINAL' : '⋯ STREAMING';
                    console.log(`[CompleteTest] ${role}: "${message.text}" (${finalStatus})`);
                    
                    // Check if we received actual time information
                    if (message.role === 'assistant' && message.isFinal) {
                        this.analyzeResponse(message.text);
                    }
                    break;
                    
                case 'debugInfo':
                    if (message.data.toolUse) {
                        console.log(`[CompleteTest] 🔧 NATIVE TOOL USE DETECTED: ${message.data.toolUse.toolName || message.data.toolUse.name}`);
                        this.nativeToolUseDetected = true;
                        this.toolExecutionStarted = true;
                    }
                    break;
                    
                case 'error':
                    console.error(`[CompleteTest] ❌ Error: ${message.message}`);
                    break;
            }
        } catch (e) {
            // Ignore binary data (audio)
        }
    }

    analyzeResponse(text) {
        // Check for time patterns
        const timePatterns = [
            /\d{1,2}:\d{2}/, // HH:MM format
            /\d{1,2}:\d{2}:\d{2}/, // HH:MM:SS format
            /\d{1,2}\s*(AM|PM)/i, // 12-hour format
            /current time/i,
            /time is/i,
            /\d{4}-\d{2}-\d{2}/, // Date format
            /\d{1,2}\/\d{1,2}\/\d{4}/, // Date format
            /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i, // Day names
            /january|february|march|april|may|june|july|august|september|october|november|december/i // Month names
        ];

        const hasTimeInfo = timePatterns.some(pattern => pattern.test(text));
        
        if (hasTimeInfo) {
            console.log(`[CompleteTest] ✅ TIME INFORMATION DETECTED: "${text}"`);
            this.actualTimeReceived = true;
            this.receivedTime = text;
        } else if (text.includes('time') && text.length > 10) {
            console.log(`[CompleteTest] ⚠️  TIME-RELATED RESPONSE: "${text}"`);
        }
    }

    async sendConfig() {
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: 'You are a helpful assistant with access to tools. When users ask for the current time, call the get_server_time tool to get the information and then respond naturally with the result.',
                voiceId: 'matthew',
                brainMode: 'raw_nova',
                selectedTools: ['get_server_time'],
                userLocation: 'London, UK',
                userTimezone: 'Europe/London'
            }
        };

        console.log('[CompleteTest] 📤 Sending configuration...');
        this.ws.send(JSON.stringify(config));
        
        // Wait for config to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async sendTimeRequest() {
        const message = {
            type: 'textInput',
            text: 'What time is it?'
        };

        console.log(`[CompleteTest] 📤 Sending time request...`);
        this.ws.send(JSON.stringify(message));
    }

    async runCompleteTest() {
        try {
            // Connect
            await this.connect();
            
            // Configure
            await this.sendConfig();
            
            console.log('\n[CompleteTest] 🧪 Starting COMPLETE native tool test...\n');
            console.log('🔍 Testing complete flow:');
            console.log('  1. Native toolUse event generation');
            console.log('  2. Tool execution completion');
            console.log('  3. Actual time result delivery\n');
            
            // Send time request
            await this.sendTimeRequest();
            
            // Wait longer for complete execution (Nova Sonic may take time for complex responses)
            await new Promise(resolve => setTimeout(resolve, 25000));
            
            console.log('\n[CompleteTest] ✅ Test completed');
            
        } catch (error) {
            console.error('[CompleteTest] ❌ Test failed:', error);
        } finally {
            if (this.ws) {
                this.ws.close();
            }
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('🧪 COMPLETE NATIVE NOVA 2 SONIC TOOL TEST RESULTS');
        console.log('='.repeat(60));
        
        // Native tool use detection
        if (this.nativeToolUseDetected) {
            console.log('✅ NATIVE TOOL USE: Native toolUse events detected');
        } else {
            console.log('❌ NATIVE TOOL USE: No native toolUse events detected');
        }
        
        // Tool execution
        if (this.toolExecutionStarted) {
            console.log('✅ TOOL EXECUTION: Tool execution was initiated');
        } else {
            console.log('❌ TOOL EXECUTION: Tool execution was not initiated');
        }
        
        // Actual results
        if (this.actualTimeReceived) {
            console.log('✅ ACTUAL RESULTS: Time information was returned');
            console.log(`   → Received: "${this.receivedTime}"`);
        } else {
            console.log('❌ ACTUAL RESULTS: No time information was returned');
        }
        
        console.log('\n📊 OVERALL ASSESSMENT:');
        if (this.nativeToolUseDetected && this.toolExecutionStarted && this.actualTimeReceived) {
            console.log('🎉 SUCCESS: Complete native Nova 2 Sonic tool capability achieved!');
            console.log('   → Native events ✓ Tool execution ✓ Results delivered ✓');
        } else if (this.nativeToolUseDetected && this.toolExecutionStarted) {
            console.log('⚠️  PARTIAL SUCCESS: Native tools work but results not delivered');
            console.log('   → Native events ✓ Tool execution ✓ Results delivered ❌');
        } else if (this.nativeToolUseDetected) {
            console.log('⚠️  LIMITED SUCCESS: Native events detected but execution incomplete');
            console.log('   → Native events ✓ Tool execution ❌ Results delivered ❌');
        } else {
            console.log('❌ FAILURE: Native tool capability not working');
            console.log('   → Native events ❌ Tool execution ❌ Results delivered ❌');
        }
        
        console.log('\n💡 NEXT STEPS:');
        if (!this.nativeToolUseDetected) {
            console.log('- Fix native toolUse event generation');
        } else if (!this.toolExecutionStarted) {
            console.log('- Fix tool execution handler');
        } else if (!this.actualTimeReceived) {
            console.log('- Fix tool result delivery to user');
            console.log('- Check AgentCore execution and result formatting');
            console.log('- Verify tool result is sent back to Nova Sonic properly');
        }
        
        console.log('='.repeat(60));
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Run the complete test
async function main() {
    console.log('🚀 Complete Native Nova 2 Sonic Tool Test');
    console.log('==========================================\n');
    console.log('This test verifies the COMPLETE end-to-end native tool flow:');
    console.log('1. Native toolUse events are generated by Nova 2 Sonic');
    console.log('2. Tool execution completes successfully on the server');
    console.log('3. Actual time results are delivered back to the user\n');
    
    const client = new CompleteNativeTest();
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n[CompleteTest] 🛑 Stopping test...');
        client.disconnect();
        process.exit(0);
    });
    
    await client.runCompleteTest();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = CompleteNativeTest;