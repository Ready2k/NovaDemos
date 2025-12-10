#!/usr/bin/env node

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

function loadPrompt(filename) {
    try {
        const PROMPTS_DIR = path.join(__dirname, '../backend/prompts');
        return fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
    } catch (err) {
        console.error(`[DebugTest] Failed to load prompt ${filename}:`, err);
        return 'You are a helpful AI assistant.';
    }
}

async function testConfig() {
    const ws = new WebSocket('ws://localhost:8080/sonic');
    
    ws.on('open', () => {
        console.log('Connected');
        
        // Send configuration
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: loadPrompt('core-simple_assistant.txt'),
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