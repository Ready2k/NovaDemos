/**
 * Test IDV Retry Logic - 3 Failed Attempts
 * 
 * This test verifies that:
 * 1. User provides wrong account details
 * 2. IDV agent attempts verification (fails)
 * 3. IDV agent asks user to retry
 * 4. User provides wrong details again (2nd attempt fails)
 * 5. IDV agent asks user to retry one more time
 * 6. User provides wrong details again (3rd attempt fails)
 * 7. IDV agent calls return_to_triage with failure status
 * 8. User is returned to triage agent
 */

const WebSocket = require('ws');

// Test configuration
const GATEWAY_URL = 'ws://localhost:8080/sonic';
const TEST_TIMEOUT = 90000; // 90 seconds

// Wrong credentials (will fail IDV)
const WRONG_ACCOUNT_1 = '99999999';
const WRONG_SORTCODE_1 = '999999';
const WRONG_ACCOUNT_2 = '88888888';
const WRONG_SORTCODE_2 = '888888';
const WRONG_ACCOUNT_3 = '77777777';
const WRONG_SORTCODE_3 = '777777';

// Track test state
let sessionId = null;
let idvAttempts = 0;
let returnedToTriage = false;
let testPassed = false;
let retrySent = { attempt1: false, attempt2: false }; // Track which retries have been sent
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
        console.log('🧪 TEST: IDV Retry Logic - 3 Failed Attempts');
        console.log('='.repeat(80));
        console.log('Expected Flow:');
        console.log('1. User provides wrong details → IDV fails (attempt 1/3)');
        console.log('2. IDV asks for retry → User provides wrong details → IDV fails (attempt 2/3)');
        console.log('3. IDV asks for retry → User provides wrong details → IDV fails (attempt 3/3)');
        console.log('4. IDV calls return_to_triage with failure status');
        console.log('5. User returned to triage agent');
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
                    const requestMessage = `I want to check my balance for account ${WRONG_ACCOUNT_1} with sort code ${WRONG_SORTCODE_1}`;
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

                    // Check for IDV failure
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
                                    logEvent({ 
                                        type: 'IDV_VERIFIED', 
                                        message: `Unexpected success: ${idvData.customer_name}` 
                                    });
                                }
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
                    
                    // Check if IDV is asking for retry
                    // CRITICAL: Only send retry once per attempt to avoid duplicates
                    if (text.includes('re-enter') || text.includes('try again') || text.includes('provide') || text.includes('attempt')) {
                        logEvent({ type: 'RETRY_PROMPT', message: `IDV asking for retry (attempt ${idvAttempts}/3)` });
                        
                        // Send next wrong credentials based on attempt count (with delay and deduplication)
                        if (idvAttempts === 1 && !retrySent.attempt1) {
                            retrySent.attempt1 = true;
                            setTimeout(() => {
                                const retryMessage = `My account is ${WRONG_ACCOUNT_2} and sort code is ${WRONG_SORTCODE_2}`;
                                logEvent({ type: 'USER_INPUT', message: retryMessage });
                                ws.send(JSON.stringify({
                                    type: 'text_input',
                                    text: retryMessage
                                }));
                            }, 3000);
                        } else if (idvAttempts === 2 && !retrySent.attempt2) {
                            retrySent.attempt2 = true;
                            setTimeout(() => {
                                const retryMessage = `My account is ${WRONG_ACCOUNT_3} and sort code is ${WRONG_SORTCODE_3}`;
                                logEvent({ type: 'USER_INPUT', message: retryMessage });
                                ws.send(JSON.stringify({
                                    type: 'text_input',
                                    text: retryMessage
                                }));
                            }, 3000);
                        }
                    }
                    
                    // Check for completion (returned to triage)
                    if (returnedToTriage && (text.includes('anything else') || text.includes('help you with'))) {
                        logEvent({ type: 'TEST_COMPLETE', message: 'Returned to triage after 3 failed attempts' });
                        
                        clearTimeout(timeout);
                        ws.close();
                        
                        // Verify test passed
                        if (idvAttempts === 3 && returnedToTriage) {
                            testPassed = true;
                            console.log('\n✅ TEST PASSED');
                            console.log(`   - IDV attempts: ${idvAttempts}/3`);
                            console.log(`   - Returned to triage: ${returnedToTriage}`);
                        } else {
                            console.log('\n❌ TEST FAILED');
                            console.log(`   - IDV attempts: ${idvAttempts}/3 (expected 3)`);
                            console.log(`   - Returned to triage: ${returnedToTriage} (expected true)`);
                        }
                        
                        resolve({
                            passed: testPassed,
                            idvAttempts,
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
