/**
 * Simple Balance Check Test
 * Tests that account details are extracted from the first message
 * and carried through the handoff chain
 */

const WebSocket = require('ws');

const GATEWAY_URL = 'ws://localhost:8080/sonic';
const ACCOUNT = '12345678';
const SORTCODE = '112233';

console.log('🧪 Simple Balance Check Test');
console.log('============================');
console.log(`Account: ${ACCOUNT}`);
console.log(`Sort Code: ${SORTCODE}`);
console.log('');

const ws = new WebSocket(GATEWAY_URL);
let sessionId = null;

ws.on('open', () => {
    console.log('✅ Connected to Gateway\n');
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        
        // Track session
        if (message.type === 'connected' && message.sessionId) {
            sessionId = message.sessionId;
            console.log(`📨 Session: ${sessionId}`);
            
            ws.send(JSON.stringify({
                type: 'select_workflow',
                workflow: 'triage'
            }));
        }

        // Send request after workflow selected
        if (message.type === 'session_start') {
            console.log('✅ Workflow: triage\n');
            
            // Send message with account details
            const msg = `I need to check my balance for account ${ACCOUNT} and sort code ${SORTCODE}`;
            console.log(`📤 Request: "${msg}"\n`);
            
            ws.send(JSON.stringify({
                type: 'text_input',
                text: msg
            }));
        }

        // Track tool calls
        if (message.type === 'tool_use') {
            const toolName = message.toolName || message.name;
            const input = message.input;
            
            console.log(`🔧 Tool: ${toolName}`);
            if (input) {
                console.log(`   Input: ${JSON.stringify(input).substring(0, 150)}`);
            }
            console.log('');
        }

        // Track tool results
        if (message.type === 'tool_result') {
            const toolName = message.toolName;
            const success = message.success;
            
            console.log(`✅ Result: ${toolName} (${success ? 'success' : 'failed'})`);
            
            // Show balance if received
            if (toolName === 'agentcore_balance' && success && message.result) {
                try {
                    const content = message.result.content;
                    if (content && content[0] && content[0].text) {
                        const data = JSON.parse(content[0].text);
                        console.log(`   💰 Balance: £${data.balance}`);
                    }
                } catch (e) {}
            }
            
            // Show IDV result
            if (toolName === 'perform_idv_check' && message.result) {
                try {
                    const content = message.result.content;
                    if (content && content[0] && content[0].text) {
                        const data = JSON.parse(content[0].text);
                        console.log(`   🔐 IDV Status: ${data.auth_status}`);
                        if (data.customer_name) {
                            console.log(`   👤 Customer: ${data.customer_name}`);
                        }
                    }
                } catch (e) {}
            }
            console.log('');
        }

        // Track agent responses
        if (message.type === 'transcript' && message.text && message.isFinal) {
            const text = message.text.replace(/\[DIALECT:.*?\]/g, '').trim();
            if (text && text.length > 10) {
                console.log(`💬 Agent: ${text.substring(0, 120)}${text.length > 120 ? '...' : ''}`);
                console.log('');
            }
        }

    } catch (error) {
        // Ignore parse errors
    }
});

ws.on('error', (error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
});

ws.on('close', () => {
    console.log('\n🔌 Connection closed');
});

// Timeout
setTimeout(() => {
    console.log('\n⏱️  Test complete (30 seconds)');
    ws.close();
    process.exit(0);
}, 30000);
