#!/usr/bin/env node

/**
 * ID&V Retry Flow Test
 * 
 * Tests identity verification retry scenarios:
 * 1. User provides wrong details 3 times → should fail and handoff
 * 2. User provides wrong details, then corrects on 2nd/3rd attempt → should pass
 * 3. User provides correct details first time → should pass immediately
 */

const WebSocket = require('ws');

// Test configuration
const GATEWAY_URL = 'ws://localhost:8080/sonic';
const TEST_TIMEOUT = 120000; // 2 minutes per test

// Test credentials
const VALID_ACCOUNT = '11111111';
const VALID_SORTCODE = '111111';
const INVALID_ACCOUNT = '99999999';
const INVALID_SORTCODE = '000000';

// Color codes for output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    log('\n' + '='.repeat(80), 'cyan');
    log(`  ${title}`, 'bright');
    log('='.repeat(80), 'cyan');
}

function logStep(step, message) {
    log(`\n[Step ${step}] ${message}`, 'blue');
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠ ${message}`, 'yellow');
}

/**
 * Test Scenario 1: User provides wrong details 3 times
 */
async function testThreeFailedAttempts() {
    logSection('TEST 1: Three Failed IDV Attempts');
    
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(GATEWAY_URL);
        let attemptCount = 0;
        let receivedFailureHandoff = false;
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Test timeout'));
        }, TEST_TIMEOUT);

        ws.on('open', () => {
            logStep(1, 'Connected to gateway');
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                // Handle initial connection
                if (message.type === 'connected' && message.sessionId) {
                    logSuccess(`Session ID: ${message.sessionId}`);
                    
                    // Select IDV workflow
                    ws.send(JSON.stringify({
                        type: 'select_workflow',
                        workflow: 'idv'
                    }));
                }
                
                // Start conversation after workflow selected
                if (message.type === 'session_start') {
                    logSuccess('IDV workflow selected');
                    
                    setTimeout(() => {
                        logStep(2, 'Requesting balance check (requires IDV)');
                        ws.send(JSON.stringify({
                            type: 'text_input',
                            text: 'I want to check my balance'
                        }));
                    }, 1000);
                }
                
                // Log agent responses
                if (message.type === 'agent_response' || message.type === 'text_delta') {
                    if (message.text || message.delta) {
                        const text = message.text || message.delta;
                        log(`Agent: ${text}`, 'magenta');
                        
                        // Check if asking for credentials
                        if (text.toLowerCase().includes('account number') || 
                            text.toLowerCase().includes('sort code')) {
                            attemptCount++;
                            logStep(2 + attemptCount, `Attempt ${attemptCount}: Providing INVALID credentials`);
                            
                            setTimeout(() => {
                                ws.send(JSON.stringify({
                                    type: 'text_input',
                                    text: `Account ${INVALID_ACCOUNT}, sort code ${INVALID_SORTCODE}`
                                }));
                            }, 500);
                        }
                        
                        // Check for failure messages
                        if (text.toLowerCase().includes('unable to verify') ||
                            text.toLowerCase().includes('contact customer support')) {
                            logSuccess(`Agent indicated verification failure after ${attemptCount} attempts`);
                        }
                    }
                }
                
                // Check for tool calls
                if (message.type === 'tool_use') {
                    const toolName = message.toolName || message.name;
                    log(`Tool Called: ${toolName}`, 'yellow');
                    if (toolName === 'perform_idv_check' && message.input) {
                        log(`  Account: ${message.input.accountNumber}`, 'yellow');
                        log(`  Sort Code: ${message.input.sortCode}`, 'yellow');
                    }
                }
                
                // Check for tool results
                if (message.type === 'tool_result') {
                    const toolName = message.toolName;
                    log(`Tool Result: ${toolName}`, 'yellow');
                    if (toolName === 'perform_idv_check' && message.result) {
                        try {
                            const content = message.result.content;
                            if (content && content[0] && content[0].text) {
                                const data = JSON.parse(content[0].text);
                                log(`  Auth Status: ${data.auth_status}`, 'yellow');
                                if (data.auth_status === 'FAILED') {
                                    logWarning(`IDV attempt ${attemptCount} failed (expected)`);
                                }
                            }
                        } catch (e) {
                            log(`  Raw result: ${JSON.stringify(message.result)}`, 'yellow');
                        }
                    }
                }
                
                // Check for handoff
                if (message.type === 'handoff') {
                    log(`Handoff: ${JSON.stringify(message, null, 2)}`, 'cyan');
                    
                    if (message.targetAgent === 'triage' && 
                        (message.reason?.includes('verification_failed') || 
                         message.reason?.includes('unable to verify'))) {
                        receivedFailureHandoff = true;
                        logSuccess('✓ Received handoff to triage after failed verification');
                        
                        clearTimeout(timeout);
                        ws.close();
                        
                        if (attemptCount >= 2) {
                            logSuccess(`TEST 1 PASSED: Failed after ${attemptCount} attempts and handed off correctly`);
                            resolve({ passed: true, attempts: attemptCount });
                        } else {
                            logError(`TEST 1 FAILED: Only ${attemptCount} attempts before handoff (expected 2-3)`);
                            resolve({ passed: false, attempts: attemptCount });
                        }
                    }
                }
                
            } catch (err) {
                logError(`Error parsing message: ${err.message}`);
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            logError(`WebSocket error: ${error.message}`);
            reject(error);
        });

        ws.on('close', () => {
            clearTimeout(timeout);
            if (!receivedFailureHandoff) {
                logError('TEST 1 FAILED: Connection closed without proper handoff');
                resolve({ passed: false, attempts: attemptCount });
            }
        });
    });
}

/**
 * Test Scenario 2: User corrects mistake on second attempt
 */
async function testCorrectionOnSecondAttempt() {
    logSection('TEST 2: Correction on Second Attempt');
    
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(GATEWAY_URL);
        let attemptCount = 0;
        let receivedSuccessHandoff = false;
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Test timeout'));
        }, TEST_TIMEOUT);

        ws.on('open', () => {
            logStep(1, 'Connected to gateway');
            
            const initMessage = {
                type: 'session.start',
                sessionId: `test-idv-correction-${Date.now()}`,
                persona: 'idv',
                mode: 'chat',
                config: {
                    voice: 'stephen'
                }
            };
            
            ws.send(JSON.stringify(initMessage));
            logSuccess('Session started with IDV persona');
            
            setTimeout(() => {
                logStep(2, 'Requesting balance check (requires IDV)');
                ws.send(JSON.stringify({
                    type: 'user.message',
                    text: 'I want to check my balance'
                }));
            }, 1000);
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                if (message.type === 'agent.response') {
                    log(`Agent: ${message.text}`, 'magenta');
                    
                    if (message.text.toLowerCase().includes('account number') || 
                        message.text.toLowerCase().includes('sort code')) {
                        attemptCount++;
                        
                        if (attemptCount === 1) {
                            logStep(3, 'Attempt 1: Providing INVALID credentials');
                            setTimeout(() => {
                                ws.send(JSON.stringify({
                                    type: 'user.message',
                                    text: `Account ${INVALID_ACCOUNT}, sort code ${INVALID_SORTCODE}`
                                }));
                            }, 500);
                        } else if (attemptCount === 2) {
                            logStep(4, 'Attempt 2: Providing VALID credentials (correction)');
                            setTimeout(() => {
                                ws.send(JSON.stringify({
                                    type: 'user.message',
                                    text: `Sorry, I meant account ${VALID_ACCOUNT}, sort code ${VALID_SORTCODE}`
                                }));
                            }, 500);
                        }
                    }
                    
                    if (message.text.toLowerCase().includes('verified') ||
                        message.text.toLowerCase().includes('connecting you')) {
                        logSuccess('Agent indicated successful verification');
                    }
                }
                
                if (message.type === 'tool.result') {
                    log(`Tool Result: ${JSON.stringify(message.result, null, 2)}`, 'yellow');
                    if (message.toolName === 'perform_idv_check') {
                        if (message.result.auth_status === 'VERIFIED') {
                            logSuccess(`IDV attempt ${attemptCount} succeeded!`);
                        } else {
                            logWarning(`IDV attempt ${attemptCount} failed`);
                        }
                    }
                }
                
                if (message.type === 'agent.handoff') {
                    log(`Handoff: ${JSON.stringify(message, null, 2)}`, 'cyan');
                    
                    if (message.targetAgent === 'banking' && 
                        message.reason?.includes('verified')) {
                        receivedSuccessHandoff = true;
                        logSuccess('✓ Received handoff to banking after successful verification');
                        
                        clearTimeout(timeout);
                        ws.close();
                        
                        if (attemptCount === 2) {
                            logSuccess('TEST 2 PASSED: Corrected on second attempt and verified successfully');
                            resolve({ passed: true, attempts: attemptCount });
                        } else {
                            logError(`TEST 2 FAILED: Unexpected attempt count: ${attemptCount}`);
                            resolve({ passed: false, attempts: attemptCount });
                        }
                    }
                }
                
            } catch (err) {
                logError(`Error parsing message: ${err.message}`);
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            logError(`WebSocket error: ${error.message}`);
            reject(error);
        });

        ws.on('close', () => {
            clearTimeout(timeout);
            if (!receivedSuccessHandoff) {
                logError('TEST 2 FAILED: Connection closed without proper handoff');
                resolve({ passed: false, attempts: attemptCount });
            }
        });
    });
}

/**
 * Test Scenario 3: User provides correct details first time
 */
async function testFirstAttemptSuccess() {
    logSection('TEST 3: First Attempt Success');
    
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(GATEWAY_URL);
        let attemptCount = 0;
        let receivedSuccessHandoff = false;
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Test timeout'));
        }, TEST_TIMEOUT);

        ws.on('open', () => {
            logStep(1, 'Connected to gateway');
            
            const initMessage = {
                type: 'session.start',
                sessionId: `test-idv-success-${Date.now()}`,
                persona: 'idv',
                mode: 'chat',
                config: {
                    voice: 'stephen'
                }
            };
            
            ws.send(JSON.stringify(initMessage));
            logSuccess('Session started with IDV persona');
            
            setTimeout(() => {
                logStep(2, 'Requesting balance check (requires IDV)');
                ws.send(JSON.stringify({
                    type: 'user.message',
                    text: 'I want to check my balance'
                }));
            }, 1000);
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                if (message.type === 'agent.response') {
                    log(`Agent: ${message.text}`, 'magenta');
                    
                    if (message.text.toLowerCase().includes('account number') || 
                        message.text.toLowerCase().includes('sort code')) {
                        attemptCount++;
                        logStep(3, 'Attempt 1: Providing VALID credentials');
                        
                        setTimeout(() => {
                            ws.send(JSON.stringify({
                                type: 'user.message',
                                text: `Account ${VALID_ACCOUNT}, sort code ${VALID_SORTCODE}`
                            }));
                        }, 500);
                    }
                    
                    if (message.text.toLowerCase().includes('verified') ||
                        message.text.toLowerCase().includes('connecting you')) {
                        logSuccess('Agent indicated successful verification');
                    }
                }
                
                if (message.type === 'tool.result') {
                    log(`Tool Result: ${JSON.stringify(message.result, null, 2)}`, 'yellow');
                    if (message.toolName === 'perform_idv_check') {
                        if (message.result.auth_status === 'VERIFIED') {
                            logSuccess('IDV succeeded on first attempt!');
                        }
                    }
                }
                
                if (message.type === 'agent.handoff') {
                    log(`Handoff: ${JSON.stringify(message, null, 2)}`, 'cyan');
                    
                    if (message.targetAgent === 'banking' && 
                        message.reason?.includes('verified')) {
                        receivedSuccessHandoff = true;
                        logSuccess('✓ Received handoff to banking after successful verification');
                        
                        clearTimeout(timeout);
                        ws.close();
                        
                        if (attemptCount === 1) {
                            logSuccess('TEST 3 PASSED: Verified on first attempt');
                            resolve({ passed: true, attempts: attemptCount });
                        } else {
                            logError(`TEST 3 FAILED: Unexpected attempt count: ${attemptCount}`);
                            resolve({ passed: false, attempts: attemptCount });
                        }
                    }
                }
                
            } catch (err) {
                logError(`Error parsing message: ${err.message}`);
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            logError(`WebSocket error: ${error.message}`);
            reject(error);
        });

        ws.on('close', () => {
            clearTimeout(timeout);
            if (!receivedSuccessHandoff) {
                logError('TEST 3 FAILED: Connection closed without proper handoff');
                resolve({ passed: false, attempts: attemptCount });
            }
        });
    });
}

/**
 * Run all tests
 */
async function runAllTests() {
    logSection('ID&V RETRY FLOW TEST SUITE');
    log('Testing identity verification retry scenarios\n', 'bright');
    
    const results = [];
    
    try {
        // Test 1: Three failed attempts
        const test1 = await testThreeFailedAttempts();
        results.push({ name: 'Three Failed Attempts', ...test1 });
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 2: Correction on second attempt
        const test2 = await testCorrectionOnSecondAttempt();
        results.push({ name: 'Correction on Second Attempt', ...test2 });
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 3: First attempt success
        const test3 = await testFirstAttemptSuccess();
        results.push({ name: 'First Attempt Success', ...test3 });
        
    } catch (error) {
        logError(`Test suite error: ${error.message}`);
    }
    
    // Print summary
    logSection('TEST SUMMARY');
    let passCount = 0;
    let failCount = 0;
    
    results.forEach(result => {
        if (result.passed) {
            logSuccess(`${result.name}: PASSED (${result.attempts} attempts)`);
            passCount++;
        } else {
            logError(`${result.name}: FAILED (${result.attempts} attempts)`);
            failCount++;
        }
    });
    
    log('\n' + '='.repeat(80), 'cyan');
    log(`Total: ${results.length} tests | Passed: ${passCount} | Failed: ${failCount}`, 'bright');
    log('='.repeat(80) + '\n', 'cyan');
    
    process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    logError(`Fatal error: ${error.message}`);
    process.exit(1);
});
