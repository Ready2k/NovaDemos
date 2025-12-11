#!/usr/bin/env node

const WebSocket = require('ws');

console.log('[2025-12-11T09:21:08.666Z] Starting Internal Duplication Test...');
console.log('This test will send a text message and check for internal duplication within responses');

// Check if server is running
const http = require('http');
const options = {
    hostname: 'localhost',
    port: 8080,
    path: '/',
    method: 'GET',
    timeout: 2000
};

const req = http.request(options, (res) => {
    console.log('✅ Server is running');
    runTest();
});

req.on('error', (err) => {
    console.error('❌ Server is not running. Please start the backend server first.');
    console.error('Run: cd backend && npm start');
    process.exit(1);
});

req.on('timeout', () => {
    console.error('❌ Server connection timeout');
    process.exit(1);
});

req.end();

function runTest() {
    const ws = new WebSocket('ws://localhost:8080');
    let responseCount = 0;
    let testStartTime = Date.now();
    
    ws.on('open', function open() {
        console.log(`[${new Date().toISOString()}] Connected to WebSocket server`);
        
        // Send session configuration
        console.log(`[${new Date().toISOString()}] Sending session configuration...`);
        ws.send(JSON.stringify({
            type: 'session_config',
            config: {
                mode: 'nova_sonic',
                voice: 'Matthew',
                persona: 'default',
                enabledTools: ['agentcore_balance', 'agentcore_transactions']
            }
        }));
        
        // Wait a bit then send a message that might trigger internal duplication
        setTimeout(() => {
            console.log(`[${new Date().toISOString()}] Sending test message...`);
            ws.send(JSON.stringify({
                type: 'text_message',
                text: 'Hello, can you help me with my account?'
            }));
        }, 1000);
    });
    
    ws.on('message', function message(data) {
        try {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === 'transcript' && msg.role === 'assistant' && msg.final) {
                responseCount++;
                console.log(`[${new Date().toISOString()}] Received response ${responseCount}: "${msg.text}"`);
                
                // Check for internal duplication patterns
                const text = msg.text;
                
                // Check for repeated sentences
                const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
                let hasDuplication = false;
                
                if (sentences.length >= 2) {
                    const firstSentence = sentences[0].trim().toLowerCase();
                    const secondSentence = sentences[1].trim().toLowerCase();
                    
                    // Check for similarity or exact match
                    if (firstSentence === secondSentence || 
                        (firstSentence.length > 10 && secondSentence.includes(firstSentence.substring(0, 20)))) {
                        hasDuplication = true;
                        console.log(`[${new Date().toISOString()}] ❌ Internal duplication detected!`);
                        console.log(`[${new Date().toISOString()}] First: "${firstSentence}"`);
                        console.log(`[${new Date().toISOString()}] Second: "${secondSentence}"`);
                    }
                }
                
                // Check for exact substring duplication
                const words = text.split(' ');
                if (words.length >= 4) {
                    const halfLength = Math.floor(words.length / 2);
                    const firstHalf = words.slice(0, halfLength).join(' ');
                    const secondHalf = words.slice(halfLength, halfLength * 2).join(' ');
                    
                    if (firstHalf.length > 10 && firstHalf === secondHalf) {
                        hasDuplication = true;
                        console.log(`[${new Date().toISOString()}] ❌ Exact duplication detected!`);
                        console.log(`[${new Date().toISOString()}] Duplicated part: "${firstHalf}"`);
                    }
                }
                
                if (!hasDuplication) {
                    console.log(`[${new Date().toISOString()}] ✅ No internal duplication detected`);
                }
                
                // End test after first response
                setTimeout(() => {
                    ws.close();
                    
                    console.log(`[${new Date().toISOString()}] `);
                    console.log('=== TEST RESULTS ===');
                    console.log(`[${new Date().toISOString()}] `);
                    console.log(`Total responses: ${responseCount}`);
                    console.log(`Internal duplication found: ${hasDuplication ? 'YES' : 'NO'}`);
                    console.log(`Test duration: ${Date.now() - testStartTime}ms`);
                    console.log(`[${new Date().toISOString()}] `);
                    
                    if (!hasDuplication) {
                        console.log('🎉 TEST PASSED: No internal duplication detected!');
                        process.exit(0);
                    } else {
                        console.log('❌ TEST FAILED: Internal duplication detected!');
                        process.exit(1);
                    }
                }, 1000);
            }
        } catch (error) {
            // Ignore binary audio data and other non-JSON messages
            if (!data.toString().startsWith('�')) {
                console.log(`[${new Date().toISOString()}] Error parsing message: ${error.message.substring(0, 100)}`);
            }
        }
    });
    
    ws.on('error', function error(err) {
        console.error(`[${new Date().toISOString()}] WebSocket error:`, err.message);
        process.exit(1);
    });
    
    ws.on('close', function close() {
        console.log(`[${new Date().toISOString()}] WebSocket connection closed`);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
        console.error(`[${new Date().toISOString()}] Test timeout - no response received`);
        ws.close();
        process.exit(1);
    }, 30000);
}