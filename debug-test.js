#!/usr/bin/env node

const WebSocket = require('ws');

async function testConfig() {
    const ws = new WebSocket('ws://localhost:8080/sonic');
    
    ws.on('open', () => {
        console.log('Connected');
        
        // Send configuration
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: 'Test prompt',
                voiceId: 'matthew',
                brainMode: 'raw_nova',
                selectedTools: ['get_server_time']
            }
        };
        
        console.log('Sending config:', JSON.stringify(config, null, 2));
        ws.send(JSON.stringify(config));
        
        setTimeout(() => {
            ws.close();
        }, 2000);
    });
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            console.log('Received:', msg);
        } catch (e) {
            // Binary data
        }
    });
    
    ws.on('close', () => {
        console.log('Disconnected');
        process.exit(0);
    });
}

testConfig();