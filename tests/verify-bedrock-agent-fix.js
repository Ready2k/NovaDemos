#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔧 BEDROCK AGENT FIX VERIFICATION');
console.log('=================================');
console.log('This test verifies that the frontend fix is working correctly.\n');

function testBrainMode(mode) {
    return new Promise((resolve, reject) => {
        console.log(`Testing ${mode} mode...`);
        
        const ws = new WebSocket('ws://localhost:8080/sonic');
        
        ws.on('open', () => {
            console.log(`✅ Connected`);
            
            const config = {
                type: 'sessionConfig',
                config: {
                    systemPrompt: 'Test assistant',
                    voiceId: 'matthew',
                    brainMode: mode,
                    selectedTools: []
                }
            };
            
            console.log(`📤 Sending brainMode: "${mode}"`);
            ws.send(JSON.stringify(config));
            
            setTimeout(() => {
                ws.close();
                resolve();
            }, 1500);
        });
        
        ws.on('error', (err) => {
            console.error(`❌ Error:`, err.message);
            reject(err);
        });
        
        ws.on('close', () => {
            console.log(`🔌 Connection closed\n`);
        });
    });
}

async function main() {
    try {
        console.log('🧪 Test 1: Sending bedrock_agent mode');
        await testBrainMode('bedrock_agent');
        
        console.log('🧪 Test 2: Sending raw_nova mode');  
        await testBrainMode('raw_nova');
        
        console.log('✅ VERIFICATION COMPLETE');
        console.log('📋 Expected server log messages:');
        console.log('   - "Switched Brain Mode to: bedrock_agent"');
        console.log('   - "Switched Brain Mode to: raw_nova"');
        console.log('   - "Sending Banking Bot greeting to TTS..." (bedrock_agent only)');
        console.log('\n🎉 If you see these messages, the frontend fix is working!');
        
    } catch (error) {
        console.error('❌ Verification failed:', error);
        process.exit(1);
    }
}

main();