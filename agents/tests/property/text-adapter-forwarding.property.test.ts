/**
 * Property-Based Tests for Text Adapter Forwarding Consistency
 * 
 * These tests verify that TextAdapter correctly forwards all messages between
 * WebSocket clients and Agent Core without loss or corruption.
 * 
 * Feature: voice-agnostic-agent-architecture, Property 2: Adapter Forwarding Consistency
 * 
 * For any sequence of user messages, the Text Adapter SHALL forward all messages to Agent Core
 * and send all responses to the client WebSocket without loss or corruption.
 * 
 * **Validates: Requirements 3.2, 3.3, 3.7**
 */

import * as fc from 'fast-check';
import { TextAdapter, TextAdapterConfig } from '../../src/text-adapter';
import { AgentCore, AgentCoreConfig, AgentResponse } from '../../src/agent-core';
import { GraphExecutor } from '../../src/graph-executor';
import { WorkflowDefinition } from '../../src/graph-types';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { PersonaConfig } from '../../src/persona-types';

// Mock WebSocket for tracking forwarded messages
class MockWebSocket {
    public sentMessages: any[] = [];
    public readyState: number = 1; // OPEN

    send(data: any): void {
        this.sentMessages.push(data);
    }

    close(): void {
        this.readyState = 3; // CLOSED
    }

    on(event: string, handler: Function): void {
        // Store handlers for testing
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
    allowedTools: ['check_balance', 'get_transactions', 'transfer_to_banking', 'return_to_triage'],
    metadata: {
        language: 'en-US',
        region: 'US',
        tone: 'professional'
    }
};

// Helper to create text adapter with mocked dependencies
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

    // Mock processUserMessage to return predictable responses
    jest.spyOn(agentCore, 'processUserMessage').mockImplementation(async (sessionId: string, message: string) => {
        // Return text response for most messages
        if (message.includes('tool')) {
            return {
                type: 'tool_call',
                content: '',
                toolCalls: [{
                    toolName: 'check_balance',
                    toolUseId: 'tool-123',
                    input: {},
                    timestamp: Date.now()
                }]
            };
        } else if (message.includes('handoff')) {
            return {
                type: 'handoff',
                content: '',
                handoffRequest: {
                    targetAgentId: 'banking',
                    context: { reason: 'User requested banking' },
                    graphState: {}
                }
            };
        } else if (message.includes('error')) {
            return {
                type: 'error',
                content: '',
                error: 'Test error'
            };
        } else {
            return {
                type: 'text',
                content: `Echo: ${message}`,
                toolCalls: undefined,
                handoffRequest: undefined,
                error: undefined
            };
        }
    });

    const config: TextAdapterConfig = {
        agentCore
    };

    const textAdapter = new TextAdapter(config);

    return { textAdapter, agentCore };
}

// Fast-check arbitraries for generating user messages
const userMessageArbitrary = fc.string({ minLength: 1, maxLength: 200 });

const toolRequestMessageArbitrary = fc.record({
    text: fc.string({ minLength: 1, maxLength: 200 }).map(s => `tool ${s}`)
});

const handoffRequestMessageArbitrary = fc.record({
    text: fc.string({ minLength: 1, maxLength: 200 }).map(s => `handoff ${s}`)
});

const errorRequestMessageArbitrary = fc.record({
    text: fc.string({ minLength: 1, maxLength: 200 }).map(s => `error ${s}`)
});

describe('Property-Based Tests: Text Adapter Forwarding Consistency', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Feature: voice-agnostic-agent-architecture, Property 2: Adapter Forwarding Consistency
     * 
     * For any sequence of user messages, the Text Adapter SHALL forward all messages to Agent Core
     * and send all responses to the client WebSocket without loss or corruption.
     * 
     * **Validates: Requirements 3.2, 3.3, 3.7**
     */
    describe('Property 2: Adapter Forwarding Consistency (Text Adapter)', () => {
        it('should forward all user messages to Agent Core without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        messages: fc.array(userMessageArbitrary, { minLength: 1, maxLength: 20 })
                    }),
                    async ({ sessionId, messages }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Spy on processUserMessage to verify forwarding
                        const processMessageSpy = jest.spyOn(agentCore, 'processUserMessage');

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Send all user messages
                            for (const message of messages) {
                                await textAdapter.handleUserInput(sessionId, message);
                            }

                            // All messages should be forwarded to Agent Core
                            expect(processMessageSpy).toHaveBeenCalledTimes(messages.length);

                            // Verify each message was forwarded correctly
                            for (let i = 0; i < messages.length; i++) {
                                expect(processMessageSpy).toHaveBeenNthCalledWith(
                                    i + 1,
                                    sessionId,
                                    messages[i]
                                );
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should send all Agent Core responses to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        messages: fc.array(userMessageArbitrary, { minLength: 1, maxLength: 20 })
                    }),
                    async ({ sessionId, messages }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Send all user messages
                            for (const message of messages) {
                                await textAdapter.handleUserInput(sessionId, message);
                            }

                            // Should receive user transcript + assistant response for each message
                            const userTranscripts = mockWs.getMessagesByType('transcript')
                                .filter(msg => msg.role === 'user');
                            const assistantTranscripts = mockWs.getMessagesByType('transcript')
                                .filter(msg => msg.role === 'assistant');

                            // All user messages should be echoed as transcripts
                            expect(userTranscripts.length).toBe(messages.length);

                            // All assistant responses should be sent
                            expect(assistantTranscripts.length).toBe(messages.length);

                            // Verify no corruption - each user transcript should match input
                            for (let i = 0; i < messages.length; i++) {
                                expect(userTranscripts[i].text).toBe(messages[i]);
                            }

                            // Verify assistant responses contain echoed content
                            for (let i = 0; i < messages.length; i++) {
                                expect(assistantTranscripts[i].text).toContain('Echo:');
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward tool call responses to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolMessages: fc.array(toolRequestMessageArbitrary, { minLength: 1, maxLength: 10 })
                    }),
                    async ({ sessionId, toolMessages }) => {
                        const { textAdapter } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Send all tool request messages
                            for (const msg of toolMessages) {
                                await textAdapter.handleUserInput(sessionId, msg.text);
                            }

                            // All tool calls should be forwarded to WebSocket
                            const toolUseMessages = mockWs.getMessagesByType('tool_use');
                            expect(toolUseMessages.length).toBe(toolMessages.length);

                            // Verify each tool call has required fields
                            for (const toolMsg of toolUseMessages) {
                                expect(toolMsg.toolName).toBeDefined();
                                expect(toolMsg.toolUseId).toBeDefined();
                                expect(toolMsg.input).toBeDefined();
                                expect(toolMsg.timestamp).toBeDefined();
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward handoff requests to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        handoffMessages: fc.array(handoffRequestMessageArbitrary, { minLength: 1, maxLength: 10 })
                    }),
                    async ({ sessionId, handoffMessages }) => {
                        const { textAdapter } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Send all handoff request messages
                            for (const msg of handoffMessages) {
                                await textAdapter.handleUserInput(sessionId, msg.text);
                            }

                            // All handoff requests should be forwarded to WebSocket
                            const handoffRequestMessages = mockWs.getMessagesByType('handoff_request');
                            expect(handoffRequestMessages.length).toBe(handoffMessages.length);

                            // Verify each handoff request has required fields
                            for (const handoffMsg of handoffRequestMessages) {
                                expect(handoffMsg.targetAgentId).toBeDefined();
                                expect(handoffMsg.context).toBeDefined();
                                expect(handoffMsg.graphState).toBeDefined();
                                expect(handoffMsg.timestamp).toBeDefined();
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward error responses to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        errorMessages: fc.array(errorRequestMessageArbitrary, { minLength: 1, maxLength: 10 })
                    }),
                    async ({ sessionId, errorMessages }) => {
                        const { textAdapter } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Send all error request messages
                            for (const msg of errorMessages) {
                                await textAdapter.handleUserInput(sessionId, msg.text);
                            }

                            // All error responses should be forwarded to WebSocket
                            const errorMsgs = mockWs.getMessagesByType('error');
                            expect(errorMsgs.length).toBe(errorMessages.length);

                            // Verify each error has required fields
                            for (const errorMsg of errorMsgs) {
                                expect(errorMsg.message).toBeDefined();
                                expect(errorMsg.timestamp).toBeDefined();
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward mixed message sequences without loss or corruption', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        messages: fc.array(
                            fc.oneof(
                                userMessageArbitrary,
                                toolRequestMessageArbitrary.map(m => m.text),
                                handoffRequestMessageArbitrary.map(m => m.text),
                                errorRequestMessageArbitrary.map(m => m.text)
                            ),
                            { minLength: 5, maxLength: 30 }
                        )
                    }),
                    async ({ sessionId, messages }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Spy on processUserMessage to verify forwarding
                        const processMessageSpy = jest.spyOn(agentCore, 'processUserMessage');

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Count expected message types
                            const expectedCounts = {
                                tool: messages.filter(m => m.includes('tool')).length,
                                handoff: messages.filter(m => m.includes('handoff')).length,
                                error: messages.filter(m => m.includes('error')).length,
                                text: messages.filter(m => !m.includes('tool') && !m.includes('handoff') && !m.includes('error')).length
                            };

                            // Send all messages
                            for (const message of messages) {
                                await textAdapter.handleUserInput(sessionId, message);
                            }

                            // All messages should be forwarded to Agent Core
                            expect(processMessageSpy).toHaveBeenCalledTimes(messages.length);

                            // Verify all user transcripts were sent
                            const userTranscripts = mockWs.getMessagesByType('transcript')
                                .filter(msg => msg.role === 'user');
                            expect(userTranscripts.length).toBe(messages.length);

                            // Verify all responses were sent (text or tool or handoff or error)
                            const assistantTranscripts = mockWs.getMessagesByType('transcript')
                                .filter(msg => msg.role === 'assistant');
                            const toolUseMessages = mockWs.getMessagesByType('tool_use');
                            const handoffMessages = mockWs.getMessagesByType('handoff_request');
                            const errorMessages = mockWs.getMessagesByType('error');

                            // Text responses should match text message count
                            expect(assistantTranscripts.length).toBe(expectedCounts.text);

                            // Tool calls should match tool message count
                            expect(toolUseMessages.length).toBe(expectedCounts.tool);

                            // Handoff requests should match handoff message count
                            expect(handoffMessages.length).toBe(expectedCounts.handoff);

                            // Error responses should match error message count
                            expect(errorMessages.length).toBe(expectedCounts.error);

                            // Total responses should match total messages
                            const totalResponses = 
                                assistantTranscripts.length +
                                toolUseMessages.length +
                                handoffMessages.length +
                                errorMessages.length;
                            expect(totalResponses).toBe(messages.length);

                            // Verify no corruption - user transcripts should match inputs
                            for (let i = 0; i < messages.length; i++) {
                                expect(userTranscripts[i].text).toBe(messages[i]);
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle concurrent messages without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        messages: fc.array(userMessageArbitrary, { minLength: 5, maxLength: 15 })
                    }),
                    async ({ sessionId, messages }) => {
                        const { textAdapter, agentCore } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        // Spy on processUserMessage to verify forwarding
                        const processMessageSpy = jest.spyOn(agentCore, 'processUserMessage');

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Send all messages concurrently
                            await Promise.all(
                                messages.map(message => textAdapter.handleUserInput(sessionId, message))
                            );

                            // All messages should be forwarded to Agent Core
                            expect(processMessageSpy).toHaveBeenCalledTimes(messages.length);

                            // All user transcripts should be sent
                            const userTranscripts = mockWs.getMessagesByType('transcript')
                                .filter(msg => msg.role === 'user');
                            expect(userTranscripts.length).toBe(messages.length);

                            // All assistant responses should be sent
                            const assistantTranscripts = mockWs.getMessagesByType('transcript')
                                .filter(msg => msg.role === 'assistant');
                            expect(assistantTranscripts.length).toBe(messages.length);

                            // Verify all messages were forwarded (order may vary due to concurrency)
                            const forwardedMessages = processMessageSpy.mock.calls.map(call => call[1]);
                            for (const message of messages) {
                                expect(forwardedMessages).toContain(message);
                            }

                            // Verify all user transcripts were sent (order may vary)
                            const userTexts = userTranscripts.map(t => t.text);
                            for (const message of messages) {
                                expect(userTexts).toContain(message);
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should echo user messages as transcripts for frontend display', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        messages: fc.array(userMessageArbitrary, { minLength: 1, maxLength: 20 })
                    }),
                    async ({ sessionId, messages }) => {
                        const { textAdapter } = createTextAdapter();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start text session
                            textAdapter.startTextSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Send all user messages
                            for (const message of messages) {
                                await textAdapter.handleUserInput(sessionId, message);
                            }

                            // All user messages should be echoed as transcripts
                            const userTranscripts = mockWs.getMessagesByType('transcript')
                                .filter(msg => msg.role === 'user');
                            expect(userTranscripts.length).toBe(messages.length);

                            // Verify each transcript matches the input message
                            for (let i = 0; i < messages.length; i++) {
                                expect(userTranscripts[i].text).toBe(messages[i]);
                                expect(userTranscripts[i].role).toBe('user');
                                expect(userTranscripts[i].timestamp).toBeDefined();
                            }
                        } finally {
                            textAdapter.stopTextSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
