/**
 * Property-Based Tests for Text Adapter Lifecycle Management
 * 
 * These tests verify that TextAdapter correctly manages text session lifecycle
 * (start, stop, cleanup) across all scenarios.
 * 
 * Feature: voice-agnostic-agent-architecture, Property 5: Text Session Lifecycle Management
 * 
 * For any text session, the Text Adapter SHALL initialize WebSocket handlers on startTextSession,
 * clean up on stopTextSession, and properly manage resources throughout the session lifecycle.
 * 
 * **Validates: Requirements 3.4**
 */

import * as fc from 'fast-check';
import { TextAdapter, TextAdapterConfig } from '../../src/text-adapter';
import { AgentCore, AgentCoreConfig } from '../../src/agent-core';
import { GraphExecutor } from '../../src/graph-executor';
import { WorkflowDefinition } from '../../src/graph-types';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { PersonaConfig } from '../../src/persona-types';

// Mock WebSocket for tracking lifecycle
class MockWebSocket {
    public sentMessages: any[] = [];
    public readyState: number = 1; // OPEN
    public isClosed: boolean = false;
    public eventHandlers: Map<string, Function[]> = new Map();

    send(data: any): void {
        this.sentMessages.push(data);
    }

    close(): void {
        this.readyState = 3; // CLOSED
        this.isClosed = true;
    }

    on(event: string, handler: Function): void {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event)!.push(handler);
    }

    getMessagesByType(type: string): any[] {
        return this.sentMessages
            .filter(msg => typeof msg === 'string')
            .map(msg => JSON.parse(msg))
            .filter(parsed => parsed.type === type);
    }

    clearMessages(): void {
        this.sentMessages = [];
    }

    // Helper to check if resources are cleaned up
    isCleanedUp(): boolean {
        return this.isClosed;
    }
}

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

// Helper to create text adapter
function createTextAdapter(): { textAdapter: TextAdapter; agentCore: AgentCore } {
    const mockToolsClient = new ToolsClient('http://localhost:9000');
    const mockDecisionEvaluator = new DecisionEvaluator('us-east-1');
    const mockGraphExecutor = new GraphExecutor(mockWorkflow);

    // Mock tool execution to always succeed
    jest.spyOn(mockToolsClient, 'executeTool').mockResolvedValue({
        success: true,
        result: { balance: 1000 }
    });

    const agentCoreConfig: AgentCoreConfig = {
        agentId: 'test-agent',
        workflowDef: mockWorkflow,
        personaConfig: mockPersona,
        toolsClient: mockToolsClient,
        decisionEvaluator: mockDecisionEvaluator,
        graphExecutor: mockGraphExecutor,
        localToolsUrl: 'http://localhost:9000'
    };

    const agentCore = new AgentCore(agentCoreConfig);

    const config: TextAdapterConfig = {
        agentCore
    };

    const textAdapter = new TextAdapter(config);

    return { textAdapter, agentCore };
}

describe('Property-Based Tests: Text Adapter Lifecycle Management', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Feature: voice-agnostic-agent-architecture, Property 5: Text Session Lifecycle Management
     * 
     * For any text session, the Text Adapter SHALL initialize WebSocket handlers on startTextSession,
     * clean up on stopTextSession, and properly manage resources throughout the session lifecycle.
     * 
     * **Validates: Requirements 3.4**
     */
    describe('Property 5: Text Session Lifecycle Management', () => {
        it('should initialize session on startTextSession', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        memory: fc.option(
                            fc.record({
                                verified: fc.boolean(),
                                userName: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined }),
                                account: fc.option(fc.string({ minLength: 8, maxLength: 8 }), { nil: undefined }),
                                sortCode: fc.option(fc.string({ minLength: 6, maxLength: 6 }), { nil: undefined })
                            }),
                            { nil: undefined }
                        )
                    }),
                    async ({ sessionId, memory }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any, memory);

                            // Session should exist in TextAdapter
                            expect(textAdapter.hasSession(sessionId)).toBe(true);

                            // Agent Core session should be initialized
                            const session = agentCore.getSession(sessionId);
                            expect(session).toBeDefined();
                            expect(session?.sessionId).toBe(sessionId);

                            // Should send connected message to client
                            const connectedMessages = mockWs.getMessagesByType('connected');
                            expect(connectedMessages.length).toBe(1);
                            expect(connectedMessages[0].sessionId).toBe(sessionId);

                            // If memory provided, should be restored
                            if (memory?.verified && memory.userName) {
                                expect(session?.verifiedUser).toBeDefined();
                                expect(session?.verifiedUser?.customer_name).toBe(memory.userName);
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should clean up session on stopTextSession', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Start text session
                        textAdapter.startTextSession(sessionId, mockWs as any);

                        // Verify session is started
                        expect(textAdapter.hasSession(sessionId)).toBe(true);
                        expect(agentCore.getSession(sessionId)).toBeDefined();

                        // Stop text session
                        textAdapter.stopTextSession(sessionId);

                        // Session should be removed from TextAdapter
                        expect(textAdapter.hasSession(sessionId)).toBe(false);

                        // Agent Core session should be cleaned up
                        expect(agentCore.getSession(sessionId)).toBeUndefined();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should clean up resources on errors during startTextSession', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Mock Agent Core to fail on session initialization
                        jest.spyOn(agentCore, 'initializeSession').mockImplementationOnce(() => {
                            throw new Error('Failed to initialize session');
                        });

                        try {
                            // Attempt to start text session (should fail)
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            
                            // Should not reach here
                            expect(true).toBe(false);
                        } catch (error: any) {
                            // Should throw error
                            expect(error.message).toContain('Failed to initialize session');

                            // Session should NOT exist in TextAdapter
                            expect(textAdapter.hasSession(sessionId)).toBe(false);

                            // Agent Core session should be cleaned up
                            expect(agentCore.getSession(sessionId)).toBeUndefined();

                            // Should send error message to client
                            const errorMessages = mockWs.getMessagesByType('error');
                            expect(errorMessages.length).toBe(1);
                            expect(errorMessages[0].message).toContain('Failed to start text session');
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should clean up resources even if endSession fails', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Start text session
                        textAdapter.startTextSession(sessionId, mockWs as any);

                        // Verify session is started
                        expect(textAdapter.hasSession(sessionId)).toBe(true);

                        // Mock Agent Core to fail on endSession
                        jest.spyOn(agentCore, 'endSession').mockImplementationOnce(() => {
                            throw new Error('Failed to end session');
                        });

                        // Stop text session (should handle error gracefully)
                        textAdapter.stopTextSession(sessionId);

                        // Session should still be removed from TextAdapter (force cleanup)
                        expect(textAdapter.hasSession(sessionId)).toBe(false);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should not leak resources across multiple session starts and stops', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessions: fc.array(
                            fc.record({
                                sessionId: fc.uuid()
                            }),
                            { minLength: 1, maxLength: 10 }
                        )
                    }),
                    async ({ sessions }) => {
                        const { textAdapter, agentCore } = createTextAdapter();

                        // Start and stop each session
                        for (const { sessionId } of sessions) {
                            const mockWs = new MockWebSocket();

                            // Start session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            expect(textAdapter.hasSession(sessionId)).toBe(true);
                            expect(agentCore.getSession(sessionId)).toBeDefined();

                            // Stop session
                            textAdapter.stopTextSession(sessionId);
                            expect(textAdapter.hasSession(sessionId)).toBe(false);
                            expect(agentCore.getSession(sessionId)).toBeUndefined();
                        }

                        // No sessions should remain
                        expect(textAdapter.getActiveSessionCount()).toBe(0);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle concurrent session starts without resource leaks', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessions: fc.array(
                            fc.record({
                                sessionId: fc.uuid()
                            }),
                            { minLength: 2, maxLength: 5 }
                        )
                    }),
                    async ({ sessions }) => {
                        const { textAdapter, agentCore } = createTextAdapter();

                        // Start all sessions concurrently
                        const startPromises = sessions.map(({ sessionId }) => {
                            const mockWs = new MockWebSocket();
                            return Promise.resolve(textAdapter.startTextSession(sessionId, mockWs as any));
                        });

                        await Promise.all(startPromises);

                        // All sessions should exist
                        for (const { sessionId } of sessions) {
                            expect(textAdapter.hasSession(sessionId)).toBe(true);
                            expect(agentCore.getSession(sessionId)).toBeDefined();
                        }

                        expect(textAdapter.getActiveSessionCount()).toBe(sessions.length);

                        // Stop all sessions concurrently
                        const stopPromises = sessions.map(({ sessionId }) =>
                            Promise.resolve(textAdapter.stopTextSession(sessionId))
                        );

                        await Promise.all(stopPromises);

                        // No sessions should remain
                        for (const { sessionId } of sessions) {
                            expect(textAdapter.hasSession(sessionId)).toBe(false);
                            expect(agentCore.getSession(sessionId)).toBeUndefined();
                        }

                        expect(textAdapter.getActiveSessionCount()).toBe(0);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should prevent duplicate session starts', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { textAdapter } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Start text session
                        textAdapter.startTextSession(sessionId, mockWs as any);

                        // Verify session is started
                        expect(textAdapter.hasSession(sessionId)).toBe(true);

                        try {
                            // Attempt to start same session again (should fail)
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            
                            // Should not reach here
                            expect(true).toBe(false);
                        } catch (error: any) {
                            // Should throw error about duplicate session
                            expect(error.message).toContain('Text session already exists');

                            // Original session should still exist
                            expect(textAdapter.hasSession(sessionId)).toBe(true);
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle stopTextSession gracefully for non-existent sessions', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { textAdapter } = createTextAdapter();

                        // Attempt to stop non-existent session (should not throw)
                        textAdapter.stopTextSession(sessionId);

                        // Session should not exist
                        expect(textAdapter.hasSession(sessionId)).toBe(false);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should clean up Agent Core session when text session lifecycle completes', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
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
                    async ({ sessionId, memory }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Start text session with memory
                        textAdapter.startTextSession(sessionId, mockWs as any, memory);

                        // Verify Agent Core session exists with memory
                        const session = agentCore.getSession(sessionId);
                        expect(session).toBeDefined();
                        
                        if (memory?.verified && memory.userName) {
                            expect(session?.verifiedUser).toBeDefined();
                            expect(session?.verifiedUser?.customer_name).toBe(memory.userName);
                        }

                        // Stop text session
                        textAdapter.stopTextSession(sessionId);

                        // Agent Core session should be cleaned up
                        expect(agentCore.getSession(sessionId)).toBeUndefined();

                        // Memory should be cleared
                        expect(agentCore.getSessionMemory(sessionId)).toEqual({});
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should maintain lifecycle integrity across message operations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        messages: fc.array(
                            fc.string({ minLength: 1, maxLength: 200 }),
                            { minLength: 1, maxLength: 10 }
                        )
                    }),
                    async ({ sessionId, messages }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Mock processUserMessage to return text responses
                        jest.spyOn(agentCore, 'processUserMessage').mockResolvedValue({
                            type: 'text',
                            content: 'Response',
                            toolCalls: undefined,
                            handoffRequest: undefined,
                            error: undefined
                        });

                        // Start text session
                        textAdapter.startTextSession(sessionId, mockWs as any);

                        // Send messages
                        for (const message of messages) {
                            await textAdapter.handleUserInput(sessionId, message);
                        }

                        // Session should still be active
                        expect(textAdapter.hasSession(sessionId)).toBe(true);
                        expect(agentCore.getSession(sessionId)).toBeDefined();

                        // Stop text session
                        textAdapter.stopTextSession(sessionId);

                        // Session should be cleaned up
                        expect(textAdapter.hasSession(sessionId)).toBe(false);
                        expect(agentCore.getSession(sessionId)).toBeUndefined();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should transition through session states correctly (not started → active → stopped)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // State: not started
                        expect(textAdapter.hasSession(sessionId)).toBe(false);
                        expect(agentCore.getSession(sessionId)).toBeUndefined();

                        // Transition to: active
                        textAdapter.startTextSession(sessionId, mockWs as any);
                        expect(textAdapter.hasSession(sessionId)).toBe(true);
                        expect(agentCore.getSession(sessionId)).toBeDefined();

                        // Transition to: stopped
                        textAdapter.stopTextSession(sessionId);
                        expect(textAdapter.hasSession(sessionId)).toBe(false);
                        expect(agentCore.getSession(sessionId)).toBeUndefined();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle session initialization with various memory configurations', async () => {
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
                                userIntent: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined })
                            }),
                            { nil: undefined }
                        )
                    }),
                    async ({ sessionId, memory }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start text session with memory
                            textAdapter.startTextSession(sessionId, mockWs as any, memory);

                            // Session should be initialized
                            expect(textAdapter.hasSession(sessionId)).toBe(true);
                            const session = agentCore.getSession(sessionId);
                            expect(session).toBeDefined();

                            // Verify memory restoration
                            if (memory) {
                                if (memory.verified && memory.userName) {
                                    expect(session?.verifiedUser).toBeDefined();
                                    expect(session?.verifiedUser?.customer_name).toBe(memory.userName);
                                    
                                    if (memory.account) {
                                        expect(session?.verifiedUser?.account).toBe(memory.account);
                                    }
                                    
                                    if (memory.sortCode) {
                                        expect(session?.verifiedUser?.sortCode).toBe(memory.sortCode);
                                    }
                                }
                                
                                if (memory.userIntent) {
                                    expect(session?.userIntent).toBe(memory.userIntent);
                                }
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should properly clean up after handling errors during message processing', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        message: fc.string({ minLength: 1, maxLength: 200 })
                    }),
                    async ({ sessionId, message }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Start text session
                        textAdapter.startTextSession(sessionId, mockWs as any);

                        // Mock processUserMessage to throw error
                        jest.spyOn(agentCore, 'processUserMessage').mockRejectedValueOnce(
                            new Error('Processing failed')
                        );

                        // Send message (should handle error gracefully)
                        await textAdapter.handleUserInput(sessionId, message);

                        // Session should still exist (error doesn't terminate session)
                        expect(textAdapter.hasSession(sessionId)).toBe(true);
                        expect(agentCore.getSession(sessionId)).toBeDefined();

                        // Should send error message to client
                        const errorMessages = mockWs.getMessagesByType('error');
                        expect(errorMessages.length).toBeGreaterThan(0);

                        // Stop session should still work
                        textAdapter.stopTextSession(sessionId);
                        expect(textAdapter.hasSession(sessionId)).toBe(false);
                        expect(agentCore.getSession(sessionId)).toBeUndefined();
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
