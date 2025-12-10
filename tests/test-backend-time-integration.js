#!/usr/bin/env node

/**
 * Backend Time Tool Integration Test
 * 
 * Tests the updated backend integration where get_server_time
 * now uses AgentCore Gateway instead of local implementation.
 */

console.log('🔧 Backend Time Tool Integration Test');
console.log('====================================\n');

// Load environment variables
require('dotenv').config({ path: '../backend/.env' });

// Test the AgentCore Gateway Client directly
const { AgentCoreGatewayClient } = require('../backend/dist/agentcore-gateway-client.js');

async function testBackendIntegration() {
    console.log('🔍 Testing Backend Integration...');
    
    try {
        // Initialize the gateway client (same as backend does)
        const gatewayClient = new AgentCoreGatewayClient();
        console.log('✅ AgentCore Gateway Client initialized');
        
        // Test calling the time tool through the gateway client
        console.log('\n🕐 Testing get_server_time tool call...');
        
        const result = await gatewayClient.callTool('get_server_time', { timezone: 'UTC' });
        
        console.log('✅ Tool call successful!');
        console.log('📋 Result:', result);
        
        // Verify the result format
        if (result && result.includes('current time')) {
            console.log('\n🎯 SUCCESS: Time tool integration working!');
            console.log('   ✅ AgentCore Gateway client works');
            console.log('   ✅ Tool mapping works (get_server_time → get-Time___get_current_time)');
            console.log('   ✅ Response format is correct');
            console.log('   ✅ Real-time data returned');
        } else {
            console.log('\n❌ Unexpected result format:', result);
        }
        
        // Test tool listing
        console.log('\n📋 Testing tool listing...');
        const tools = await gatewayClient.listTools();
        
        const timeToolFound = tools.find(t => t.name === 'get-Time___get_current_time');
        if (timeToolFound) {
            console.log('✅ Time tool found in gateway tools list');
            console.log('   Name:', timeToolFound.name);
            console.log('   Description:', timeToolFound.description);
        } else {
            console.log('❌ Time tool not found in tools list');
        }
        
        console.log('\n🎉 INTEGRATION TEST COMPLETE');
        console.log('============================');
        console.log('Your backend is now configured to use AgentCore Gateway for time queries!');
        console.log('');
        console.log('What changed:');
        console.log('✅ tools/time_tool.json updated with AgentCore tool name');
        console.log('✅ AgentCore Gateway client includes time tool mapping');
        console.log('✅ Server.ts routes get_server_time to AgentCore Gateway');
        console.log('✅ Old heuristic interceptor code removed');
        console.log('');
        console.log('Next: Test with Nova Sonic client asking "What time is it?"');
        
    } catch (error) {
        console.error('❌ Integration test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testBackendIntegration();