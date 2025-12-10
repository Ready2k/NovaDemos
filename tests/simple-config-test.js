#!/usr/bin/env node

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

function loadPrompt(filename) {
    try {
        const PROMPTS_DIR = path.join(__dirname, '../backend/prompts');
        return fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
    } catch (err) {
        console.error(`[SimpleConfigTest] Failed to load prompt ${filename}:`, err);
        return 'You are a helpful AI assistant.';
    }
}

const ws = new WebSocket('ws://localhost:8080/sonic');

ws.on('open', () => {
    console.log('Connected - sending config...');
    
    const config = {
        type: 'sessionConfig',
        config: {
            systemPrompt: loadPrompt('core-simple_assistant.txt'),
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