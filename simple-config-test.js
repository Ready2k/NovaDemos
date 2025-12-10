#!/usr/bin/env node

const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/sonic');

ws.on('open', () => {
    console.log('Connected - sending config...');
    
    const config = {
        type: 'sessionConfig',
        config: {
            systemPrompt: 'Test',
            selectedTools: ['get_server_time']
        }
    };
    
    ws.send(JSON.stringify(config));
    
    setTimeout(() => {
        ws.close();
        process.exit(0);
    }, 3000);
});

ws.on('error', (err) => {
    console.error('Error:', err);
    process.exit(1);
});