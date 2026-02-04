/**
 * Property-Based Tests for Handoff Detection and Routing
 * 
 * Feature: voice-agnostic-agent-architecture
 * Property 9: Handoff Detection and Routing
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */

import * as fc from 'fast-check';
import { AgentCore, AgentCoreConfig } from '../../src/agent-core';
import { GraphExecutor } from '../../src/graph-executor';
import { WorkflowDefinition } from '../../src/graph-types';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { PersonaConfig } from '../../src/persona-types';

// Mock workflow definition
const mockWorkflow: WorkflowDefinition = {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: [
        { id: 'start', type: 'start', label: 'Start' },
        { id: 'routing', type: 'decision', label: 'Route User' }
    ],
    edges: [
        { from: 'start', to: 'routing', label: 'begin' }
    ],
    testConfig: {
        personaId: 'test-persona'
    }
};

// Mock persona config
const mockPersona: PersonaConfig = {
    id: 'test-persona',
    name: 'Test Persona',
    description: 'Test persona for property tests',
    promptFile: null,
    workflows: ['test-workflow'],
    voiceId: 'matthew',
    allowedTools: ['transfer_to_banking', 'transfer_to_idv', 'return_to_triage'],
    metadata: {
        language: 'en-US',
        region: 'US',
        tone: 'professional'
    }
};

// Helper to create agent core
function createAgentCore(agentId: string = 'triage'): AgentCore {
    const mockToolsClient = new ToolsClient('http://localhost:9000');
    const mockDecisionEvaluator = new DecisionEvaluator('us-east-1');
    const mockGraphExecutor = new GraphExecutor(mockWorkflow);

    const config: AgentCoreConfig = {
        agentId,
        workflowDef: mockWorkflow,
        personaConfig: mockPersona,
        toolsClient: mockToolsClient,
        decisionEvaluator: mockDecisionEvaluator,
        graphExecutor: mockGraphExecutor,
        localToolsUrl: 'http://localhost:9000'
    };

    return new AgentCore(config);
}

// Custom arbitraries for handoff tools
const handoffToolArbitrary = fc.constantFrom(
    'transfer_to_banking',
    'transfer_to_idv',
    'transfer_to_mortgage',
    'transfer_to_disputes',
    'transfer_to_investigation',
    'return_to_triage'
);

const verifiedUserArbitrary = fc.record({
    customer_name: fc.string({ minLength: 5, maxLength: 50 }),
    account: fc.integer({ min: 10000000, max: 99999999 }).map(n => String(n)),
    sortCode: fc.integer({ min: 100000, max: 999999 }).map(n => String(n))
});

const handoffReasonArbitrary = fc.string({ minLength: 10, maxLength: 200 });

const userIntentArbitrary = fc.string({ minLength: 5, maxLength: 100 });

describe('Property 9: Handoff Detection and Routing', () => {
    /**
     * Property 9.1: Agent Core must detect handoff tool calls
     * 
     * For any handoff tool call (transfer_to_*, return_to_triage),
     * the system should detect it as a handoff and process it accordingly.
     * 
     * **Validates: Requirement 9.1**
     */
    it('should detect all handoff tool calls', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                handoffToolArbitrary,
                fc.record({
                    reason: fc.option(handoffReasonArbitrary, { nil: undefined })
                }),
                fc.uuid(),
                async (sessionId, toolName, toolInput, toolUseId) => {
                    const agentCore = createAgentCore();
                    agentCore.initializeSession(sessionId);

                    // Execute the tool
                    const result = await agentCore.executeTool(
                        sessionId,
                        toolName,
                        toolInput,
                        toolUseId
                    );

                    // For return_to_triage without required fields, expect validation error
                    if (toolName === 'return_to_triage' && (!toolInput.reason || !toolInput.summary)) {
                        // This is expected to fail validation
                        expect(result.success).toBe(false);
                        expect(result.error).toBeDefined();
                    } else {
                        // Should detect as handoff and return success with handoff request
                        expect(result.success).toBe(true);
                        expect(result.result).toBeDefined();
                        expect(result.result.handoffRequest).toBeDefined();
                        expect(result.result.toolName).toBe(toolName);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 9.2: Agent Core must extract handoff context
     * 
     * For any handoff request, the system should extract:
     * - reason (from tool input, userIntent, or default)
     * - verified user data (if available)
     * - user intent (if available)
     * - last user message
     * 
     * **Validates: Requirement 9.2**
     */
    it('should extract complete handoff context including reason, verified user, and user intent', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                handoffToolArbitrary,
                fc.option(handoffReasonArbitrary, { nil: undefined }),
                fc.option(verifiedUserArbitrary, { nil: undefined }),
                fc.option(userIntentArbitrary, { nil: undefined }),
                fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined }),
                async (sessionId, toolName, reason, verifiedUser, userIntent, lastMessage) => {
                    const agentCore = createAgentCore();
                    
                    // Initialize session with memory
                    const memory: any = {};
                    if (verifiedUser) {
                        memory.verified = true;
                        memory.userName = verifiedUser.customer_name;
                        memory.account = verifiedUser.account;
                        memory.sortCode = verifiedUser.sortCode;
                    }
                    if (userIntent) {
                        memory.userIntent = userIntent;
                    }
                    
                    agentCore.initializeSession(sessionId, memory);
                    
                    // Add a user message if provided
                    if (lastMessage) {
                        await agentCore.processUserMessage(sessionId, lastMessage);
                    }

                    // Skip return_to_triage for this test as it requires specific fields
                    if (toolName === 'return_to_triage') {
                        return;
                    }

                    // Execute handoff tool
                    const toolInput = reason ? { reason } : {};
                    const result = await agentCore.executeTool(
                        sessionId,
                        toolName,
                        toolInput,
                        'tool-use-id'
                    );

                    // Should extract context
                    expect(result.success).toBe(true);
                    expect(result.result.handoffRequest).toBeDefined();
                    
                    const context = result.result.handoffRequest.context;
                    
                    // Should have a reason (from input, userIntent, or default)
                    expect(context.reason).toBeDefined();
                    expect(typeof context.reason).toBe('string');
                    expect(context.reason.length).toBeGreaterThan(0);
                    
                    // If reason was provided, it should be used
                    if (reason) {
                        expect(context.reason).toBe(reason);
                    }
                    // Otherwise, if userIntent was provided, it should be used
                    else if (userIntent) {
                        expect(context.reason).toBe(userIntent);
                    }
                    // Otherwise, should have default message
                    else {
                        expect(context.reason).toBe('User needs specialist assistance');
                    }
                    
                    // Should include verified user if available
                    if (verifiedUser) {
                        expect(context.verified).toBe(true);
                        expect(context.userName).toBe(verifiedUser.customer_name);
                        expect(context.account).toBe(verifiedUser.account);
                        expect(context.sortCode).toBe(verifiedUser.sortCode);
                    } else {
                        expect(context.verified).toBeUndefined();
                    }
                    
                    // Should include user intent if available
                    if (userIntent) {
                        expect(context.userIntent).toBe(userIntent);
                    }
                    
                    // Should include last user message if available
                    if (lastMessage) {
                        expect(context.lastUserMessage).toBe(lastMessage);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 9.3: Agent Core must build handoff request with full LangGraph state
     * 
     * For any handoff request, the system should include:
     * - Full LangGraph state from GraphExecutor
     * - Session metadata (sessionId, currentNode, messageCount, startTime)
     * 
     * **Validates: Requirement 9.3**
     */
    it('should build handoff request with full LangGraph state', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                handoffToolArbitrary,
                fc.option(handoffReasonArbitrary, { nil: undefined }),
                async (sessionId, toolName, reason) => {
                    const agentCore = createAgentCore();
                    agentCore.initializeSession(sessionId);

                    // Skip return_to_triage for this test
                    if (toolName === 'return_to_triage') {
                        return;
                    }

                    // Execute handoff tool
                    const toolInput = reason ? { reason } : {};
                    const result = await agentCore.executeTool(
                        sessionId,
                        toolName,
                        toolInput,
                        'tool-use-id'
                    );

                    // Should include full graph state
                    expect(result.success).toBe(true);
                    expect(result.result.handoffRequest).toBeDefined();
                    expect(result.result.handoffRequest.graphState).toBeDefined();
                    
                    const graphState = result.result.handoffRequest.graphState;
                    
                    // Should include session metadata
                    expect(graphState.sessionId).toBe(sessionId);
                    expect(graphState.currentNode).toBeDefined();
                    expect(graphState.messageCount).toBeDefined();
                    expect(typeof graphState.messageCount).toBe('number');
                    expect(graphState.sessionStartTime).toBeDefined();
                    expect(typeof graphState.sessionStartTime).toBe('number');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 9.4: Agent Core must send handoff_request to Gateway via adapter
     * 
     * For any handoff tool execution, the system should return a result
     * that includes the handoff request, which the adapter can then
     * forward to the Gateway.
     * 
     * **Validates: Requirement 9.4**
     */
    it('should return handoff request for adapter to send to Gateway', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                handoffToolArbitrary,
                fc.option(handoffReasonArbitrary, { nil: undefined }),
                async (sessionId, toolName, reason) => {
                    const agentCore = createAgentCore();
                    agentCore.initializeSession(sessionId);

                    // Skip return_to_triage for this test
                    if (toolName === 'return_to_triage') {
                        return;
                    }

                    // Execute handoff tool
                    const toolInput = reason ? { reason } : {};
                    const result = await agentCore.executeTool(
                        sessionId,
                        toolName,
                        toolInput,
                        'tool-use-id'
                    );

                    // Should return success with handoff request
                    expect(result.success).toBe(true);
                    expect(result.result).toBeDefined();
                    expect(result.result.handoffRequest).toBeDefined();
                    
                    const handoffRequest = result.result.handoffRequest;
                    
                    // Handoff request should have required fields for Gateway
                    expect(handoffRequest.targetAgentId).toBeDefined();
                    expect(typeof handoffRequest.targetAgentId).toBe('string');
                    expect(handoffRequest.targetAgentId.length).toBeGreaterThan(0);
                    
                    expect(handoffRequest.context).toBeDefined();
                    expect(typeof handoffRequest.context).toBe('object');
                    
                    expect(handoffRequest.graphState).toBeDefined();
                    expect(typeof handoffRequest.graphState).toBe('object');
                    
                    // Context should have fromAgent
                    expect(handoffRequest.context.fromAgent).toBeDefined();
                    expect(typeof handoffRequest.context.fromAgent).toBe('string');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 9.7: Agent Core must handle return handoffs with task completion status
     * 
     * For any return_to_triage handoff, the system should include:
     * - isReturn flag set to true
     * - taskCompleted field with task identifier
     * - summary field with task summary
     * 
     * **Validates: Requirement 9.7**
     */
    it('should handle return handoffs with task completion status', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                fc.constantFrom('balance_check', 'transaction_history', 'idv_verification', 'dispute_filed'),
                fc.string({ minLength: 20, maxLength: 200 }),
                async (sessionId, taskCompleted, summary) => {
                    const agentCore = createAgentCore('banking');
                    agentCore.initializeSession(sessionId);

                    // Execute return_to_triage tool
                    const result = await agentCore.executeTool(
                        sessionId,
                        'return_to_triage',
                        { taskCompleted, summary },
                        'tool-use-id'
                    );

                    // Should return success with handoff request
                    expect(result.success).toBe(true);
                    expect(result.result).toBeDefined();
                    expect(result.result.handoffRequest).toBeDefined();
                    
                    const context = result.result.handoffRequest.context;
                    
                    // Should have return handoff fields
                    expect(context.isReturn).toBe(true);
                    expect(context.taskCompleted).toBe(taskCompleted);
                    expect(context.summary).toBe(summary);
                    
                    // Should target triage agent
                    expect(result.result.handoffRequest.targetAgentId).toBe('triage');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property: Handoff validation should reject invalid return_to_triage calls
     * 
     * For any return_to_triage call without required fields (taskCompleted, summary),
     * the system should reject it with a validation error.
     */
    it('should validate return_to_triage requires taskCompleted and summary', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                fc.record({
                    taskCompleted: fc.option(fc.string(), { nil: undefined }),
                    summary: fc.option(fc.string(), { nil: undefined })
                }),
                async (sessionId, toolInput) => {
                    const agentCore = createAgentCore('banking');
                    agentCore.initializeSession(sessionId);

                    // If both fields are missing or empty, should fail validation
                    const hasValidTaskCompleted = toolInput.taskCompleted && toolInput.taskCompleted.length > 0;
                    const hasValidSummary = toolInput.summary && toolInput.summary.length > 0;

                    const result = await agentCore.executeTool(
                        sessionId,
                        'return_to_triage',
                        toolInput,
                        'tool-use-id'
                    );

                    if (!hasValidTaskCompleted || !hasValidSummary) {
                        // Should fail validation
                        expect(result.success).toBe(false);
                        expect(result.error).toBeDefined();
                        expect(result.error).toMatch(/taskCompleted|summary/);
                    } else {
                        // Should succeed
                        expect(result.success).toBe(true);
                        expect(result.result.handoffRequest).toBeDefined();
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property: Handoff context should preserve all session state
     * 
     * For any handoff with verified user and user intent,
     * all context should be preserved in the handoff request.
     */
    it('should preserve all session state in handoff context', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uuid(),
                fc.constantFrom('transfer_to_banking', 'transfer_to_idv', 'transfer_to_mortgage'),
                verifiedUserArbitrary,
                userIntentArbitrary,
                handoffReasonArbitrary,
                async (sessionId, toolName, verifiedUser, userIntent, reason) => {
                    const agentCore = createAgentCore();
                    
                    // Initialize with full context
                    const memory = {
                        verified: true,
                        userName: verifiedUser.customer_name,
                        account: verifiedUser.account,
                        sortCode: verifiedUser.sortCode,
                        userIntent
                    };
                    
                    agentCore.initializeSession(sessionId, memory);

                    // Execute handoff
                    const result = await agentCore.executeTool(
                        sessionId,
                        toolName,
                        { reason },
                        'tool-use-id'
                    );

                    // All context should be preserved
                    expect(result.success).toBe(true);
                    const context = result.result.handoffRequest.context;
                    
                    expect(context.verified).toBe(true);
                    expect(context.userName).toBe(verifiedUser.customer_name);
                    expect(context.account).toBe(verifiedUser.account);
                    expect(context.sortCode).toBe(verifiedUser.sortCode);
                    expect(context.userIntent).toBe(userIntent);
                    expect(context.reason).toBe(reason);
                }
            ),
            { numRuns: 100 }
        );
    });
});
