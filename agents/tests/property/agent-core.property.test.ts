/**
 * Property-Based Tests for Agent Core
 * 
 * These tests verify universal properties that should hold across all inputs
 * using the fast-check library for property-based testing.
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
        { id: 'greeting', type: 'message', label: 'Greeting', message: 'Hello!' },
        { id: 'end', type: 'end', label: 'End', outcome: 'success' }
    ],
    edges: [
        { from: 'start', to: 'greeting', label: 'begin' },
        { from: 'greeting', to: 'end', label: 'complete' }
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
    allowedTools: ['check_balance', 'get_transactions'],
    metadata: {
        language: 'en-US',
        region: 'US',
        tone: 'professional'
    }
};

// Helper to create agent core
function createAgentCore(): AgentCore {
    const mockToolsClient = new ToolsClient('http://localhost:9000');
    const mockDecisionEvaluator = new DecisionEvaluator('us-east-1');
    const mockGraphExecutor = new GraphExecutor(mockWorkflow);

    const config: AgentCoreConfig = {
        agentId: 'test-agent',
        workflowDef: mockWorkflow,
        personaConfig: mockPersona,
        toolsClient: mockToolsClient,
        decisionEvaluator: mockDecisionEvaluator,
        graphExecutor: mockGraphExecutor,
        localToolsUrl: 'http://localhost:9000'
    };

    return new AgentCore(config);
}

describe('Property-Based Tests: Agent Core', () => {
    /**
     * Feature: voice-agnostic-agent-architecture, Property 1: Agent Core I/O Independence
     * 
     * For any workflow execution in Agent_Core, the execution should complete successfully
     * without requiring SonicClient, WebSocket, or any other I/O-specific dependencies.
     * 
     * **Validates: Requirements 1.2, 1.4, 1.5**
     */
    describe('Property 1: Agent Core I/O Independence', () => {
        it('should execute workflows without I/O dependencies', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        userMessage: fc.string({ minLength: 1, maxLength: 200 })
                    }),
                    async ({ sessionId, userMessage }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session
                        agentCore.initializeSession(sessionId);
                        
                        // Process message - should complete without I/O dependencies
                        const response = await agentCore.processUserMessage(sessionId, userMessage);
                        
                        // Should complete without throwing
                        expect(response).toBeDefined();
                        expect(response.type).toMatch(/text|tool_call|handoff|error/);
                        
                        // Clean up
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should initialize sessions without I/O dependencies', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        memory: fc.option(
                            fc.record({
                                verified: fc.boolean(),
                                userName: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined }),
                                account: fc.option(fc.string({ minLength: 8, maxLength: 8 }), { nil: undefined }),
                                sortCode: fc.option(fc.string({ minLength: 6, maxLength: 6 }), { nil: undefined }),
                                userIntent: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined })
                            }),
                            { nil: undefined }
                        )
                    }),
                    async ({ sessionId, memory }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session with or without memory
                        const session = agentCore.initializeSession(sessionId, memory);
                        
                        // Should complete without I/O dependencies
                        expect(session).toBeDefined();
                        expect(session.sessionId).toBe(sessionId);
                        expect(session.messages).toEqual([]);
                        
                        // Verify memory restoration if provided
                        if (memory?.verified && memory.userName) {
                            expect(session.verifiedUser).toBeDefined();
                            expect(session.verifiedUser?.customer_name).toBe(memory.userName);
                        }
                        
                        if (memory?.userIntent) {
                            expect(session.userIntent).toBe(memory.userIntent);
                        }
                        
                        // Clean up
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should generate system prompts without I/O dependencies', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        memory: fc.option(
                            fc.record({
                                verified: fc.boolean(),
                                userName: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined }),
                                account: fc.option(fc.string({ minLength: 8, maxLength: 8 }), { nil: undefined }),
                                sortCode: fc.option(fc.string({ minLength: 6, maxLength: 6 }), { nil: undefined }),
                                userIntent: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined })
                            }),
                            { nil: undefined }
                        )
                    }),
                    async ({ sessionId, memory }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session
                        agentCore.initializeSession(sessionId, memory);
                        
                        // Generate system prompt - should complete without I/O
                        const prompt = agentCore.getSystemPrompt(sessionId);
                        
                        // Should complete without throwing
                        expect(prompt).toBeDefined();
                        expect(typeof prompt).toBe('string');
                        
                        // If memory provided, should be injected
                        if (memory?.verified && memory.userName) {
                            expect(prompt).toContain('CURRENT SESSION CONTEXT');
                            expect(prompt).toContain(memory.userName);
                        }
                        
                        if (memory?.userIntent) {
                            expect(prompt).toContain(memory.userIntent);
                        }
                        
                        // Clean up
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should manage workflow state without I/O dependencies', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        nodeId: fc.constantFrom('start', 'greeting', 'end')
                    }),
                    async ({ sessionId, nodeId }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session
                        agentCore.initializeSession(sessionId);
                        
                        // Update workflow state - should complete without I/O
                        const update = agentCore.updateWorkflowState(sessionId, nodeId);
                        
                        // Should complete without throwing
                        expect(update).toBeDefined();
                        expect(update.currentNode).toBe(nodeId);
                        
                        // Clean up
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Feature: voice-agnostic-agent-architecture, Property 3: Session State Persistence
     * 
     * For any session operation (message processing, tool execution, handoff), the session
     * state should be maintained and accessible for subsequent operations within the same session.
     * 
     * **Validates: Requirements 1.7, 4.8**
     */
    describe('Property 3: Session State Persistence', () => {
        it('should persist session state across operations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        messages: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 })
                    }),
                    async ({ sessionId, messages }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session
                        agentCore.initializeSession(sessionId);
                        
                        // Process multiple messages
                        for (const message of messages) {
                            await agentCore.processUserMessage(sessionId, message);
                        }
                        
                        // Session should still exist and contain all messages
                        const session = agentCore.getSession(sessionId);
                        expect(session).toBeDefined();
                        expect(session?.messages.length).toBe(messages.length);
                        
                        // Verify all messages are stored
                        for (let i = 0; i < messages.length; i++) {
                            expect(session?.messages[i].content).toBe(messages[i]);
                            expect(session?.messages[i].role).toBe('user');
                        }
                        
                        // Clean up
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should persist memory updates across operations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        initialMemory: fc.option(
                            fc.record({
                                verified: fc.boolean(),
                                userName: fc.string({ minLength: 5, maxLength: 50 }),
                                account: fc.string({ minLength: 8, maxLength: 8 }),
                                sortCode: fc.string({ minLength: 6, maxLength: 6 })
                            }),
                            { nil: undefined }
                        ),
                        updatedMemory: fc.record({
                            verified: fc.boolean(),
                            userName: fc.string({ minLength: 5, maxLength: 50 }),
                            account: fc.string({ minLength: 8, maxLength: 8 }),
                            sortCode: fc.string({ minLength: 6, maxLength: 6 })
                        })
                    }),
                    async ({ sessionId, initialMemory, updatedMemory }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session with initial memory
                        agentCore.initializeSession(sessionId, initialMemory);
                        
                        // Update memory
                        agentCore.updateSessionMemory(sessionId, updatedMemory);
                        
                        // Memory should be persisted
                        const memory = agentCore.getSessionMemory(sessionId);
                        expect(memory.verified).toBe(updatedMemory.verified);
                        
                        if (updatedMemory.verified) {
                            expect(memory.userName).toBe(updatedMemory.userName);
                            expect(memory.account).toBe(updatedMemory.account);
                            expect(memory.sortCode).toBe(updatedMemory.sortCode);
                        }
                        
                        // Clean up
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should persist workflow state across operations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        nodeSequence: fc.array(
                            fc.constantFrom('start', 'greeting', 'end'),
                            { minLength: 1, maxLength: 3 }
                        )
                    }),
                    async ({ sessionId, nodeSequence }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session
                        agentCore.initializeSession(sessionId);
                        
                        // Update workflow state multiple times
                        let lastNode = 'start';
                        for (const nodeId of nodeSequence) {
                            const update = agentCore.updateWorkflowState(sessionId, nodeId);
                            expect(update.currentNode).toBe(nodeId);
                            lastNode = nodeId;
                        }
                        
                        // Session should persist the last node
                        const session = agentCore.getSession(sessionId);
                        expect(session?.currentNode).toBe(lastNode);
                        
                        // Clean up
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should maintain session state after handoff request', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        targetAgent: fc.constantFrom('banking', 'idv', 'triage'),
                        memory: fc.option(
                            fc.record({
                                verified: fc.boolean(),
                                userName: fc.string({ minLength: 5, maxLength: 50 }),
                                account: fc.string({ minLength: 8, maxLength: 8 }),
                                sortCode: fc.string({ minLength: 6, maxLength: 6 }),
                                userIntent: fc.string({ minLength: 5, maxLength: 100 })
                            }),
                            { nil: undefined }
                        )
                    }),
                    async ({ sessionId, targetAgent, memory }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session with memory
                        agentCore.initializeSession(sessionId, memory);
                        
                        // Request handoff
                        const handoff = agentCore.requestHandoff(sessionId, targetAgent, {
                            reason: 'User needs specialist assistance'
                        });
                        
                        // Session should still exist after handoff request
                        const session = agentCore.getSession(sessionId);
                        expect(session).toBeDefined();
                        
                        // Memory should be preserved
                        if (memory?.verified && memory.userName) {
                            expect(session?.verifiedUser).toBeDefined();
                            expect(session?.verifiedUser?.customer_name).toBe(memory.userName);
                        }
                        
                        if (memory?.userIntent) {
                            expect(session?.userIntent).toBe(memory.userIntent);
                        }
                        
                        // Handoff should include session context
                        if (memory?.verified && memory.userName) {
                            expect(handoff.context.verified).toBe(true);
                            expect(handoff.context.userName).toBe(memory.userName);
                        }
                        
                        // Clean up
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should clear session state on end', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        messages: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
                        memory: fc.option(
                            fc.record({
                                verified: fc.boolean(),
                                userName: fc.string({ minLength: 5, maxLength: 50 }),
                                account: fc.string({ minLength: 8, maxLength: 8 }),
                                sortCode: fc.string({ minLength: 6, maxLength: 6 })
                            }),
                            { nil: undefined }
                        )
                    }),
                    async ({ sessionId, messages, memory }) => {
                        const agentCore = createAgentCore();
                        
                        // Initialize session with memory
                        agentCore.initializeSession(sessionId, memory);
                        
                        // Process messages
                        for (const message of messages) {
                            await agentCore.processUserMessage(sessionId, message);
                        }
                        
                        // Verify session exists
                        expect(agentCore.getSession(sessionId)).toBeDefined();
                        
                        // End session
                        agentCore.endSession(sessionId);
                        
                        // Session should be cleared
                        expect(agentCore.getSession(sessionId)).toBeUndefined();
                        
                        // Memory should be cleared
                        expect(agentCore.getSessionMemory(sessionId)).toEqual({});
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
