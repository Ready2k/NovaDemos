/**
 * Comprehensive Balance Check Tests
 * 
 * Tests:
 * 1. Successful balance check with correct credentials
 * 2. Failed IDV with wrong account number
 * 3. Failed IDV with wrong sort code
 * 4. Verify handoff flow: Triage → IDV → Banking → Triage
 */

const WebSocket = require('ws');

// Test configuration
const GATEWAY_URL = 'ws://localhost:8080/sonic';
const TEST_TIMEOUT = 60000; // 60 seconds

// Test cases
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
        shouldSucceed: false,
        expectedError: 'IDV verification failed'
    },
    {
        name: 'FAILURE: Wrong sort code',
        accountId: '12345678',
        sortCode: '999999',
        expectedBalance: null,
        shouldSucceed: false,
        expectedError: 'IDV verification failed'
    },
    {
        name: 'FAILURE: Both wrong',
        accountId: '99999999',
        sortCode: '999999',
        expectedBalance: null,
        shouldSucceed: false,
        expectedError: 'IDV verification failed'
    }
];

// Track test results
const testResults = [];

// Track handoff flow
let handoffFlow = [];

// Run a single test case
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
        let balanceReceived = null;
        let idvFailed = false;
        let toolCalls = [];
        handoffFlow = [];

        const timeout = setTimeout(() => {
            ws.close();
            resolve({
                testCase: testCase.name,
                passed: false,
                error: 'Test timeout',
                balanceReceived,
                idvFailed,
                toolCalls,
                handoffFlow
            });
        }, TEST_TIMEOUT);

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
                    console.log('✅ Workflow selected: triage');
                    
                    // Send balance check request
                    const requestMessage = `What is the balance for customer ${testCase.accountId} with sort code ${testCase.sortCode}?`;
                    console.log(`📤 Sending: "${requestMessage}"`);
                    
                    ws.send(JSON.stringify({
                        type: 'text_input',
                        text: requestMessage
                    }));
                }

                // Track tool calls
                if (message.type === 'tool_use') {
                    const toolName = message.toolName || message.name;
                    const toolInput = message.input;
                    
                    console.log(`🔧 Tool Called: ${toolName}`);
                    console.log(`   Input: ${JSON.stringify(toolInput)}`);
                    
                    toolCalls.push({
                        tool: toolName,
                        input: toolInput
                    });

                    // Track handoff tools
                    if (toolName && toolName.startsWith('transfer_to_')) {
                        const targetAgent = toolName.replace('transfer_to_', '');
                        handoffFlow.push(`triage → ${targetAgent}`);
                        console.log(`🔄 Handoff: triage → ${targetAgent}`);
                    }

                    // Track IDV check
                    if (toolName === 'perform_idv_check') {
                        console.log(`🔐 IDV Check initiated`);
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

                    console.log(`✅ Tool Result: ${toolName}`);
                    console.log(`   Success: ${success}`);

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

                    // Track return handoff
                    if (toolName === 'return_to_triage') {
                        handoffFlow.push('specialist → triage');
                        console.log(`🔄 Return Handoff: specialist → triage`);
                    }
                }

                // Track handoff requests
                if (message.type === 'handoff_request') {
                    const targetAgent = message.targetAgentId;
                    console.log(`🔄 Handoff Request: → ${targetAgent}`);
                }

                // Check for errors
                if (message.type === 'error') {
                    console.log(`❌ Error: ${message.error || message.message}`);
                }

                // Check for transcript with completion
                if (message.type === 'transcript' && message.text) {
                    const text = message.text.toLowerCase();
                    
                    // Check for completion phrases
                    if (text.includes('anything else') || 
                        text.includes('help you with') ||
                        text.includes('is there anything')) {
                        
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
                            handoffFlow
                        });
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
                handoffFlow
            });
        });

        ws.on('close', () => {
            console.log('🔌 Connection closed');
        });
    });
}

// Run all tests
async function runAllTests() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 COMPREHENSIVE BALANCE CHECK TESTS');
    console.log('='.repeat(80));
    console.log(`Running ${TEST_CASES.length} test cases...`);
    console.log('');

    for (const testCase of TEST_CASES) {
        const result = await runTest(testCase);
        testResults.push(result);
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
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
            console.log(`   ⚠️  No handoffs detected (triage handled everything)`);
        }

        // Show tool calls
        if (result.toolCalls && result.toolCalls.length > 0) {
            const toolNames = result.toolCalls.map(t => t.tool).join(', ');
            console.log(`   Tools Called: ${toolNames}`);
        }

        console.log('');
    });

    console.log('='.repeat(80));
    console.log(`Total: ${testResults.length} | Passed: ${passCount} | Failed: ${failCount}`);
    console.log('='.repeat(80));

    // Check for handoff issues
    const noHandoffs = testResults.filter(r => !r.handoffFlow || r.handoffFlow.length === 0);
    if (noHandoffs.length > 0) {
        console.log('');
        console.log('⚠️  WARNING: Handoff Flow Issue Detected');
        console.log('   Expected: Triage → IDV → Banking → Triage');
        console.log('   Actual: Triage handled everything directly');
        console.log('   This suggests the triage agent is not calling handoff tools.');
    }

    process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
