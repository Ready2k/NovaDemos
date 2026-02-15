#!/usr/bin/env node

const WebSocket = require('ws');
const readline = require('readline');

console.log('🧪 Manual A2A Conversation Test');
console.log('================================\n');
console.log('This test lets you manually control the conversation.');
console.log('Type your messages and press Enter. Type "quit" to exit.\n');

const ws = new WebSocket('ws://localhost:8080/sonic');

let sessionId = null;
let waitingForResponse = false;
let lastContentEnd = 0;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

ws.on('open', () => {
    console.log('✅ Connected to gateway\n');
    
    // Select workflow
    ws.send(JSON.stringify({
        type: 'select_workflow',
        workflowId: 'triage'
    }));
    
    console.log('Ready! Type your message:\n');
    promptUser();
});

function promptUser() {
    if (!waitingForResponse) {
        rl.question('👤 YOU: ', (input) => {
            if (input.toLowerCase() === 'quit') {
                console.log('\nClosing connection...');
                ws.close();
                rl.close();
                process.exit(0);
            }
            
            if (input.trim()) {
                waitingForResponse = true;
                ws.send(JSON.stringify({
                    type: 'user_input',
                    text: input
                }));
            } else {
                promptUser();
            }
        });
    }
}

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
            case 'connected':
                sessionId = message.sessionId;
                console.log(`📋 Session: ${sessionId}\n`);
                break;
                
            case 'transcript':
                if (message.role === 'assistant') {
                    console.log(`\n🤖 ASSISTANT: ${message.text}`);
                }
                break;
                
            case 'tool_use':
                console.log(`\n🔧 Tool: ${message.toolName}`);
                console.log(`   Input: ${JSON.stringify(message.input)}`);
                break;
                
            case 'tool_result':
                console.log(`\n✅ Tool Result: ${message.toolName}`);
                if (message.result && message.result.content && message.result.content[0]) {
                    try {
                        const parsed = JSON.parse(message.result.content[0].text);
                        console.log(`   ${JSON.stringify(parsed, null, 2)}`);
                    } catch (e) {
                        console.log(`   ${JSON.stringify(message.result).substring(0, 150)}...`);
                    }
                }
                break;
                
            case 'handoff_event':
                console.log(`\n🔄 Handoff to: ${message.target}`);
                break;
                
            case 'contentEnd':
                // Track when assistant finishes speaking
                lastContentEnd = Date.now();
                // Wait a moment to see if there are more contentEnd events
                setTimeout(() => {
                    if (Date.now() - lastContentEnd >= 500) {
                        waitingForResponse = false;
                        console.log('\n');
                        promptUser();
                    }
                }, 600);
                break;
                
            case 'error':
                console.log(`\n❌ Error: ${message.message}`);
                waitingForResponse = false;
                promptUser();
                break;
        }
        
    } catch (e) {
        // Binary data (audio) - ignore
    }
});

ws.on('error', (error) => {
    console.error('\n❌ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('\n🔌 Connection closed');
    rl.close();
    process.exit(0);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\nClosing connection...');
    ws.close();
    rl.close();
    process.exit(0);
});
