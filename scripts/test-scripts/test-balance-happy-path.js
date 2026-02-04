/**
 * Test Balance Check - Happy Path
 * 
 * This test verifies the complete flow with CORRECT credentials:
 * 1. User provides correct account details
 * 2. Triage routes to IDV
 * 3. IDV verifies successfully (first attempt)
 * 4. IDV transfers to banking
 * 5. Banking retrieves balance (£1200)
 * 6. Banking returns to triage
 */

const WebSocket = require('ws');

// Test configuration
const GATEWAY_URL = 'ws://localhost:8080/sonic';
const TEST_TIMEOUT = 60000; // 60 seconds

// CORRECT credentials
const CORRECT_ACCOUNT = '12345678';
const CORRECT_SORTCODE = '112233';
const EXPECTED_BALANCE = 1200.0;

// Track test state
let sessionId = null;
let idvVerified = false;
let balanceReceived = null;
let returnedToTriage = false;
let testPassed = false;

// Track events
const events = [];

function logEvent(event) {
    const timestamp = new Date().toISOString();
    events.push({ timestamp, ...event });
    console.log(`[${timestamp}] ${event.type}: ${event.message}`);
}

// Run test
async function runTest() {
    return new Promise((resolve, reject) => {
        console.log('\n' + '='.repeat(80));
        console.log('🧪 TEST: Balance Check - Happy Path (Correct Credentials)');
        console.log('='.repeat(80));
        console.log('Expected Flow:');
        console.log('1. User provides CORRECT details (12345678, 112233)');
        console.log('2. Triage routes to IDV');
        console.log('3. IDV verifies successfully (first attempt)');
        console.log('4. IDV transfers to banking');
        console.log('5. Banking retrieves balance (£1200)');
        console.log('6. Banking returns to triage');
        console.log('='.repeat(80));
        console.log('');

        const ws = new WebSocket(GATEWAY_URL);

        const timeout = setTimeout(() => {
            ws.close();
            resolve({
                passed: false,
                error: 'Test timeout',
                events
            });
        }, TEST_TIMEOUT);

        ws.on('open', () => {
            logEvent({ type: 'CONNECTION', message: 'Connected to Gateway' });
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());

                // Track session ID
                if (message.type === 'connected' && message.sessionId) {
                    sessionId = message.sessionId;
                    logEvent({ type: 'SESSION', message: `Session ID: ${sessionId}` });
                    
                    // Select triage workflow
                    ws.send(JSON.stringify({
                        type: 'select_workflow',
                        workflow: 'triage'
                    }));
                }

                // Track workflow selection
                if (message.type === 'session_start') {
                    logEvent({ type: 'WORKFLOW', message: 'Triage workflow selected' });
                    
                    // Send request with CORRECT credentials
                    const requestMessage = `I want to check my balance for account ${CORRECT_ACCOUNT} with sort code ${CORRECT_SORTCODE}`;
                    logEvent({ type: 'USER_INPUT', message: requestMessage });
                    
                    ws.send(JSON.stringify({
                        type: 'text_input',
                        text: requestMessage
                    }));
                }

                // Track tool calls
                if (message.type === 'tool_use') {
                    const toolName = message.toolName || message.name;
                    const toolInput = message.input;
                    
                    logEvent({ 
                        type: 'TOOL_CALL', 
                        message: `${toolName} - ${JSON.stringify(toolInput)}` 
                    });

                    // Track IDV check
                    if (toolName === 'perform_idv_check') {
                        logEvent({ 
                            type: 'IDV_CHECK', 
                            message: `Account: ${toolInput.accountNumber}, Sort Code: ${toolInput.sortCode}` 
                        });
                    }

                    // Track balance check
                    if (toolName === 'agentcore_balance') {
                        logEvent({ type: 'BALANCE_CHECK', message: 'Banking agent checking balance' });
                    }

                    // Track return to triage
                    if (toolName === 'return_to_triage') {
                        returnedToTriage = true;
                        logEvent({ 
                            type: 'RETURN_TO_TRIAGE', 
                            message: `Task: ${toolInput.taskCompleted}, Summary: ${toolInput.summary}` 
                        });
                    }
                }

                // Track tool results
                if (message.type === 'tool_result') {
                    const toolName = message.toolName;
                    const success = message.success;
                    const result = message.result;

                    // Check for IDV result
                    if (toolName === 'perform_idv_check') {
                        if (result && result.content && result.content[0]) {
                            try {
                                const idvData = JSON.parse(result.content[0].text);
                                if (idvData.auth_status === 'VERIFIED') {
                                    idvVerified = true;
                                    logEvent({ 
                                        type: 'IDV_VERIFIED', 
                                        message: `Customer: ${idvData.customer_name}` 
                                    });
                                } else if (idvData.auth_status === 'FAILED') {
                                    logEvent({ 
                                        type: 'IDV_FAILED', 
                                        message: `Unexpected failure: ${idvData.message}` 
                                    });
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
                                logEvent({ 
                                    type: 'BALANCE_RECEIVED', 
                                    message: `Balance: £${balanceData.balance}` 
                                });
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                    }
                }

                // Track handoff requests
                if (message.type === 'handoff_request') {
                    const targetAgent = message.targetAgentId;
                    logEvent({ type: 'HANDOFF', message: `Handoff to ${targetAgent}` });
                }

                // Track transcript for completion
                if (message.type === 'transcript' && message.text) {
                    const text = message.text.toLowerCase();
                    
                    // Check for completion - either return to triage OR balance confirmation
                    const hasReturnedToTriage = returnedToTriage && (text.includes('anything else') || text.includes('help you with'));
                    const hasBalanceConfirmation = balanceReceived && (text.includes('balance') || text.includes('£') || text.includes('1200'));
                    
                    if (hasReturnedToTriage || hasBalanceConfirmation) {
                        logEvent({ type: 'TEST_COMPLETE', message: hasReturnedToTriage ? 'Returned to triage' : 'Balance confirmed' });
                        
                        clearTimeout(timeout);
                        ws.close();
                        
                        // Verify test passed - balance is the key success criterion
                        if (idvVerified && balanceReceived === EXPECTED_BALANCE) {
                            testPassed = true;
                            console.log('\n✅ TEST PASSED');
                            console.log(`   - IDV verified: ${idvVerified}`);
                            console.log(`   - Balance received: £${balanceReceived}`);
                            console.log(`   - Returned to triage: ${returnedToTriage} (optional)`);
                        } else {
                            console.log('\n❌ TEST FAILED');
                            console.log(`   - IDV verified: ${idvVerified} (expected true)`);
                            console.log(`   - Balance received: £${balanceReceived} (expected £${EXPECTED_BALANCE})`);
                            console.log(`   - Returned to triage: ${returnedToTriage} (optional)`);
                        }
                        
                        resolve({
                            passed: testPassed,
                            idvVerified,
                            balanceReceived,
                            returnedToTriage,
                            events
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
                passed: false,
                error: error.message,
                events
            });
        });

        ws.on('close', () => {
            logEvent({ type: 'CONNECTION', message: 'Connection closed' });
        });
    });
}

// Run test
runTest().then(result => {
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`IDV Verified: ${result.idvVerified || false}`);
    console.log(`Balance Received: £${result.balanceReceived || 'N/A'}`);
    console.log(`Returned to Triage: ${result.returnedToTriage || false}`);
    if (result.error) {
        console.log(`Error: ${result.error}`);
    }
    console.log('='.repeat(80));
    
    process.exit(result.passed ? 0 : 1);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
