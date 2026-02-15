#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🧪 Testing A2A System - Realistic Human Conversation');
console.log('====================================================\n');
console.log('Scenario: User forgets sort code, makes typo, then asks follow-up questions\n');

const ws = new WebSocket('ws://localhost:8080/sonic');

let sessionId = null;
let messageCount = 0;
let conversationLog = [];

// Track conversation state
let state = 'initial';

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
        console.log('📤 Step 2: User: "Hi, I need to check my balance please"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'Hi, I need to check my balance please'
        }));
        state = 'requested_balance';
    }, 3000);
    
    // Step 3: Provide account but say forgot sort code (wait for IDV agent to respond)
    setTimeout(() => {
        console.log('📤 Step 3: User: "My account is 12345678 but I\'ve forgotten my sort code, give me a moment"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'My account is 12345678 but I\'ve forgotten my sort code, give me a moment'
        }));
        state = 'forgot_sortcode';
    }, 15000);
    
    // Step 4: Provide wrong sort code (transposition error) - wait for agent to process
    setTimeout(() => {
        console.log('📤 Step 4: User: "Ok found it, it\'s 121233" (WRONG - transposed digits)\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'Ok found it, it\'s 121233'
        }));
        state = 'wrong_sortcode_1';
    }, 30000);
    
    // Step 5: Try again with another error - wait for IDV failure response
    setTimeout(() => {
        console.log('📤 Step 5: User: "Oh wait, let me check again... 112323" (STILL WRONG)\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'Oh wait, let me check again... 112323'
        }));
        state = 'wrong_sortcode_2';
    }, 45000);
    
    // Step 6: Finally get it right - wait for second IDV failure
    setTimeout(() => {
        console.log('📤 Step 6: User: "Sorry, I was reading it wrong. It\'s 112233" (CORRECT)\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'Sorry, I was reading it wrong. It\'s 112233'
        }));
        state = 'correct_credentials';
    }, 60000);
    
    // Step 7: Ask for name after authentication - wait for successful verification and handoff to banking
    setTimeout(() => {
        console.log('📤 Step 7: User: "What\'s my name on the account?"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'What\'s my name on the account?'
        }));
        state = 'asking_name';
    }, 80000);
    
    // Step 8: Ask about spending in November - wait for name response
    setTimeout(() => {
        console.log('📤 Step 8: User: "How much did I spend last November?"\n');
        ws.send(JSON.stringify({
            type: 'user_input',
            text: 'How much did I spend last November?'
        }));
        state = 'asking_november_spending';
    }, 95000);
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
                    target: message.target 
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
        console.log(`   → ${handoff.target}`);
    });
    
    // Check if key objectives were met
    console.log(`\n✅ Test Objectives:`);
    
    const idvCalls = toolCalls.filter(t => t.toolName === 'perform_idv_check');
    const balanceCalls = toolCalls.filter(t => t.toolName === 'agentcore_balance');
    const transactionCalls = toolCalls.filter(t => t.toolName === 'get_account_transactions');
    
    console.log(`   ${idvCalls.length > 0 ? '✅' : '❌'} IDV verification attempted (${idvCalls.length} times)`);
    console.log(`   ${balanceCalls.length > 0 ? '✅' : '❌'} Balance check performed`);
    console.log(`   ${transactionCalls.length > 0 ? '✅' : '❌'} Transaction history retrieved`);
    
    // Check for expected failures and retries
    const idvResults = conversationLog.filter(m => m.type === 'tool_result' && m.toolName === 'perform_idv_check');
    const failedIdv = idvResults.filter(r => r.result && r.result.auth_status === 'FAILED').length;
    const successIdv = idvResults.filter(r => r.result && r.result.auth_status === 'VERIFIED').length;
    
    console.log(`   ${failedIdv >= 2 ? '✅' : '❌'} IDV failures handled (${failedIdv} failures)`);
    console.log(`   ${successIdv > 0 ? '✅' : '❌'} IDV eventually succeeded`);
    
    // Check if name was provided
    const nameProvided = conversationLog.some(m => 
        m.type === 'transcript' && 
        m.role === 'assistant' && 
        (m.text.toLowerCase().includes('sarah') || m.text.toLowerCase().includes('jones'))
    );
    console.log(`   ${nameProvided ? '✅' : '❌'} Customer name provided (Sarah Jones)`);
    
    // Check if November spending was addressed
    const novemberAddressed = conversationLog.some(m => 
        m.type === 'transcript' && 
        m.role === 'assistant' && 
        m.text.toLowerCase().includes('november')
    );
    console.log(`   ${novemberAddressed ? '✅' : '❌'} November spending query addressed`);
    
    console.log('\n' + '='.repeat(60));
    process.exit(0);
});

// Auto-close after 120 seconds (2 minutes)
setTimeout(() => {
    console.log('\n⏱️  Test timeout (120s) - closing connection');
    ws.close();
}, 120000);
