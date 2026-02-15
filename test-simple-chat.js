/**
 * Simple Chat Test - Direct WebSocket to Gateway
 * Tests the full flow: Browser → Gateway → Triage Agent
 */

const WebSocket = require('ws');

async function test() {
    console.log('[Test] Connecting to gateway...');
    
    const ws = new WebSocket('ws://localhost:8080/sonic');
    
    ws.on('open', () => {
        console.log('[Test] ✅ Connected to gateway');
        
        // Select workflow
        console.log('[Test] → Selecting triage workflow');
        ws.send(JSON.stringify({
            type: 'select_workflow',
            workflowId: 'triage'
        }));
        
        // Wait for connection, then send message
        setTimeout(() => {
            console.log('[Test] → Sending text message');
            ws.send(JSON.stringify({
                type: 'text_input',
                text: 'I need to check my balance'
            }));
        }, 3000);
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'connected') {
                console.log(`[Test] ← Connected, sessionId: ${message.sessionId}`);
            } else if (message.type === 'transcript') {
                console.log(`[Test] ← Transcript (${message.role}): "${message.text}"`);
            } else if (message.type === 'tool_use') {
                console.log(`[Test] ← Tool use: ${message.toolName}`);
            } else if (message.type === 'tool_result') {
                console.log(`[Test] ← Tool result: ${message.toolName} ${message.success ? '✅' : '❌'}`);
            } else if (message.type === 'handoff_event') {
                console.log(`[Test] ← Handoff to: ${message.target}`);
            } else if (message.type === 'error') {
                console.log(`[Test] ← ERROR: ${message.message}`);
            } else {
                console.log(`[Test] ← ${message.type}`);
            }
        } catch (e) {
            // Binary or non-JSON
        }
    });
    
    ws.on('error', (error) => {
        console.error('[Test] ❌ WebSocket error:', error.message);
    });
    
    ws.on('close', (code, reason) => {
        console.log(`[Test] Connection closed: code=${code}, reason=${reason?.toString() || 'none'}`);
        process.exit(0);
    });
    
    // Keep alive for 30 seconds
    setTimeout(() => {
        console.log('[Test] Test complete, closing...');
        ws.close();
    }, 30000);
}

test().catch(console.error);
