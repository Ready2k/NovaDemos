#!/usr/bin/env node

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

function loadPrompt(filename) {
    try {
        const PROMPTS_DIR = path.join(__dirname, '../backend/prompts');
        return fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
    } catch (err) {
        console.error(`[ToolConfigTest] Failed to load prompt ${filename}:`, err);
        return 'You are a helpful AI assistant.';
    }
}

async function testToolConfig() {
    const ws = new WebSocket('ws://localhost:8080/sonic');
    
    ws.on('open', () => {
        console.log('Connected');
        
        // Send configuration with tools
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: loadPrompt('core-simple_assistant.txt'),
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