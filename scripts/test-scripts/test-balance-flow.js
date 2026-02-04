/**
 * Balance Check Flow Test
 * 
 * Tests the complete handoff flow:
 * 1. User asks triage for balance
 * 2. Triage hands off to IDV
 * 3. IDV asks for credentials
 * 4. User provides credentials
 * 5. IDV verifies and hands off to Banking
 * 6. Banking checks balance
 * 7. Banking returns to Triage
 */

const WebSocket = require('ws');

const GATEWAY_URL = 'ws://localhost:8080/sonic';

// Test configuration
const TEST_CASES = [
    {
        name: 'SUCCESS: Correct credentials',
        accountId: '12345678',
        sortCode: '112233',
        expectedBalance: 1200.0,
        shouldSucceed: true
    },
    {
        name: 'FAILURE: Wrong account number',
        accountId: '99999999',
        sortCode: '112233',
        expectedBalance: null,
        shouldSucceed: false
    }
];

async function runTest(testCase) {
    return new Promise((resolve, reject) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🧪 TEST: ${testCase.name}`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Account ID: ${testCase.accountId}`);
        console.log(`Sort Code: ${testCase.sortCode}`);
        console.log(`Expected: ${testCase.shouldSucceed ? 'SUCCESS' : 'FAILURE'}`);
        console.log('');

        const ws = new WebSocket(GATEWAY_URL);
        let sessionId = null;
        let currentAgent = 'triage';
        let balanceReceived = null;
        let idvFailed = false;
        let idvAskedForCredentials = false;
        const toolCalls = [];
        const handoffFlow = [];
        const agentResponses = [];

        const timeout = setTimeout(() => {
            console.log('\n⏱️  Test timeout reached');
            ws.close();
            resolve({
                testCase: testCase.name,
                passed: false,
                error: 'Test timeout',
                balanceReceived,
                idvFailed,
                toolCalls,
                handoffFlow,
                agentResponses
            });
        }, 45000); // 45 second timeout

        ws.on('open', () => {
            console.log('✅ Connected to Gateway');
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());

                // Track session ID
                if (message.type === 'connected' && message.sessionId) {
                    sessionId = message.sessionId;
                    console.log(`📨 Session ID: ${sessionId}`);
                    
                    // Select workflow
                    ws.send(JSON.stringify({
                        type: 'select_workflow',
                        workflow: 'triage'
                    }));
                }

                // Track workflow selection
                if (message.type === 'session_start') {
                    console.log(`✅ Workflow selected: ${currentAgent}`);
                    
                    // Only send initial message if we're starting with triage
                    if (currentAgent === 'triage') {
                        const requestMessage = `I need to check my balance`;
                        console.log(`📤 Sending to ${currentAgent}: "${requestMessage}"`);
                        
                        ws.send(JSON.stringify({
                            type: 'text_input',
                            text: requestMessage
                        }));
                    }
                }

                // Track tool calls
                if (message.type === 'tool_use') {
                    const toolName = message.toolName || message.name;
                    const toolInput = message.input;
                    
                    console.log(`🔧 Tool Called by ${currentAgent}: ${toolName}`);
                    
                    toolCalls.push({
                        agent: currentAgent,
                        tool: toolName,
                        input: toolInput
                    });

                    // Track handoff tools
                    if (toolName && toolName.startsWith('transfer_to_')) {
                        const targetAgent = toolName.replace('transfer_to_', '');
                        handoffFlow.push(`${currentAgent} → ${targetAgent}`);
                        console.log(`🔄 Handoff: ${currentAgent} → ${targetAgent}`);
                        currentAgent = targetAgent;
                    } else if (toolName === 'return_to_triage') {
                        handoffFlow.push(`${currentAgent} → triage`);
                        console.log(`🔄 Return: ${currentAgent} → triage`);
                        currentAgent = 'triage';
                    }

                    // Track IDV check
                    if (toolName === 'perform_idv_check') {
                        console.log(`🔐 IDV Check initiated with account: ${toolInput.accountNumber}`);
                    }

                    // Track balance check
                    if (toolName === 'agentcore_balance') {
                        console.log(`💰 Balance Check initiated`);
                    }
                }

                // Track tool results
                if (message.type === 'tool_result') {
                    const toolName = message.toolName;
                    const result = message.result;
                    const success = message.success;

                    console.log(`✅ Tool Result: ${toolName} (${success ? 'success' : 'failed'})`);

                    // Check for IDV failure
                    if (toolName === 'perform_idv_check') {
                        if (result && result.content && result.content[0]) {
                            try {
                                const idvData = JSON.parse(result.content[0].text);
                                if (idvData.auth_status === 'FAILED') {
                                    idvFailed = true;
                                    console.log(`❌ IDV FAILED: ${idvData.message || 'Verification failed'}`);
                                } else if (idvData.auth_status === 'VERIFIED') {
                                    console.log(`✅ IDV VERIFIED: ${idvData.customer_name}`);
                                }
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                    }

                    // Check for balance result
                    if (toolName === 'agentcore_balance' && success) {
                        if (result && result.content && result.content[0]) {
                            try {
                                const balanceData = JSON.parse(result.content[0].text);
                                balanceReceived = balanceData.balance;
                                console.log(`💰 Balance Received: £${balanceData.balance}`);
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                    }
                }

                // Track agent responses
                if (message.type === 'transcript' && message.text && message.isFinal) {
                    const text = message.text.replace(/\[DIALECT:.*?\]/g, '').trim();
                    
                    if (text && text.length > 10) {
                        console.log(`💬 ${currentAgent}: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
                        agentResponses.push({
                            agent: currentAgent,
                            text: text
                        });
                        
                        // Check if IDV is asking for credentials
                        if (currentAgent === 'idv' && 
                            (text.toLowerCase().includes('account number') || 
                             text.toLowerCase().includes('authentication') ||
                             text.toLowerCase().includes('verify'))) {
                            
                            if (!idvAskedForCredentials) {
                                idvAskedForCredentials = true;
                                console.log(`📤 Providing credentials to IDV: ${testCase.accountId}, ${testCase.sortCode}`);
                                
                                // Send credentials to IDV
                                setTimeout(() => {
                                    ws.send(JSON.stringify({
                                        type: 'text_input',
                                        text: `My account number is ${testCase.accountId} and sort code is ${testCase.sortCode}`
                                    }));
                                }, 1000);
                            }
                        }
                        
                        // Check for completion phrases from triage
                        if (currentAgent === 'triage' && 
                            (text.toLowerCase().includes('anything else') || 
                             text.toLowerCase().includes('help you with'))) {
                            
                            console.log(`\n📊 Test Complete - Analyzing Results...`);
                            
                            clearTimeout(timeout);
                            ws.close();
                            
                            // Determine if test passed
                            let passed = false;
                            let error = null;

                            if (testCase.shouldSucceed) {
                                // Success case: should have balance
                                if (balanceReceived === testCase.expectedBalance) {
                                    passed = true;
                                    console.log(`✅ TEST PASSED: Balance matches expected (£${testCase.expectedBalance})`);
                                } else {
                                    error = `Expected balance £${testCase.expectedBalance}, got ${balanceReceived}`;
                                    console.log(`❌ TEST FAILED: ${error}`);
                                }
                            } else {
                                // Failure case: should have IDV failure
                                if (idvFailed) {
                                    passed = true;
                                    console.log(`✅ TEST PASSED: IDV failed as expected`);
                                } else if (balanceReceived !== null) {
                                    error = 'Expected IDV to fail, but balance was retrieved';
                                    console.log(`❌ TEST FAILED: ${error}`);
                                } else {
                                    error = 'IDV failure not detected';
                                    console.log(`❌ TEST FAILED: ${error}`);
                                }
                            }

                            resolve({
                                testCase: testCase.name,
                                passed,
                                error,
                                balanceReceived,
                                idvFailed,
                                toolCalls,
                                handoffFlow,
                                agentResponses
                            });
                        }
                    }
                }

            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
            clearTimeout(timeout);
            resolve({
                testCase: testCase.name,
                passed: false,
                error: error.message,
                balanceReceived,
                idvFailed,
                toolCalls,
                handoffFlow,
                agentResponses
            });
        });

        ws.on('close', () => {
            console.log('🔌 Connection closed');
        });
    });
}

async function runAllTests() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 BALANCE CHECK FLOW TESTS');
    console.log('='.repeat(80));
    console.log(`Running ${TEST_CASES.length} test cases...`);
    console.log('');

    const testResults = [];

    for (const testCase of TEST_CASES) {
        const result = await runTest(testCase);
        testResults.push(result);
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log('');

    let passCount = 0;
    let failCount = 0;

    testResults.forEach((result, index) => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${index + 1}. ${status}: ${result.testCase}`);
        
        if (result.passed) {
            passCount++;
        } else {
            failCount++;
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
        }

        // Show handoff flow
        if (result.handoffFlow && result.handoffFlow.length > 0) {
            console.log(`   Handoff Flow: ${result.handoffFlow.join(' → ')}`);
        } else {
            console.log(`   ⚠️  No handoffs detected`);
        }

        // Show tool calls by agent
        if (result.toolCalls && result.toolCalls.length > 0) {
            const toolsByAgent = {};
            result.toolCalls.forEach(tc => {
                if (!toolsByAgent[tc.agent]) {
                    toolsByAgent[tc.agent] = [];
                }
                toolsByAgent[tc.agent].push(tc.tool);
            });
            
            Object.keys(toolsByAgent).forEach(agent => {
                console.log(`   ${agent}: ${toolsByAgent[agent].join(', ')}`);
            });
        }

        console.log('');
    });

    console.log('='.repeat(80));
    console.log(`Total: ${testResults.length} | Passed: ${passCount} | Failed: ${failCount}`);
    console.log('='.repeat(80));

    process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
