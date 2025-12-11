#!/usr/bin/env node

const WebSocket = require('ws');

console.log('[2025-12-11T09:30:00.000Z] Starting Balance Duplication Test...');
console.log('This test reproduces the exact scenario you experienced with balance requests');

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
    let responses = [];
    
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
        
        // Wait a bit then send the first message
        setTimeout(() => {
            console.log(`[${new Date().toISOString()}] Sending message 1: "Hello"`);
            ws.send(JSON.stringify({
                type: 'text_message',
                text: 'Hello'
            }));
        }, 1000);
    });
    
    ws.on('message', function message(data) {
        try {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === 'transcript' && msg.role === 'assistant' && msg.final) {
                responseCount++;
                responses.push(msg.text);
                console.log(`[${new Date().toISOString()}] Received response ${responseCount}: "${msg.text}"`);
                
                // After first response, ask for balance (this should trigger duplication)
                if (responseCount === 1) {
                    setTimeout(() => {
                        console.log(`[${new Date().toISOString()}] Sending message 2: "sure i want to know my current balance"`);
                        ws.send(JSON.stringify({
                            type: 'text_message',
                            text: 'sure i want to know my current balance'
                        }));
                    }, 2000);
                }
                
                // After second response, analyze for duplication
                if (responseCount === 2) {
                    setTimeout(() => {
                        analyzeResponses(responses);
                        ws.close();
                    }, 1000);
                }
            }
        } catch (error) {
            // Ignore binary audio data and other non-JSON messages
            if (!data.toString().startsWith('�')) {
                console.log(`[${new Date().toISOString()}] Error parsing message: ${error.message.substring(0, 100)}`);
            }
        }
    });
    
    function analyzeResponses(responses) {
        console.log(`[${new Date().toISOString()}] `);
        console.log('=== ANALYZING RESPONSES FOR DUPLICATION ===');
        console.log(`[${new Date().toISOString()}] `);
        
        if (responses.length < 2) {
            console.log('❌ TEST FAILED: Not enough responses received');
            process.exit(1);
        }
        
        const firstResponse = responses[0];
        const secondResponse = responses[1];
        
        console.log(`Response 1: "${firstResponse}"`);
        console.log(`Response 2: "${secondResponse}"`);
        console.log(`[${new Date().toISOString()}] `);
        
        // Check if the first response appears at the beginning of the second response
        let hasCrossResponseDuplication = false;
        let hasInternalDuplication = false;
        
        // Cross-response duplication check
        if (secondResponse.includes(firstResponse)) {
            hasCrossResponseDuplication = true;
            console.log(`❌ CROSS-RESPONSE DUPLICATION DETECTED!`);
            console.log(`The first response appears within the second response.`);
        }
        
        // Internal duplication check (within second response)
        const sentences = secondResponse.split(/[.!?]+/).filter(s => s.trim().length > 5);
        if (sentences.length >= 2) {
            for (let i = 0; i < sentences.length - 1; i++) {
                const current = sentences[i].trim().toLowerCase();
                const next = sentences[i + 1].trim().toLowerCase();
                
                if (current.length > 10 && next.length > 10) {
                    // Check for similarity or missing punctuation
                    if (current === next || secondResponse.includes(current + next)) {
                        hasInternalDuplication = true;
                        console.log(`❌ INTERNAL DUPLICATION DETECTED!`);
                        console.log(`Sentence ${i + 1}: "${current}"`);
                        console.log(`Sentence ${i + 2}: "${next}"`);
                        break;
                    }
                }
            }
        }
        
        // Check for missing spaces between sentences
        if (secondResponse.match(/[.!?][A-Z]/)) {
            hasInternalDuplication = true;
            console.log(`❌ MISSING PUNCTUATION/SPACE DETECTED!`);
            console.log(`Found pattern like "sentence.NextSentence" without proper spacing`);
        }
        
        console.log(`[${new Date().toISOString()}] `);
        console.log('=== TEST RESULTS ===');
        console.log(`Total responses: ${responses.length}`);
        console.log(`Cross-response duplication: ${hasCrossResponseDuplication ? 'YES' : 'NO'}`);
        console.log(`Internal duplication: ${hasInternalDuplication ? 'YES' : 'NO'}`);
        console.log(`Test duration: ${Date.now() - testStartTime}ms`);
        console.log(`[${new Date().toISOString()}] `);
        
        if (!hasCrossResponseDuplication && !hasInternalDuplication) {
            console.log('🎉 TEST PASSED: No duplication detected!');
            process.exit(0);
        } else {
            console.log('❌ TEST FAILED: Duplication detected!');
            process.exit(1);
        }
    }
    
    ws.on('error', function error(err) {
        console.error(`[${new Date().toISOString()}] WebSocket error:`, err.message);
        process.exit(1);
    });
    
    ws.on('close', function close() {
        console.log(`[${new Date().toISOString()}] WebSocket connection closed`);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
        console.error(`[${new Date().toISOString()}] Test timeout - not enough responses received`);
        ws.close();
        process.exit(1);
    }, 30000);
}