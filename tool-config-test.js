#!/usr/bin/env node

const WebSocket = require('ws');

async function testToolConfig() {
    const ws = new WebSocket('ws://localhost:8080/sonic');
    
    ws.on('open', () => {
        console.log('Connected');
        
        // Send configuration with tools
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: 'You are a helpful assistant. Use tools when needed.',
                voiceId: 'matthew',
                brainMode: 'raw_nova',
                selectedTools: ['get_server_time']
            }
        };
        
        console.log('Sending config with selectedTools:', config.config.selectedTools);
        ws.send(JSON.stringify(config));
        
        // Wait a moment then send a time request
        setTimeout(() => {
            const textMessage = {
                type: 'textInput',
                text: 'What time is it?'
            };
            console.log('Sending time request...');
            ws.send(JSON.stringify(textMessage));
        }, 2000);
        
        // Close after 10 seconds
        setTimeout(() => {
            ws.close();
        }, 10000);
    });
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'debugInfo' && msg.data.toolUse) {
                console.log('🔧 TOOL USE EVENT:', msg.data.toolUse);
            } else if (msg.type === 'transcript') {
                console.log(`${msg.role}: "${msg.text}" (${msg.isFinal ? 'FINAL' : 'STREAMING'})`);
            }
        } catch (e) {
            // Binary data
        }
    });
    
    ws.on('close', () => {
        console.log('Disconnected');
        process.exit(0);
    });
}

testToolConfig();