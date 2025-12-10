#!/usr/bin/env node

/**
 * Test Client for 100% Native Nova 2 Sonic Tool Capability
 * This test is designed to force native tool use and detect if it's working
 */

const WebSocket = require('ws');

class NativeTestClient {
    constructor() {
        this.ws = null;
        this.sessionId = null;
        this.WS_URL = 'ws://localhost:8080/sonic';
        this.nativeToolUseDetected = false;
        this.heuristicFallbackDetected = false;
        this.spokenJsonDetected = false;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('[NativeTest] Connecting to server...');
            this.ws = new WebSocket(this.WS_URL);

            this.ws.on('open', () => {
                console.log('[NativeTest] ✅ Connected to server');
                resolve();
            });

            this.ws.on('error', (error) => {
                console.error('[NativeTest] ❌ Connection error:', error);
                reject(error);
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code) => {
                console.log(`[NativeTest] 🔌 Disconnected (code: ${code})`);
                this.printTestResults();
            });
        });
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            // Debug: Log all message types
            if (message.type !== 'transcript') {
                console.log(`[NativeTest] DEBUG: Received message type: ${message.type}`);
                if (message.type === 'debugInfo') {
                    console.log(`[NativeTest] DEBUG: debugInfo data:`, JSON.stringify(message.data, null, 2));
                }
            }
            
            switch (message.type) {
                case 'connected':
                    this.sessionId = message.sessionId;
                    console.log(`[NativeTest] 🎯 Session ID: ${this.sessionId}`);
                    break;
                    
                case 'transcript':
                    const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
                    const finalStatus = message.isFinal ? '✓ FINAL' : '⋯ STREAMING';
                    console.log(`[NativeTest] ${role}: "${message.text}" (${finalStatus})`);
                    
                    // Detect indicators of different tool execution methods
                    if (message.role === 'assistant') {
                        this.analyzeAssistantResponse(message.text);
                    }
                    break;
                    
                case 'debugInfo':
                    if (message.data.toolUse) {
                        console.log(`[NativeTest] 🔧 NATIVE TOOL USE DETECTED: ${message.data.toolUse.toolName || message.data.toolUse.name}`);
                        this.nativeToolUseDetected = true;
                    }
                    if (message.data.systemInfo) {
                        console.log(`[NativeTest] 📊 System: ${message.data.systemInfo.mode} - ${message.data.systemInfo.persona}`);
                    }
                    break;
                    
                case 'error':
                    console.error(`[NativeTest] ❌ Error: ${message.message}`);
                    break;
                    
                default:
                    // Ignore other message types for cleaner output
                    break;
            }
        } catch (e) {
            // Ignore binary data (audio)
        }
    }

    analyzeAssistantResponse(text) {
        // Check for spoken JSON (indicates non-native tool use)
        if (text.includes('"name":') || text.includes('get_server_time') || text.includes('json')) {
            console.log(`[NativeTest] ⚠️  SPOKEN JSON DETECTED: Nova Sonic is speaking tool calls instead of executing them natively`);
            this.spokenJsonDetected = true;
        }
        
        // Check for heuristic filler phrases
        const fillerPhrases = [
            'Just checking on that',
            'One moment please',
            'Let me look that up',
            'Checking the system',
            'Hold on a second',
            'Let me check'
        ];
        
        if (fillerPhrases.some(phrase => text.includes(phrase))) {
            console.log(`[NativeTest] ⚠️  HEURISTIC FALLBACK DETECTED: Filler phrase indicates heuristic tool execution`);
            this.heuristicFallbackDetected = true;
        }
    }

    async sendConfig() {
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: `You are a helpful AI assistant with native tool access.

CRITICAL NATIVE TOOL INSTRUCTIONS:
- You have access to the get_server_time tool
- When user asks for time, use the tool NATIVELY (do not speak JSON)
- Execute tools silently and wait for results
- Respond naturally with the tool results

Available tools: get_server_time

IMPORTANT: Do NOT speak tool names, JSON, or say "ACTION". Use native tool execution.`,
                voiceId: 'matthew',
                brainMode: 'raw_nova', // Direct mode for native tools
                selectedTools: ['get_server_time'], // Enable time tool
                userLocation: 'London, UK',
                userTimezone: 'Europe/London'
            }
        };

        console.log('[NativeTest] 📤 Sending native tool configuration...');
        this.ws.send(JSON.stringify(config));
        
        // Wait for config to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async sendTextMessage(text) {
        const message = {
            type: 'textInput',
            text: text
        };

        console.log(`[NativeTest] 📤 Sending: "${text}"`);
        this.ws.send(JSON.stringify(message));
    }

    async runNativeTest() {
        try {
            // Connect
            await this.connect();
            
            // Configure for native tools
            await this.sendConfig();
            
            console.log('\n[NativeTest] 🧪 Starting NATIVE tool test sequence...\n');
            console.log('🔍 Watching for:');
            console.log('  ✅ Native toolUse events (good)');
            console.log('  ❌ Spoken JSON/tool names (bad)');
            console.log('  ❌ Heuristic filler phrases (bad)\n');
            
            // Test 1: Simple greeting to establish baseline
            await this.sendTextMessage("Hello!");
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Test 2: Direct time request (main native tool test)
            console.log('\n[NativeTest] 🕐 Testing NATIVE time tool execution...\n');
            await this.sendTextMessage("What time is it?");
            
            // Wait longer for native tool execution
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            // Test 3: Alternative time request phrasing
            console.log('\n[NativeTest] 🕐 Testing alternative time request...\n');
            await this.sendTextMessage("Can you tell me the current time?");
            
            // Wait for response
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            // Test 4: Follow-up
            await this.sendTextMessage("Thank you!");
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log('\n[NativeTest] ✅ Test sequence completed');
            
        } catch (error) {
            console.error('[NativeTest] ❌ Test failed:', error);
        } finally {
            if (this.ws) {
                this.ws.close();
            }
        }
    }

    printTestResults() {
        console.log('\n' + '='.repeat(60));
        console.log('🧪 NATIVE NOVA 2 SONIC TOOL TEST RESULTS');
        console.log('='.repeat(60));
        
        if (this.nativeToolUseDetected) {
            console.log('✅ NATIVE TOOL USE: Detected native toolUse events');
            console.log('   → Nova 2 Sonic is using tools natively');
        } else {
            console.log('❌ NATIVE TOOL USE: No native toolUse events detected');
            console.log('   → Nova 2 Sonic is NOT using tools natively');
        }
        
        if (this.spokenJsonDetected) {
            console.log('❌ SPOKEN JSON: Nova Sonic spoke tool calls instead of executing them');
            console.log('   → This indicates non-native tool behavior');
        } else {
            console.log('✅ NO SPOKEN JSON: Nova Sonic did not speak tool calls');
        }
        
        if (this.heuristicFallbackDetected) {
            console.log('❌ HEURISTIC FALLBACK: Detected heuristic tool execution');
            console.log('   → System fell back to heuristic detection');
        } else {
            console.log('✅ NO HEURISTIC FALLBACK: No heuristic execution detected');
        }
        
        console.log('\n📊 OVERALL ASSESSMENT:');
        if (this.nativeToolUseDetected && !this.spokenJsonDetected && !this.heuristicFallbackDetected) {
            console.log('🎉 SUCCESS: 100% Native Nova 2 Sonic tool capability achieved!');
        } else if (this.nativeToolUseDetected) {
            console.log('⚠️  PARTIAL: Native tools detected but with some fallback behavior');
        } else {
            console.log('❌ FAILURE: No native tool capability detected - using fallback methods');
        }
        
        console.log('\n💡 RECOMMENDATIONS:');
        if (!this.nativeToolUseDetected) {
            console.log('- Check Nova 2 Sonic model version and tool configuration');
            console.log('- Verify tool format matches AWS Nova Sonic specifications');
            console.log('- Consider if model requires specific prompt engineering for native tools');
        }
        if (this.spokenJsonDetected) {
            console.log('- Adjust system prompt to prevent JSON verbalization');
            console.log('- Check if tool configuration is properly recognized by model');
        }
        if (this.heuristicFallbackDetected) {
            console.log('- Disable heuristic interceptor to force native tool use');
            console.log('- Check why native tools are not being triggered');
        }
        
        console.log('='.repeat(60));
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Run the native test
async function main() {
    console.log('🚀 Nova 2 Sonic NATIVE Tool Capability Test');
    console.log('==========================================\n');
    console.log('This test will determine if Nova 2 Sonic can use tools 100% natively');
    console.log('without falling back to heuristic detection or spoken JSON.\n');
    
    const client = new NativeTestClient();
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n[NativeTest] 🛑 Stopping test...');
        client.disconnect();
        process.exit(0);
    });
    
    await client.runNativeTest();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = NativeTestClient;