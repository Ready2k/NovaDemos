#!/usr/bin/env node

/**
 * End-to-End Test: Gateway Handoff Flow
 * Tests: Triage → IDV → Banking
 */

const WebSocket = require('ws');

// Test configuration
const GATEWAY_URL = 'ws://192.168.5.190:8080/sonic';
const TEST_TIMEOUT = 60000; // 60 seconds

// Test state
let ws = null;
let sessionId = null;
let currentAgent = 'triage';
let testStep = 0;
let receivedMessages = [];

// Test steps
const steps = [
    { step: 1, action: 'connect', description: 'Connect to gateway' },
    { step: 2, action: 'select_workflow', description: 'Select Triage agent' },
    { step: 3, action: 'send_message', message: 'What is my balance?', description: 'Ask for balance' },
    { step: 4, action: 'wait_for_handoff', expectedTool: 'transfer_to_idv', description: 'Wait for handoff to IDV' },
    { step: 5, action: 'send_message', message: '12345678', description: 'Provide account number' },
    { step: 6, action: 'send_message', message: '112233', description: 'Provide sort code' },
    { step: 7, action: 'wait_for_tool', expectedTool: 'perform_idv_check', description: 'Wait for IDV check' },
    { step: 8, action: 'wait_for_handoff', expectedAgent: 'banking', description: 'Wait for auto-route to Banking' },
    { step: 9, action: 'wait_for_tool', expectedTool: 'agentcore_balance', description: 'Wait for balance check' },
    { step: 10, action: 'verify_success', description: 'Verify complete flow' }
];

console.log('🧪 Starting End-to-End Handoff Test\n');
console.log('Expected Flow: Triage → IDV → Banking\n');

// Connect to gateway
ws = new WebSocket(GATEWAY_URL);

ws.on('open', () => {
    console.log('✅ Step 1: Connected to gateway');
    nextStep();
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);
        
        console.log(`📨 Received: ${message.type}`, message.toolName ? `(${message.toolName})` : '');
        
        // Track session ID
        if (message.type === 'connected' && message.sessionId) {
            sessionId = message.sessionId;
            console.log(`   Session ID: ${sessionId}`);
        }
        
        // Track handoffs
        if (message.type === 'handoff_event') {
            console.log(`🔄 HANDOFF DETECTED: → ${message.target}`);
            currentAgent = message.target;
            
            // Check if this is the expected handoff
            const currentStep = steps[testStep];
            if (currentStep && currentStep.action === 'wait_for_handoff') {
                if (currentStep.expectedTool && message.target === currentStep.expectedTool.replace('transfer_to_', '')) {
                    console.log(`✅ Step ${testStep + 1}: Handoff to ${message.target} detected`);
                    nextStep();
                } else if (currentStep.expectedAgent && message.target === currentStep.expectedAgent) {
                    console.log(`✅ Step ${testStep + 1}: Auto-route to ${message.target} detected`);
                    nextStep();
                }
            }
        }
        
        // Track tool executions
        if (message.type === 'tool_use') {
            console.log(`🔧 Tool called: ${message.toolName}`);
        }
        
        if (message.type === 'tool_result') {
            console.log(`✅ Tool result: ${message.toolName} (success: ${message.success})`);
            
            // Check if this is the expected tool
            const currentStep = steps[testStep];
            if (currentStep && currentStep.action === 'wait_for_tool' && currentStep.expectedTool === message.toolName) {
                console.log(`✅ Step ${testStep + 1}: Tool ${message.toolName} executed`);
                nextStep();
            }
            
            // Special handling for handoff tools
            if (message.toolName && (message.toolName.startsWith('transfer_to_') || message.toolName === 'return_to_triage')) {
                console.log(`🔄 Handoff tool detected: ${message.toolName}`);
            }
        }
        
        // Track transcript
        if (message.type === 'transcript' && message.role === 'assistant') {
            console.log(`🤖 Agent: ${message.text.substring(0, 80)}...`);
        }
        
    } catch (e) {
        // Binary data or parse error - ignore
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
    process.exit(1);
});

ws.on('close', () => {
    console.log('\n🔌 Connection closed');
    
    // Analyze results
    analyzeResults();
});

function nextStep() {
    testStep++;
    
    if (testStep >= steps.length) {
        console.log('\n✅ All steps completed!');
        setTimeout(() => {
            ws.close();
        }, 2000);
        return;
    }
    
    const step = steps[testStep];
    console.log(`\n📍 Step ${step.step}: ${step.description}`);
    
    setTimeout(() => {
        executeStep(step);
    }, 1000);
}

function executeStep(step) {
    switch (step.action) {
        case 'select_workflow':
            ws.send(JSON.stringify({
                type: 'select_workflow',
                workflowId: 'triage'
            }));
            console.log('   Sent: select_workflow (triage)');
            setTimeout(() => nextStep(), 2000);
            break;
            
        case 'send_message':
            ws.send(JSON.stringify({
                type: 'text_input',
                text: step.message
            }));
            console.log(`   Sent: "${step.message}"`);
            // Don't auto-advance - wait for response
            break;
            
        case 'wait_for_handoff':
        case 'wait_for_tool':
            // These steps wait for events - handled in message handler
            console.log(`   Waiting for ${step.action === 'wait_for_handoff' ? 'handoff' : 'tool'}...`);
            break;
            
        case 'verify_success':
            verifySuccess();
            break;
    }
}

function verifySuccess() {
    console.log('\n📊 Test Results:\n');
    
    const handoffTools = receivedMessages.filter(m => 
        m.type === 'tool_result' && 
        (m.toolName?.startsWith('transfer_to_') || m.toolName === 'return_to_triage')
    );
    
    const handoffEvents = receivedMessages.filter(m => m.type === 'handoff_event');
    
    const idvCheck = receivedMessages.find(m => 
        m.type === 'tool_result' && m.toolName === 'perform_idv_check'
    );
    
    const balanceCheck = receivedMessages.find(m => 
        m.type === 'tool_result' && m.toolName === 'agentcore_balance'
    );
    
    console.log(`✅ Handoff tools called: ${handoffTools.length}`);
    handoffTools.forEach(t => console.log(`   - ${t.toolName} (success: ${t.success})`));
    
    console.log(`\n✅ Handoff events received: ${handoffEvents.length}`);
    handoffEvents.forEach(e => console.log(`   - Handoff to: ${e.target}`));
    
    console.log(`\n✅ IDV check: ${idvCheck ? 'SUCCESS' : 'NOT FOUND'}`);
    if (idvCheck) {
        console.log(`   Success: ${idvCheck.success}`);
    }
    
    console.log(`\n✅ Balance check: ${balanceCheck ? 'SUCCESS' : 'NOT FOUND'}`);
    if (balanceCheck) {
        console.log(`   Success: ${balanceCheck.success}`);
    }
    
    // Check for issues
    const returnToTriage = handoffTools.find(t => t.toolName === 'return_to_triage');
    if (returnToTriage) {
        console.log('\n⚠️  WARNING: return_to_triage was called - this may indicate a problem');
    }
    
    const multipleHandoffs = handoffTools.length > 2;
    if (multipleHandoffs) {
        console.log('\n⚠️  WARNING: Multiple handoff tools called - may indicate duplicate calls');
    }
    
    // Final verdict
    const success = handoffEvents.length >= 2 && idvCheck && balanceCheck && !returnToTriage;
    
    console.log('\n' + '='.repeat(60));
    if (success) {
        console.log('✅ TEST PASSED: Complete flow working correctly!');
        console.log('   Triage → IDV → Banking flow successful');
    } else {
        console.log('❌ TEST FAILED: Flow incomplete or errors detected');
        console.log('   Check logs above for details');
    }
    console.log('='.repeat(60) + '\n');
    
    setTimeout(() => {
        ws.close();
        process.exit(success ? 0 : 1);
    }, 1000);
}

function analyzeResults() {
    console.log('\n📈 Message Summary:');
    console.log(`   Total messages: ${receivedMessages.length}`);
    console.log(`   Tool calls: ${receivedMessages.filter(m => m.type === 'tool_use').length}`);
    console.log(`   Tool results: ${receivedMessages.filter(m => m.type === 'tool_result').length}`);
    console.log(`   Handoff events: ${receivedMessages.filter(m => m.type === 'handoff_event').length}`);
    console.log(`   Transcripts: ${receivedMessages.filter(m => m.type === 'transcript').length}`);
}

// Timeout
setTimeout(() => {
    console.error('\n❌ Test timeout - closing connection');
    if (ws) ws.close();
    process.exit(1);
}, TEST_TIMEOUT);
