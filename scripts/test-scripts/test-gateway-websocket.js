#!/usr/bin/env node

/**
 * Quick WebSocket Connection Test for Gateway
 * 
 * This script tests if the Gateway can handle WebSocket connections
 * without crashing. It simulates a frontend connection.
 */

const WebSocket = require('ws');

const GATEWAY_URL = 'ws://localhost:8080/sonic';
const TEST_TIMEOUT = 10000; // 10 seconds

console.log('='.repeat(60));
console.log('Gateway WebSocket Connection Test');
console.log('='.repeat(60));
console.log(`Connecting to: ${GATEWAY_URL}`);
console.log('');

let testPassed = false;
let ws = null;

// Create WebSocket connection
try {
    ws = new WebSocket(GATEWAY_URL);
    
    // Connection opened
    ws.on('open', () => {
        console.log('✅ WebSocket connection established');
        
        // Send workflow selection
        console.log('📤 Sending workflow selection: triage');
        ws.send(JSON.stringify({
            type: 'select_workflow',
            workflowId: 'triage'
        }));
    });
    
    // Message received
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`📥 Received message: ${message.type}`);
            
            if (message.type === 'connected') {
                console.log(`   Session ID: ${message.sessionId}`);
                testPassed = true;
            } else if (message.type === 'error') {
                console.error(`❌ Error from Gateway: ${message.message}`);
                if (message.details) {
                    console.error(`   Details: ${message.details}`);
                }
            } else {
                console.log(`   Message:`, message);
            }
        } catch (e) {
            // Binary data or non-JSON
            console.log(`📥 Received binary data: ${data.length} bytes`);
        }
    });
    
    // Connection closed
    ws.on('close', (code, reason) => {
        console.log('');
        console.log(`🔌 WebSocket connection closed`);
        console.log(`   Code: ${code}`);
        console.log(`   Reason: ${reason || 'No reason provided'}`);
        console.log('');
        
        if (testPassed) {
            console.log('='.repeat(60));
            console.log('✅ TEST PASSED: Gateway handled connection successfully');
            console.log('='.repeat(60));
            process.exit(0);
        } else {
            console.log('='.repeat(60));
            console.log('❌ TEST FAILED: Did not receive expected messages');
            console.log('='.repeat(60));
            process.exit(1);
        }
    });
    
    // Connection error
    ws.on('error', (error) => {
        console.error('');
        console.error('❌ WebSocket error:', error.message);
        console.error('');
        console.log('='.repeat(60));
        console.log('❌ TEST FAILED: Connection error');
        console.log('='.repeat(60));
        process.exit(1);
    });
    
    // Timeout
    setTimeout(() => {
        if (!testPassed) {
            console.log('');
            console.log('⏱️  Test timeout - closing connection');
            ws.close();
        } else {
            console.log('');
            console.log('✅ Test completed successfully - closing connection');
            ws.close();
        }
    }, TEST_TIMEOUT);
    
} catch (error) {
    console.error('');
    console.error('❌ Failed to create WebSocket connection:', error.message);
    console.error('');
    console.log('='.repeat(60));
    console.log('❌ TEST FAILED: Could not connect');
    console.log('='.repeat(60));
    process.exit(1);
}
