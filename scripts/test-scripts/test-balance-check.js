#!/usr/bin/env node

/**
 * Test Balance Check - Verify Banking Tool Execution
 * 
 * This test verifies that:
 * 1. WebSocket connection works
 * 2. Text messages are sent and received
 * 3. Banking balance tool is executed
 * 4. Correct balance is returned for Customer ID 12345678, Sort Code 112233
 * 
 * Expected: £1200
 */

const WebSocket = require('ws');

// Test configuration
const GATEWAY_URL = 'ws://localhost:8080/sonic';
const CUSTOMER_ID = '12345678';
const SORT_CODE = '112233';
const EXPECTED_BALANCE = '£1200';
const TEST_TIMEOUT = 60000; // 60 seconds

// Test state
let ws = null;
let sessionId = null;
let testPassed = false;
let testFailed = false;
let receivedMessages = [];
let balanceFound = false;
let actualBalance = null;

console.log('🧪 Balance Check Test');
console.log('===================');
console.log(`Customer ID: ${CUSTOMER_ID}`);
console.log(`Sort Code: ${SORT_CODE}`);
console.log(`Expected Balance: ${EXPECTED_BALANCE}`);
console.log('');

// Timeout handler
const timeout = setTimeout(() => {
    if (!testPassed && !testFailed) {
        console.error('❌ TEST FAILED: Timeout after 60 seconds');
        console.log('\n📊 Messages Received:');
        receivedMessages.forEach((msg, idx) => {
            console.log(`${idx + 1}. ${msg.type}: ${JSON.stringify(msg).substring(0, 100)}...`);
        });
        cleanup(1);
    }
}, TEST_TIMEOUT);

// Cleanup function
function cleanup(exitCode = 0) {
    clearTimeout(timeout);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    process.exit(exitCode);
}

// Connect to WebSocket
console.log('1️⃣ Connecting to Gateway...');
ws = new WebSocket(GATEWAY_URL);

ws.on('open', () => {
    console.log('✅ Connected to Gateway');
    console.log('');
    
    // Wait a moment for backend to be ready
    setTimeout(() => {
        console.log('2️⃣ Selecting workflow: triage');
        ws.send(JSON.stringify({
            type: 'select_workflow',
            workflowId: 'triage'
        }));
        
        // Wait for workflow to be selected
        setTimeout(() => {
            console.log('3️⃣ Sending balance check request...');
            console.log(`   Message: "What is the balance for customer ${CUSTOMER_ID} with sort code ${SORT_CODE}?"`);
            console.log('');
            
            ws.send(JSON.stringify({
                type: 'text_input',
                text: `What is the balance for customer ${CUSTOMER_ID} with sort code ${SORT_CODE}?`
            }));
        }, 1000);
    }, 1000);
});

ws.on('message', (data) => {
    try {
        // Handle binary data (audio)
        if (Buffer.isBuffer(data)) {
            // Try to decode as JSON first
            try {
                const text = data.toString('utf-8');
                const message = JSON.parse(text);
                handleMessage(message);
            } catch (e) {
                // It's actual binary audio data, ignore
                return;
            }
        } else {
            // Handle text data (JSON)
            const message = JSON.parse(data.toString());
            handleMessage(message);
        }
    } catch (error) {
        console.error('Error parsing message:', error.message);
    }
});

function handleMessage(message) {
    receivedMessages.push(message);
    
    console.log(`📨 Received: ${message.type}`);
    
    switch (message.type) {
        case 'connected':
            sessionId = message.sessionId;
            console.log(`   Session ID: ${sessionId}`);
            break;
            
        case 'transcript':
            if (message.role === 'user') {
                console.log(`   User: ${message.text}`);
            } else if (message.role === 'assistant') {
                console.log(`   Assistant: ${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}`);
                
                // Check if balance is mentioned in the response
                checkForBalance(message.text);
            }
            break;
            
        case 'tool_use':
            console.log(`   🔧 Tool: ${message.toolName}`);
            if (message.input) {
                console.log(`   Input: ${JSON.stringify(message.input)}`);
            }
            break;
            
        case 'tool_result':
            console.log(`   ✅ Tool Result: ${message.toolName}`);
            console.log(`   Full message: ${JSON.stringify(message, null, 2)}`);
            if (message.result) {
                const resultStr = JSON.stringify(message.result, null, 2);
                console.log(`   Result: ${resultStr}`);
                
                // Check if this is the balance tool result
                if (message.toolName === 'agentcore_balance' || message.toolName === 'check_balance') {
                    checkToolResult(message.result);
                }
            }
            break;
            
        case 'error':
            console.error(`   ❌ Error: ${message.message}`);
            if (message.details) {
                console.error(`   Details: ${message.details}`);
            }
            testFailed = true;
            break;
            
        case 'usage':
            // Token usage - ignore for this test
            break;
            
        default:
            // Log other message types for debugging
            if (message.type !== 'audio' && message.type !== 'contentStart' && message.type !== 'contentEnd') {
                console.log(`   Data: ${JSON.stringify(message).substring(0, 100)}...`);
            }
    }
}

function checkForBalance(text) {
    // Look for balance in the text
    const balancePatterns = [
        /£\s*1,?200/i,
        /1,?200\s*pounds/i,
        /balance.*£\s*1,?200/i,
        /balance.*1,?200/i
    ];
    
    for (const pattern of balancePatterns) {
        if (pattern.test(text)) {
            console.log('');
            console.log('🎉 SUCCESS! Balance found in response!');
            console.log(`   Expected: ${EXPECTED_BALANCE}`);
            console.log(`   Found in text: "${text}"`);
            balanceFound = true;
            actualBalance = EXPECTED_BALANCE;
            
            // Wait a moment to see if there are more messages, then pass
            setTimeout(() => {
                if (!testFailed) {
                    testPassed = true;
                    printSummary();
                    cleanup(0);
                }
            }, 2000);
            return;
        }
    }
}

function checkToolResult(result) {
    // Check if the tool result contains the balance
    if (result && typeof result === 'object') {
        // Look for balance in various possible fields
        const balance = result.balance || result.currentBalance || result.amount;
        
        if (balance) {
            console.log('');
            console.log('💰 Balance found in tool result!');
            console.log(`   Balance: ${balance}`);
            
            // Check if it matches expected
            const balanceStr = String(balance);
            if (balanceStr.includes('1200') || balanceStr.includes('£1200')) {
                console.log('✅ Balance matches expected value!');
                balanceFound = true;
                actualBalance = balance;
            } else {
                console.log(`⚠️  Balance does not match expected (${EXPECTED_BALANCE})`);
            }
        }
    }
}

function printSummary() {
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Customer ID: ${CUSTOMER_ID}`);
    console.log(`Sort Code: ${SORT_CODE}`);
    console.log(`Expected Balance: ${EXPECTED_BALANCE}`);
    console.log(`Actual Balance: ${actualBalance || 'Not found'}`);
    console.log(`Balance Found: ${balanceFound ? '✅ YES' : '❌ NO'}`);
    console.log(`Test Result: ${testPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('═══════════════════════════════════════');
    console.log('');
    
    if (testPassed) {
        console.log('🎉 TEST PASSED! Balance check successful!');
    } else {
        console.log('❌ TEST FAILED! Balance not found or incorrect.');
        console.log('');
        console.log('📋 All received messages:');
        receivedMessages.forEach((msg, idx) => {
            console.log(`${idx + 1}. ${msg.type}:`, JSON.stringify(msg).substring(0, 150));
        });
    }
}

ws.on('error', (error) => {
    console.error('❌ WebSocket Error:', error.message);
    testFailed = true;
    cleanup(1);
});

ws.on('close', () => {
    console.log('');
    console.log('🔌 WebSocket closed');
    
    if (!testPassed && !testFailed) {
        console.log('❌ TEST FAILED: Connection closed before balance was found');
        printSummary();
        cleanup(1);
    }
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Test interrupted by user');
    cleanup(1);
});

process.on('SIGTERM', () => {
    console.log('\n\n⚠️  Test terminated');
    cleanup(1);
});
