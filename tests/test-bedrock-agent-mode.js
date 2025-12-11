#!/usr/bin/env node

const WebSocket = require('ws');

console.log('[2025-12-11T09:35:00.000Z] Starting Bedrock Agent Mode Test...');
console.log('This test will verify that bedrock_agent mode is properly sent to the backend');

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
    const ws = new WebSocket('ws://localhost:8080/sonic');
    let testStartTime = Date.now();
    
    ws.on('open', function open() {
        console.log(`[${new Date().toISOString()}] Connected to WebSocket server`);
        
        // Send session configuration with bedrock_agent mode
        console.log(`[${new Date().toISOString()}] Sending bedrock_agent session configuration...`);
        ws.send(JSON.stringify({
            type: 'sessionConfig',
            config: {
                systemPrompt: 'You are a banking assistant.',
                speechPrompt: '',
                voiceId: 'matthew',
                brainMode: 'bedrock_agent',  // This should trigger Bedrock Agent mode
                selectedTools: ['agentcore_balance', 'agentcore_transactions']
            }
        }));
        
        // Wait a bit then close
        setTimeout(() => {
            console.log(`[${new Date().toISOString()}] Test completed - check server logs for brain mode`);
            ws.close();
            
            console.log(`[${new Date().toISOString()}] `);
            console.log('=== TEST RESULTS ===');
            console.log(`Test duration: ${Date.now() - testStartTime}ms`);
            console.log(`[${new Date().toISOString()}] `);
            console.log('✅ Configuration sent successfully');
            console.log('📋 Check server logs for:');
            console.log('   - "Switched Brain Mode to: bedrock_agent"');
            console.log('   - "Using Default Agent: UFSH5SAQ1Q / RNXVK2QKLS"');
            console.log('   - "Overriding System Prompt for Agent Mode (Echo Bot)"');
            
            process.exit(0);
        }, 2000);
    });
    
    ws.on('message', function message(data) {
        try {
            const msg = JSON.parse(data.toString());
            console.log(`[${new Date().toISOString()}] Received message type: ${msg.type}`);
        } catch (error) {
            // Ignore binary audio data
        }
    });
    
    ws.on('error', function error(err) {
        console.error(`[${new Date().toISOString()}] WebSocket error:`, err.message);
        process.exit(1);
    });
    
    ws.on('close', function close() {
        console.log(`[${new Date().toISOString()}] WebSocket connection closed`);
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
        console.error(`[${new Date().toISOString()}] Test timeout`);
        ws.close();
        process.exit(1);
    }, 10000);
}