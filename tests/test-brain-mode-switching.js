#!/usr/bin/env node

const WebSocket = require('ws');

console.log('=== BRAIN MODE SWITCHING TEST ===');
console.log('Testing both raw_nova and bedrock_agent modes...\n');

async function testMode(modeName, expectedIndicator) {
    return new Promise((resolve, reject) => {
        console.log(`🧠 Testing ${modeName} mode...`);
        
        const ws = new WebSocket('ws://localhost:8080/sonic');
        let receivedMessages = [];
        
        ws.on('open', () => {
            console.log(`  ✅ Connected for ${modeName} test`);
            
            ws.send(JSON.stringify({
                type: 'sessionConfig',
                config: {
                    systemPrompt: `Test prompt for ${modeName}`,
                    voiceId: 'matthew',
                    brainMode: modeName,
                    selectedTools: []
                }
            }));
            
            // Close after 2 seconds
            setTimeout(() => {
                ws.close();
                resolve(receivedMessages);
            }, 2000);
        });
        
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                receivedMessages.push(msg);
                console.log(`  📨 Received: ${msg.type}`);
            } catch (error) {
                // Ignore binary audio data
            }
        });
        
        ws.on('error', (err) => {
            console.error(`  ❌ Error in ${modeName} test:`, err.message);
            reject(err);
        });
        
        ws.on('close', () => {
            console.log(`  🔌 ${modeName} test connection closed\n`);
        });
    });
}

async function runTests() {
    try {
        // Test raw_nova mode
        console.log('1️⃣ Testing raw_nova mode (should work normally)');
        await testMode('raw_nova', 'normal operation');
        
        // Wait a moment between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Test bedrock_agent mode
        console.log('2️⃣ Testing bedrock_agent mode (should show Banking Bot messages)');
        await testMode('bedrock_agent', 'Banking Bot greeting');
        
        console.log('✅ BRAIN MODE SWITCHING TEST COMPLETED');
        console.log('📋 Check server logs for:');
        console.log('   - "Switched Brain Mode to: raw_nova"');
        console.log('   - "Switched Brain Mode to: bedrock_agent"');
        console.log('   - "Sending Banking Bot greeting to TTS..." (bedrock_agent only)');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

runTests();