/**
 * Success Test - Complete Balance Check Flow
 * Tests the full flow with correct credentials
 */

const WebSocket = require('ws');

const GATEWAY_URL = 'ws://localhost:8080/sonic';
const ACCOUNT = '12345678';
const SORTCODE = '112233';
const EXPECTED_BALANCE = 1200.0;

console.log('🧪 SUCCESS Test - Complete Balance Check');
console.log('=========================================');
console.log(`Account: ${ACCOUNT}`);
console.log(`Sort Code: ${SORTCODE}`);
console.log(`Expected Balance: £${EXPECTED_BALANCE}`);
console.log('');

const ws = new WebSocket(GATEWAY_URL);
let sessionId = null;
let balanceReceived = null;
let idvVerified = false;
const toolCalls = [];
const handoffs = [];

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
            console.log('✅ Workflow selected\n');
            
            // Only send initial message to triage
            if (toolCalls.length === 0) {
                const msg = `I need to check my balance for account ${ACCOUNT} and sort code ${SORTCODE}`;
                console.log(`📤 Request: "${msg}"\n`);
                
                ws.send(JSON.stringify({
                    type: 'text_input',
                    text: msg
                }));
            }
        }

        // Track tool calls
        if (message.type === 'tool_use') {
            const toolName = message.toolName || message.name;
            const input = message.input;
            
            toolCalls.push(toolName);
            
            console.log(`🔧 Tool: ${toolName}`);
            if (input && Object.keys(input).length > 0) {
                console.log(`   Input: ${JSON.stringify(input).substring(0, 150)}`);
            }
            
            // Track handoffs
            if (toolName.startsWith('transfer_to_')) {
                const target = toolName.replace('transfer_to_', '');
                handoffs.push(target);
                console.log(`   🔄 Handoff → ${target}`);
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
                        balanceReceived = data.balance;
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
                        if (data.auth_status === 'VERIFIED') {
                            idvVerified = true;
                            console.log(`   🔐 IDV Status: ${data.auth_status}`);
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
                console.log(`💬 Agent: ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}`);
                console.log('');
                
                // Check for completion
                if (text.toLowerCase().includes('anything else') || 
                    text.toLowerCase().includes('help you with')) {
                    console.log('📊 TEST COMPLETE - Analyzing Results...\n');
                    
                    console.log('='.repeat(60));
                    console.log('RESULTS');
                    console.log('='.repeat(60));
                    console.log(`IDV Verified: ${idvVerified ? '✅ YES' : '❌ NO'}`);
                    console.log(`Balance Received: ${balanceReceived !== null ? '✅ YES' : '❌ NO'}`);
                    if (balanceReceived !== null) {
                        console.log(`Balance Value: £${balanceReceived}`);
                        console.log(`Expected: £${EXPECTED_BALANCE}`);
                        console.log(`Match: ${balanceReceived === EXPECTED_BALANCE ? '✅ YES' : '❌ NO'}`);
                    }
                    console.log(`\nHandoff Flow: ${handoffs.join(' → ')}`);
                    console.log(`Tools Called: ${toolCalls.join(', ')}`);
                    console.log('='.repeat(60));
                    
                    const passed = idvVerified && balanceReceived === EXPECTED_BALANCE;
                    console.log(`\n${passed ? '✅ TEST PASSED' : '❌ TEST FAILED'}\n`);
                    
                    ws.close();
                    process.exit(passed ? 0 : 1);
                }
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
    console.log('\n⏱️  Test timeout (45 seconds)');
    console.log('\n📊 PARTIAL RESULTS:');
    console.log(`IDV Verified: ${idvVerified ? '✅ YES' : '❌ NO'}`);
    console.log(`Balance Received: ${balanceReceived !== null ? '✅ YES' : '❌ NO'}`);
    console.log(`Handoff Flow: ${handoffs.join(' → ')}`);
    console.log(`Tools Called: ${toolCalls.join(', ')}`);
    
    ws.close();
    process.exit(1);
}, 45000);
