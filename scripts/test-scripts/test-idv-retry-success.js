/**
 * Test IDV Retry Logic - Success on Retry
 * 
 * This test verifies that:
 * 1. User provides wrong account details
 * 2. IDV agent attempts verification (fails)
 * 3. IDV agent asks user to retry
 * 4. User provides CORRECT details (2nd attempt succeeds)
 * 5. IDV agent transfers to banking agent
 * 6. Banking agent retrieves balance
 * 7. Banking agent returns to triage
 */

const WebSocket = require('ws');

// Test configuration
const GATEWAY_URL = 'ws://localhost:8080/sonic';
const TEST_TIMEOUT = 90000; // 90 seconds

// Credentials
const WRONG_ACCOUNT = '99999999';
const WRONG_SORTCODE = '999999';
const CORRECT_ACCOUNT = '12345678';
const CORRECT_SORTCODE = '112233';
const EXPECTED_BALANCE = 1200.0;

// Track test state
let sessionId = null;
let idvAttempts = 0;
let idvVerified = false;
let balanceReceived = null;
let returnedToTriage = false;
let testPassed = false;
let retryMessageSent = false; // Flag to prevent duplicate retry messages
let initialMessageSent = false; // Flag to prevent duplicate initial messages

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
        console.log('🧪 TEST: IDV Retry Logic - Success on Retry');
        console.log('='.repeat(80));
        console.log('Expected Flow:');
        console.log('1. User provides wrong details → IDV fails (attempt 1/3)');
        console.log('2. IDV asks for retry → User provides CORRECT details → IDV succeeds (attempt 2/3)');
        console.log('3. IDV transfers to banking agent');
        console.log('4. Banking agent retrieves balance (£1200)');
        console.log('5. Banking agent returns to triage');
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
                if (message.type === 'session_start' && !initialMessageSent) {
                    logEvent({ type: 'WORKFLOW', message: 'Triage workflow selected' });
                    initialMessageSent = true;
                    
                    // Send initial request with WRONG credentials
                    const requestMessage = `I want to check my balance for account ${WRONG_ACCOUNT} with sort code ${WRONG_SORTCODE}`;
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

                    // Track IDV checks
                    if (toolName === 'perform_idv_check') {
                        idvAttempts++;
                        logEvent({ 
                            type: 'IDV_ATTEMPT', 
                            message: `Attempt ${idvAttempts}/3 - Account: ${toolInput.accountNumber}, Sort Code: ${toolInput.sortCode}` 
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
                                if (idvData.auth_status === 'FAILED') {
                                    logEvent({ 
                                        type: 'IDV_FAILED', 
                                        message: `Attempt ${idvAttempts}/3 failed: ${idvData.message}` 
                                    });
                                } else if (idvData.auth_status === 'VERIFIED') {
                                    idvVerified = true;
                                    logEvent({ 
                                        type: 'IDV_VERIFIED', 
                                        message: `Attempt ${idvAttempts}/3 succeeded: ${idvData.customer_name}` 
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

                // Track transcript for retry prompts
                if (message.type === 'transcript' && message.text) {
                    const text = message.text.toLowerCase();
                    
                    // Check if IDV is asking for retry (after first failure)
                    // CRITICAL: Only send retry once per attempt to avoid duplicates
                    if (!idvVerified && idvAttempts === 1 && !retryMessageSent && (text.includes('re-enter') || text.includes('try again') || text.includes('provide') || text.includes('attempt'))) {
                        logEvent({ type: 'RETRY_PROMPT', message: 'IDV asking for retry after first failure' });
                        retryMessageSent = true;
                        
                        // Send CORRECT credentials this time (with delay)
                        setTimeout(() => {
                            const retryMessage = `My account is ${CORRECT_ACCOUNT} and sort code is ${CORRECT_SORTCODE}`;
                            logEvent({ type: 'USER_INPUT', message: retryMessage });
                            ws.send(JSON.stringify({
                                type: 'text_input',
                                text: retryMessage
                            }));
                        }, 3000);
                    }
                    
                    // Check for completion (returned to triage)
                    if (returnedToTriage && (text.includes('anything else') || text.includes('help you with'))) {
                        logEvent({ type: 'TEST_COMPLETE', message: 'Returned to triage after successful balance check' });
                        
                        clearTimeout(timeout);
                        ws.close();
                        
                        // Verify test passed
                        if (idvAttempts === 2 && idvVerified && balanceReceived === EXPECTED_BALANCE && returnedToTriage) {
                            testPassed = true;
                            console.log('\n✅ TEST PASSED');
                            console.log(`   - IDV attempts: ${idvAttempts}/3 (1 failed, 1 succeeded)`);
                            console.log(`   - IDV verified: ${idvVerified}`);
                            console.log(`   - Balance received: £${balanceReceived}`);
                            console.log(`   - Returned to triage: ${returnedToTriage}`);
                        } else {
                            console.log('\n❌ TEST FAILED');
                            console.log(`   - IDV attempts: ${idvAttempts}/3 (expected 2)`);
                            console.log(`   - IDV verified: ${idvVerified} (expected true)`);
                            console.log(`   - Balance received: £${balanceReceived} (expected £${EXPECTED_BALANCE})`);
                            console.log(`   - Returned to triage: ${returnedToTriage} (expected true)`);
                        }
                        
                        resolve({
                            passed: testPassed,
                            idvAttempts,
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
    console.log(`IDV Attempts: ${result.idvAttempts || 0}/3`);
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
