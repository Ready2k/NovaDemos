#!/usr/bin/env node

const WebSocket = require('ws');

console.log('Testing bedrock_agent mode...');

const ws = new WebSocket('ws://localhost:8080/sonic');

ws.on('open', function open() {
    console.log('✅ Connected to WebSocket server');
    
    // Send session configuration with bedrock_agent mode
    const config = {
        type: 'sessionConfig',
        config: {
            systemPrompt: 'You are a banking assistant.',
            speechPrompt: '',
            voiceId: 'matthew',
            brainMode: 'bedrock_agent',  // This should trigger Bedrock Agent mode
            selectedTools: []
        }
    };
    
    console.log('📤 Sending config:', JSON.stringify(config, null, 2));
    ws.send(JSON.stringify(config));
    
    // Close after 2 seconds
    setTimeout(() => {
        console.log('✅ Test completed - check server logs for "Switched Brain Mode to: bedrock_agent"');
        ws.close();
        process.exit(0);
    }, 2000);
});

ws.on('message', function message(data) {
    try {
        const msg = JSON.parse(data.toString());
        console.log(`📨 Received: ${msg.type}`);
    } catch (error) {
        // Ignore binary audio data
    }
});

ws.on('error', function error(err) {
    console.error('❌ WebSocket error:', err.message);
    process.exit(1);
});

ws.on('close', function close() {
    console.log('🔌 WebSocket connection closed');
});