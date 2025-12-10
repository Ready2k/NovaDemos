#!/usr/bin/env node

/**
 * Test Progressive Filler and Caching System
 * 
 * This script tests the new progressive filler system and tool result caching
 * by simulating tool execution scenarios.
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'ws://localhost:8080/sonic';

function loadPrompt(filename) {
    try {
        const PROMPTS_DIR = path.join(__dirname, '../backend/prompts');
        return fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
    } catch (err) {
        console.error(`[ProgressiveTest] Failed to load prompt ${filename}:`, err);
        return 'You are a helpful AI assistant.';
    }
}

async function testProgressiveFiller() {
    console.log('🧪 Testing Progressive Filler and Caching System...\n');
    
    const ws = new WebSocket(SERVER_URL);
    
    ws.on('open', async () => {
        console.log('✅ Connected to server');
        
        // Configure session with tools enabled
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: loadPrompt('core-simple_assistant.txt'),
                selectedTools: ['get_server_time'],
                voiceId: 'matthew',
                brainMode: 'raw_nova'
            }
        };
        
        ws.send(JSON.stringify(config));
        console.log('📝 Sent session configuration');
        
        // Wait for configuration to be processed
        setTimeout(async () => {
            console.log('\n🔧 Test 1: Progressive Filler System');
            console.log('Asking for time to trigger tool execution...');
            
            ws.send(JSON.stringify({
                type: 'textInput',
                text: 'What time is it?'
            }));
            
            // Test 2: Cache hit after 10 seconds
            setTimeout(() => {
                console.log('\n💾 Test 2: Cache Hit Test');
                console.log('Asking for time again to test caching...');
                
                ws.send(JSON.stringify({
                    type: 'textInput',
                    text: 'What is the current time?'
                }));
                
                // Test 3: Interrupted query simulation after 5 seconds
                setTimeout(() => {
                    console.log('\n🔄 Test 3: Interrupted Query Test');
                    console.log('Asking similar question to test interrupted query handling...');
                    
                    ws.send(JSON.stringify({
                        type: 'textInput',
                        text: 'Can you tell me the time please?'
                    }));
                    
                    // Close after final test
                    setTimeout(() => {
                        console.log('\n✅ Tests completed');
                        ws.close();
                    }, 5000);
                }, 5000);
            }, 10000);
        }, 2000);
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'transcript':
                    const role = message.role === 'user' ? '👤 USER' : '🤖 ASSISTANT';
                    const interruptible = message.isInterruptible !== false ? '' : ' (NON-INTERRUPTIBLE)';
                    console.log(`${role}: "${message.text}"${interruptible}`);
                    break;
                    
                case 'debugInfo':
                    if (message.data.toolUse) {
                        console.log(`🛠️ Tool Call: ${message.data.toolUse.name} (ID: ${message.data.toolUse.toolUseId})`);
                    }
                    break;
                    
                case 'connected':
                    console.log(`🔗 Session ID: ${message.sessionId}`);
                    break;
                    
                case 'error':
                    console.error(`❌ Error: ${message.message}`);
                    break;
            }
        } catch (e) {
            // Ignore binary audio data
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', () => {
        console.log('🔌 Connection closed');
        process.exit(0);
    });
}

// Check if server is running
const http = require('http');
http.get('http://localhost:8080/health', (res) => {
    if (res.statusCode === 200) {
        testProgressiveFiller();
    } else {
        console.error('❌ Server health check failed. Is the server running?');
        process.exit(1);
    }
}).on('error', () => {
    console.error('❌ Cannot connect to server. Please start the server first:');
    console.error('   cd backend && npm start');
    process.exit(1);
});