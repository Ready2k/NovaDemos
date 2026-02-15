#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🧪 Testing IDV Failure Flow - Invalid Credentials');
console.log('==================================================\n');
console.log('Scenario: User provides invalid account details 3 times\n');
console.log('Expected: IDV agent should handle 3 failed attempts gracefully\n');

const ws = new WebSocket('ws://localhost:8080/sonic');

let sessionId = null;
let messageCount = 0;
let conversationLog = [];
let idvAttempts = 0;
let idvFailures = 0;

ws.on('open', () => {
    console.log('✅ Connected to gateway\n');
    
    // Step 1: Select workflow (triage)
    console.log('📤 Step 1: Selecting triage workflow...');
    ws.send(JSON.stringify({
        type: 'select_workflow',
        workflowId: 'triage'
    }));
    
    // Step 2: Initial request - user wants balance
    setTimeout(() => {
        console.log('📤 Step 2: User: "I need to check my balance"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'I need to check my balance'
        }));
    }, 3000);
    
    // Step 3: Provide INVALID credentials (first attempt)
    setTimeout(() => {
        console.log('📤 Step 3: User: "My account is 12234567 and sort code is 014421" (INVALID - attempt 1)\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'My account is 12234567 and sort code is 014421'
        }));
    }, 15000);
    
    // Step 4: Try again with same INVALID credentials (second attempt)
    setTimeout(() => {
        console.log('📤 Step 4: User: "Let me try again - 12234567 and 014421" (INVALID - attempt 2)\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'Let me try again - 12234567 and 014421'
        }));
    }, 30000);
    
    // Step 5: Final attempt with same INVALID credentials (third attempt)
    setTimeout(() => {
        console.log('📤 Step 5: User: "I\'m sure it\'s 12234567 sort code 014421" (INVALID - attempt 3)\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'I\'m sure it\'s 12234567 sort code 014421'
        }));
    }, 45000);
    
    // Step 6: Try to ask for balance after 3 failures
    setTimeout(() => {
        console.log('📤 Step 6: User: "Can you check my balance anyway?"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'Can you check my balance anyway?'
        }));
    }, 60000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        messageCount++;
        
        // Log important messages
        switch (message.type) {
            case 'connected':
                sessionId = message.sessionId;
                console.log(`   ✅ Session ID: ${sessionId}\n`);
                conversationLog.push({ type: 'system', content: `Connected: ${sessionId}` });
                break;
                
            case 'transcript':
                const speaker = message.role === 'user' ? '👤 USER' : '🤖 ASSISTANT';
                const color = message.role === 'user' ? '\x1b[36m' : '\x1b[32m';
                const reset = '\x1b[0m';
                console.log(`${color}${speaker}: ${message.text}${reset}\n`);
                conversationLog.push({ 
                    type: 'transcript', 
                    role: message.role, 
                    text: message.text,
                    timestamp: new Date().toISOString()
                });
                break;
                
            case 'tool_use':
                console.log(`   🔧 Tool Called: ${message.toolName}`);
                console.log(`   📥 Input: ${JSON.stringify(message.input)}\n`);
                
                if (message.toolName === 'perform_idv_check') {
                    idvAttempts++;
                    console.log(`   📊 IDV Attempt #${idvAttempts}\n`);
                }
                
                conversationLog.push({ 
                    type: 'tool_use', 
                    toolName: message.toolName, 
                    input: message.input 
                });
                break;
                
            case 'tool_result':
                console.log(`   ✅ Tool Result: ${message.toolName}`);
                if (message.result) {
                    try {
                        // Try to parse and pretty print the result
                        let resultData = message.result;
                        if (resultData.content && resultData.content[0] && resultData.content[0].text) {
                            const parsed = JSON.parse(resultData.content[0].text);
                            console.log(`   📊 Result: ${JSON.stringify(parsed, null, 2)}\n`);
                            
                            // Track IDV failures
                            if (message.toolName === 'perform_idv_check' && parsed.auth_status === 'FAILED') {
                                idvFailures++;
                                console.log(`   ❌ IDV FAILED (Failure #${idvFailures})\n`);
                            } else if (message.toolName === 'perform_idv_check' && parsed.auth_status === 'VERIFIED') {
                                console.log(`   ✅ IDV VERIFIED (This should NOT happen with invalid credentials!)\n`);
                            }
                            
                            conversationLog.push({ 
                                type: 'tool_result', 
                                toolName: message.toolName, 
                                result: parsed 
                            });
                        } else {
                            console.log(`   📊 Result: ${JSON.stringify(resultData).substring(0, 200)}...\n`);
                            conversationLog.push({ 
                                type: 'tool_result', 
                                toolName: message.toolName, 
                                result: resultData 
                            });
                        }
                    } catch (e) {
                        console.log(`   📊 Result: ${JSON.stringify(message.result).substring(0, 200)}...\n`);
                    }
                }
                break;
                
            case 'handoff_event':
                console.log(`   🔄 Handoff to: ${message.target}\n`);
                conversationLog.push({ 
                    type: 'handoff', 
                    target: message.target,
                    reason: message.reason 
                });
                break;
                
            case 'error':
                console.log(`   ❌ Error: ${message.message}\n`);
                conversationLog.push({ 
                    type: 'error', 
                    message: message.message 
                });
                break;
        }
        
    } catch (e) {
        // Binary data (audio) - ignore
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('\n' + '='.repeat(60));
    console.log('🔌 Connection closed');
    console.log('='.repeat(60));
    console.log(`\n📊 Test Summary:`);
    console.log(`   Total messages: ${messageCount}`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   IDV Attempts: ${idvAttempts}`);
    console.log(`   IDV Failures: ${idvFailures}`);
    
    // Analyze conversation
    console.log(`\n📝 Conversation Analysis:`);
    
    const transcripts = conversationLog.filter(m => m.type === 'transcript');
    const userMessages = transcripts.filter(m => m.role === 'user').length;
    const assistantMessages = transcripts.filter(m => m.role === 'assistant').length;
    const toolCalls = conversationLog.filter(m => m.type === 'tool_use');
    const handoffs = conversationLog.filter(m => m.type === 'handoff');
    
    console.log(`   User messages: ${userMessages}`);
    console.log(`   Assistant messages: ${assistantMessages}`);
    console.log(`   Tool calls: ${toolCalls.length}`);
    console.log(`   Handoffs: ${handoffs.length}`);
    
    console.log(`\n🔧 Tools Used:`);
    toolCalls.forEach(tool => {
        console.log(`   - ${tool.toolName}: ${JSON.stringify(tool.input)}`);
    });
    
    console.log(`\n🔄 Agent Handoffs:`);
    handoffs.forEach(handoff => {
        console.log(`   → ${handoff.target}${handoff.reason ? ` (${handoff.reason})` : ''}`);
    });
    
    // Check if key objectives were met
    console.log(`\n✅ Test Objectives:`);
    
    const idvCalls = toolCalls.filter(t => t.toolName === 'perform_idv_check');
    const balanceCalls = toolCalls.filter(t => t.toolName === 'agentcore_balance');
    
    console.log(`   ${idvCalls.length === 3 ? '✅' : '❌'} IDV verification attempted 3 times (actual: ${idvCalls.length})`);
    console.log(`   ${idvFailures === 3 ? '✅' : '❌'} All 3 IDV attempts failed (actual: ${idvFailures})`);
    console.log(`   ${balanceCalls.length === 0 ? '✅' : '❌'} No balance check performed (user not verified)`);
    
    // Check if agent handled failures gracefully
    const failureMessages = transcripts.filter(m => 
        m.role === 'assistant' && 
        (m.text.toLowerCase().includes('unable to verify') || 
         m.text.toLowerCase().includes('couldn\'t verify') ||
         m.text.toLowerCase().includes('try again') ||
         m.text.toLowerCase().includes('three attempts'))
    );
    
    console.log(`   ${failureMessages.length > 0 ? '✅' : '❌'} Agent communicated failures to user`);
    
    // Check if session ended or returned to triage after 3 failures
    const returnedToTriage = handoffs.some(h => h.target === 'triage');
    const sessionEnded = transcripts.some(m => 
        m.role === 'assistant' && 
        (m.text.toLowerCase().includes('contact customer support') ||
         m.text.toLowerCase().includes('end this verification'))
    );
    
    console.log(`   ${returnedToTriage || sessionEnded ? '✅' : '❌'} Session handled after 3 failures (returned to triage or ended)`);
    
    // Check that user was NOT routed to banking
    const routedToBanking = handoffs.some(h => h.target === 'banking');
    console.log(`   ${!routedToBanking ? '✅' : '❌'} User NOT routed to banking (correct - not verified)`);
    
    console.log('\n' + '='.repeat(60));
    
    // Final verdict
    const allTestsPassed = 
        idvCalls.length === 3 &&
        idvFailures === 3 &&
        balanceCalls.length === 0 &&
        !routedToBanking;
    
    if (allTestsPassed) {
        console.log('\n✅ ALL TESTS PASSED - IDV failure handling works correctly!');
    } else {
        console.log('\n⚠️  SOME TESTS FAILED - Review results above');
    }
    
    console.log('='.repeat(60) + '\n');
    process.exit(0);
});

// Auto-close after 75 seconds
setTimeout(() => {
    console.log('\n⏱️  Test timeout (75s) - closing connection');
    ws.close();
}, 75000);
