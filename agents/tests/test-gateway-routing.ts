/**
 * Test Gateway Routing - Agent-to-Agent Context Passing
 * 
 * This test demonstrates how agents can route requests to other agents
 * through the gateway, passing context and state between them.
 */

import { GatewayRouter, RouteRequest, AgentContext } from '../src/gateway-router';

// Mock configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
const TEST_AGENT_ID = 'test-agent';

/**
 * Test 1: Basic routing with simple context
 */
async function testBasicRouting() {
    console.log('\n=== Test 1: Basic Routing ===\n');

    const router = new GatewayRouter({
        gatewayUrl: GATEWAY_URL,
        agentId: TEST_AGENT_ID,
        timeout: 5000
    });

    const context: AgentContext = {
        lastAgent: TEST_AGENT_ID,
        userIntent: 'check balance',
        lastUserMessage: 'What is my account balance?'
    };

    const request: RouteRequest = {
        sessionId: 'test-session-001',
        targetAgentId: 'banking',
        context,
        reason: 'User needs banking assistance'
    };

    console.log('Routing request:', JSON.stringify(request, null, 2));

    const response = await router.routeToAgent(request);

    console.log('Routing response:', JSON.stringify(response, null, 2));

    if (response.success) {
        console.log('✅ Basic routing test PASSED');
    } else {
        console.log('❌ Basic routing test FAILED:', response.error);
    }

    return response.success;
}

/**
 * Test 2: Routing with verified user context
 */
async function testVerifiedUserRouting() {
    console.log('\n=== Test 2: Verified User Routing ===\n');

    const router = new GatewayRouter({
        gatewayUrl: GATEWAY_URL,
        agentId: 'idv',
        timeout: 5000
    });

    const context: AgentContext = {
        lastAgent: 'idv',
        verified: true,
        userName: 'John Smith',
        account: '12345678',
        sortCode: '12-34-56',
        userIntent: 'check balance',
        lastUserMessage: 'I want to check my balance'
    };

    const request: RouteRequest = {
        sessionId: 'test-session-002',
        targetAgentId: 'banking',
        context,
        reason: 'User verified, routing to banking'
    };

    console.log('Routing request with verified user:', JSON.stringify(request, null, 2));

    const response = await router.routeToAgent(request);

    console.log('Routing response:', JSON.stringify(response, null, 2));

    if (response.success) {
        console.log('✅ Verified user routing test PASSED');
    } else {
        console.log('❌ Verified user routing test FAILED:', response.error);
    }

    return response.success;
}

/**
 * Test 3: Routing with graph state
 */
async function testGraphStateRouting() {
    console.log('\n=== Test 3: Graph State Routing ===\n');

    const router = new GatewayRouter({
        gatewayUrl: GATEWAY_URL,
        agentId: 'triage',
        timeout: 5000
    });

    const context: AgentContext = {
        lastAgent: 'triage',
        userIntent: 'dispute transaction',
        lastUserMessage: 'I want to dispute a transaction',
        graphState: {
            currentNodeId: 'dispute_detection',
            variables: {
                disputeReason: 'unauthorized charge',
                transactionId: 'TXN-12345'
            },
            history: [
                { node: 'start', timestamp: Date.now() - 5000 },
                { node: 'intent_detection', timestamp: Date.now() - 3000 },
                { node: 'dispute_detection', timestamp: Date.now() }
            ]
        }
    };

    const request: RouteRequest = {
        sessionId: 'test-session-003',
        targetAgentId: 'disputes',
        context,
        reason: 'User needs dispute assistance'
    };

    console.log('Routing request with graph state:', JSON.stringify(request, null, 2));

    const response = await router.routeToAgent(request);

    console.log('Routing response:', JSON.stringify(response, null, 2));

    if (response.success) {
        console.log('✅ Graph state routing test PASSED');
    } else {
        console.log('❌ Graph state routing test FAILED:', response.error);
    }

    return response.success;
}

/**
 * Test 4: Get session memory
 */
async function testGetSessionMemory() {
    console.log('\n=== Test 4: Get Session Memory ===\n');

    const router = new GatewayRouter({
        gatewayUrl: GATEWAY_URL,
        agentId: TEST_AGENT_ID,
        timeout: 5000
    });

    const sessionId = 'test-session-001';

    console.log(`Retrieving memory for session: ${sessionId}`);

    const memory = await router.getSessionMemory(sessionId);

    console.log('Session memory:', JSON.stringify(memory, null, 2));

    if (memory) {
        console.log('✅ Get session memory test PASSED');
        return true;
    } else {
        console.log('⚠️  Get session memory test returned null (session may not exist)');
        return false;
    }
}

/**
 * Test 5: Check agent availability
 */
async function testAgentAvailability() {
    console.log('\n=== Test 5: Check Agent Availability ===\n');

    const router = new GatewayRouter({
        gatewayUrl: GATEWAY_URL,
        agentId: TEST_AGENT_ID,
        timeout: 5000
    });

    const agentsToCheck = ['triage', 'banking', 'idv', 'disputes', 'mortgage'];

    for (const agentId of agentsToCheck) {
        const available = await router.isAgentAvailable(agentId);
        console.log(`Agent ${agentId}: ${available ? '✅ Available' : '❌ Not Available'}`);
    }

    console.log('✅ Agent availability test COMPLETED');
    return true;
}

/**
 * Test 6: Get available agents
 */
async function testGetAvailableAgents() {
    console.log('\n=== Test 6: Get Available Agents ===\n');

    const router = new GatewayRouter({
        gatewayUrl: GATEWAY_URL,
        agentId: TEST_AGENT_ID,
        timeout: 5000
    });

    const agents = await router.getAvailableAgents();

    console.log('Available agents:', agents);

    if (agents.length > 0) {
        console.log(`✅ Found ${agents.length} available agents`);
        return true;
    } else {
        console.log('⚠️  No agents available (gateway may not be running)');
        return false;
    }
}

/**
 * Test 7: Notify status change
 */
async function testStatusNotification() {
    console.log('\n=== Test 7: Status Notification ===\n');

    const router = new GatewayRouter({
        gatewayUrl: GATEWAY_URL,
        agentId: TEST_AGENT_ID,
        timeout: 5000
    });

    console.log('Notifying gateway of status change: ready');
    await router.notifyStatusChange('ready', { message: 'Agent initialized' });

    console.log('Notifying gateway of status change: busy');
    await router.notifyStatusChange('busy', { currentTask: 'processing request' });

    console.log('Notifying gateway of status change: ready');
    await router.notifyStatusChange('ready', { message: 'Task completed' });

    console.log('✅ Status notification test COMPLETED');
    return true;
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         Gateway Routing Test Suite                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const results: { [key: string]: boolean } = {};

    try {
        results['Basic Routing'] = await testBasicRouting();
    } catch (error: any) {
        console.error('Test 1 error:', error.message);
        results['Basic Routing'] = false;
    }

    try {
        results['Verified User Routing'] = await testVerifiedUserRouting();
    } catch (error: any) {
        console.error('Test 2 error:', error.message);
        results['Verified User Routing'] = false;
    }

    try {
        results['Graph State Routing'] = await testGraphStateRouting();
    } catch (error: any) {
        console.error('Test 3 error:', error.message);
        results['Graph State Routing'] = false;
    }

    try {
        results['Get Session Memory'] = await testGetSessionMemory();
    } catch (error: any) {
        console.error('Test 4 error:', error.message);
        results['Get Session Memory'] = false;
    }

    try {
        results['Agent Availability'] = await testAgentAvailability();
    } catch (error: any) {
        console.error('Test 5 error:', error.message);
        results['Agent Availability'] = false;
    }

    try {
        results['Get Available Agents'] = await testGetAvailableAgents();
    } catch (error: any) {
        console.error('Test 6 error:', error.message);
        results['Get Available Agents'] = false;
    }

    try {
        results['Status Notification'] = await testStatusNotification();
    } catch (error: any) {
        console.error('Test 7 error:', error.message);
        results['Status Notification'] = false;
    }

    // Print summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    Test Summary                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    for (const [testName, result] of Object.entries(results)) {
        const status = result ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} - ${testName}`);
        if (result) passed++;
        else failed++;
    }

    console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

    if (failed === 0) {
        console.log('\n🎉 All tests passed!');
    } else {
        console.log(`\n⚠️  ${failed} test(s) failed`);
    }
}

// Run tests if executed directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export {
    testBasicRouting,
    testVerifiedUserRouting,
    testGraphStateRouting,
    testGetSessionMemory,
    testAgentAvailability,
    testGetAvailableAgents,
    testStatusNotification,
    runAllTests
};
