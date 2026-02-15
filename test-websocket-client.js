#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🧪 Testing A2A System - WebSocket Client');
console.log('=========================================\n');

const ws = new WebSocket('ws://localhost:8080/sonic');

let sessionId = null;
let messageCount = 0;

ws.on('open', () => {
    console.log('✅ Connected to gateway\n');
    
    // Step 1: Select workflow (triage)
    console.log('📤 Step 1: Selecting triage workflow...');
    ws.send(JSON.stringify({
        type: 'select_workflow',
        workflowId: 'triage'
    }));
    
    // Step 2: Send initial message after a delay
    setTimeout(() => {
        console.log('📤 Step 2: Sending message: "I need to check my balance"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'I need to check my balance'
        }));
    }, 2000);
    
    // Step 3: Provide credentials after agent asks
    setTimeout(() => {
        console.log('📤 Step 3: Providing credentials: "account 12345678 sort code 112233"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'account 12345678 sort code 112233'
        }));
    }, 8000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        messageCount++;
        
        console.log(`📥 Message ${messageCount}: ${message.type}`);
        
        switch (message.type) {
            case 'connected':
                sessionId = message.sessionId;
                console.log(`   Session ID: ${sessionId}`);
                break;
                
            case 'transcript':
                console.log(`   ${message.role}: ${message.text}`);
                if (message.sentiment !== undefined) {
                    console.log(`   Sentiment: ${message.sentiment}`);
                }
                break;
                
            case 'tool_use':
                console.log(`   🔧 Tool: ${message.toolName}`);
                console.log(`   Input: ${JSON.stringify(message.input)}`);
                break;
                
            case 'tool_result':
                console.log(`   ✅ Tool Result: ${message.toolName}`);
                if (message.result) {
                    const resultStr = JSON.stringify(message.result).substring(0, 200);
                    console.log(`   Result: ${resultStr}...`);
                }
                break;
                
            case 'handoff_event':
                console.log(`   🔄 Handoff to: ${message.target}`);
                break;
                
            case 'workflow_update':
                console.log(`   📊 Workflow: ${message.currentNode}`);
                break;
                
            case 'error':
                console.log(`   ❌ Error: ${message.message}`);
                break;
                
            default:
                // Don't log every message type to keep output clean
                break;
        }
        console.log('');
        
    } catch (e) {
        // Binary data (audio) - ignore
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('\n🔌 Connection closed');
    console.log(`📊 Total messages received: ${messageCount}`);
    process.exit(0);
});

// Auto-close after 30 seconds
setTimeout(() => {
    console.log('\n⏱️  Test timeout - closing connection');
    ws.close();
}, 30000);
