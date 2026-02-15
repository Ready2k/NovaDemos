#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🧪 Testing IDV Flow - Detailed');
console.log('================================\n');

const ws = new WebSocket('ws://localhost:8080/sonic');

let sessionId = null;

ws.on('open', () => {
    console.log('✅ Connected to gateway\n');
    
    // Step 1: Select workflow (triage)
    console.log('📤 Step 1: Selecting triage workflow...');
    ws.send(JSON.stringify({
        type: 'select_workflow',
        workflowId: 'triage'
    }));
    
    // Step 2: Send initial message
    setTimeout(() => {
        console.log('📤 Step 2: Sending: "I need to check my balance"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'I need to check my balance'
        }));
    }, 2000);
    
    // Step 3: Wait for IDV agent to ask for credentials (15 seconds)
    setTimeout(() => {
        console.log('📤 Step 3: Providing credentials: "account 12345678 sort code 112233"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'account 12345678 sort code 112233'
        }));
    }, 15000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
            case 'connected':
                sessionId = message.sessionId;
                console.log(`🔗 Connected - Session: ${sessionId}\n`);
                break;
                
            case 'transcript':
                console.log(`💬 ${message.role}: "${message.text}"`);
                break;
                
            case 'tool_use':
                console.log(`🔧 Tool Call: ${message.toolName}`);
                console.log(`   Input: ${JSON.stringify(message.input)}`);
                break;
                
            case 'tool_result':
                console.log(`✅ Tool Result: ${message.toolName}`);
                if (message.result && typeof message.result === 'object') {
                    const resultStr = JSON.stringify(message.result).substring(0, 150);
                    console.log(`   ${resultStr}...`);
                }
                break;
                
            case 'handoff_event':
                console.log(`\n🔄 HANDOFF to: ${message.target}\n`);
                break;
                
            case 'handoff_request':
                console.log(`📨 Handoff Request Sent`);
                break;
                
            case 'error':
                console.log(`❌ Error: ${message.message}`);
                break;
        }
        
    } catch (e) {
        // Binary data - ignore
    }
});

ws.on('error', (error) => {
    console.error('\n❌ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('\n🔌 Connection closed');
    process.exit(0);
});

// Auto-close after 25 seconds
setTimeout(() => {
    console.log('\n⏱️  Test complete - closing');
    ws.close();
}, 25000);
