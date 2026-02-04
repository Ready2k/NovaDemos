/**
 * Test Handoff Flow
 * Verify that:
 * 1. Triage calls transfer_to_idv
 * 2. IDV agent handles verification
 * 3. IDV calls transfer_to_banking (or return_to_triage if failed)
 * 4. Banking agent handles balance check
 * 5. Banking calls return_to_triage
 */

const WebSocket = require('ws');

const GATEWAY_URL = 'ws://localhost:8080/sonic';
const TEST_ACCOUNT = '12345678';
const TEST_SORTCODE = '112233';

console.log('🧪 Handoff Flow Test');
console.log('===================');
console.log(`Account: ${TEST_ACCOUNT}`);
console.log(`Sort Code: ${TEST_SORTCODE}`);
console.log('');

const ws = new WebSocket(GATEWAY_URL);
let sessionId = null;
const handoffFlow = [];
const toolCalls = [];
const agentMessages = [];

ws.on('open', () => {
    console.log('✅ Connected to Gateway\n');
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        
        // Log all message types for debugging
        if (message.type && message.type !== 'usage') {
            console.log(`📨 Message type: ${message.type}`);
        }

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
            
            const msg = `I need to check my balance. My account is ${TEST_ACCOUNT} and sort code is ${TEST_SORTCODE}`;
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
            
            toolCalls.push({ tool: toolName, input });
            
            console.log(`🔧 Tool: ${toolName}`);
            if (input) {
                console.log(`   Input: ${JSON.stringify(input).substring(0, 100)}`);
            }

            // Track handoffs
            if (toolName && toolName.startsWith('transfer_to_')) {
                const target = toolName.replace('transfer_to_', '');
                handoffFlow.push(`→ ${target}`);
                console.log(`   🔄 HANDOFF: triage → ${target}`);
            } else if (toolName === 'return_to_triage') {
                handoffFlow.push('→ triage (return)');
                console.log(`   🔄 RETURN: → triage`);
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
            console.log('');
        }

        // Track handoff requests (agent-to-agent)
        if (message.type === 'handoff_request') {
            const from = message.fromAgent || 'unknown';
            const to = message.targetAgentId || 'unknown';
            console.log(`🔄 HANDOFF REQUEST: ${from} → ${to}\n`);
            agentMessages.push(`${from} → ${to}`);
        }

        // Track agent responses
        if (message.type === 'transcript' && message.text && !message.text.includes('interrupted')) {
            const text = message.text.replace(/\[DIALECT:.*?\]/g, '').trim();
            if (text && text.length > 10) {
                console.log(`💬 Agent: ${text.substring(0, 100)}...`);
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

// Timeout and summary
setTimeout(() => {
    console.log('\n⏱️  Test timeout reached (20 seconds)');
    console.log('\n' + '='.repeat(60));
    console.log('📊 HANDOFF FLOW ANALYSIS');
    console.log('='.repeat(60));
    console.log('');
    
    console.log('Expected Flow:');
    console.log('  Triage → IDV → Banking → Triage');
    console.log('');
    
    console.log('Actual Flow:');
    if (handoffFlow.length === 0) {
        console.log('  ❌ NO HANDOFFS DETECTED');
        console.log('  ⚠️  Triage agent handled everything directly');
    } else {
        console.log(`  ${handoffFlow.join(' ')}`);
    }
    console.log('');
    
    console.log('Tools Called:');
    if (toolCalls.length === 0) {
        console.log('  None');
    } else {
        toolCalls.forEach((tc, i) => {
            console.log(`  ${i + 1}. ${tc.tool}`);
        });
    }
    console.log('');
    
    console.log('Agent Messages:');
    if (agentMessages.length === 0) {
        console.log('  None (no agent-to-agent handoffs)');
    } else {
        agentMessages.forEach((msg, i) => {
            console.log(`  ${i + 1}. ${msg}`);
        });
    }
    console.log('');
    
    // Analysis
    const hasHandoffTools = toolCalls.some(tc => 
        tc.tool && (tc.tool.startsWith('transfer_to_') || tc.tool === 'return_to_triage')
    );
    
    const hasIDV = toolCalls.some(tc => tc.tool === 'perform_idv_check');
    const hasBalance = toolCalls.some(tc => tc.tool === 'agentcore_balance');
    
    console.log('Analysis:');
    console.log(`  Handoff tools called: ${hasHandoffTools ? '✅ YES' : '❌ NO'}`);
    console.log(`  IDV check performed: ${hasIDV ? '✅ YES' : '❌ NO'}`);
    console.log(`  Balance check performed: ${hasBalance ? '✅ YES' : '❌ NO'}`);
    console.log('');
    
    if (!hasHandoffTools) {
        console.log('⚠️  ISSUE: Triage agent is not calling handoff tools');
        console.log('   The triage agent should call transfer_to_idv or transfer_to_banking');
        console.log('   Instead, it\'s executing tools directly');
    }
    
    console.log('='.repeat(60));
    
    ws.close();
    process.exit(0);
}, 20000); // 20 second timeout
