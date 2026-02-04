/**
 * Property-Based Tests for Voice Side-Car Forwarding Consistency
 * 
 * These tests verify that VoiceSideCar correctly forwards all events between
 * SonicClient and Agent Core without loss or corruption.
 * 
 * Feature: voice-agnostic-agent-architecture, Property 2: Adapter Forwarding Consistency
 * 
 * For any sequence of events from SonicClient, the Voice Side-Car SHALL forward all events
 * to the client WebSocket and delegate tool executions to Agent Core without loss or corruption.
 * 
 * **Validates: Requirements 2.2, 2.3, 2.6**
 */

import * as fc from 'fast-check';
import { VoiceSideCar, VoiceSideCarConfig } from '../../src/voice-sidecar';
import { AgentCore, AgentCoreConfig } from '../../src/agent-core';
import { SonicConfig, SonicEvent } from '../../src/sonic-client';
import { GraphExecutor } from '../../src/graph-executor';
import { WorkflowDefinition } from '../../src/graph-types';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { PersonaConfig } from '../../src/persona-types';

// Mock SonicClient
jest.mock('../../src/sonic-client', () => {
    return {
        SonicClient: jest.fn().mockImplementation(() => ({
            startSession: jest.fn().mockResolvedValue(undefined),
            setConfig: jest.fn(),
            stopSession: jest.fn().mockResolvedValue(undefined),
            sendAudioChunk: jest.fn().mockResolvedValue(undefined),
            endAudioInput: jest.fn().mockResolvedValue(undefined),
            sendText: jest.fn().mockResolvedValue(undefined),
            sendToolResult: jest.fn().mockResolvedValue(undefined)
        }))
    };
});

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

    getBinaryMessages(): Buffer[] {
        return this.sentMessages.filter(msg => Buffer.isBuffer(msg));
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

// Helper to create voice side-car with mocked dependencies
function createVoiceSideCar(): { voiceSideCar: VoiceSideCar; agentCore: AgentCore } {
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

    const sonicConfig: SonicConfig = {
        region: 'us-east-1',
        modelId: 'amazon.nova-2-sonic-v1:0',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
    };

    const config: VoiceSideCarConfig = {
        agentCore,
        sonicConfig
    };

    const voiceSideCar = new VoiceSideCar(config);

    return { voiceSideCar, agentCore };
}

// Fast-check arbitraries for generating SonicEvents
const audioEventArbitrary = fc.record({
    type: fc.constant('audio' as const),
    data: fc.record({
        buffer: fc.uint8Array({ minLength: 100, maxLength: 3200 }).map(arr => Buffer.from(arr))
    })
});

const transcriptEventArbitrary = fc.record({
    type: fc.constant('transcript' as const),
    data: fc.record({
        role: fc.constantFrom('user', 'assistant'),
        text: fc.string({ minLength: 1, maxLength: 200 })
    })
});

const toolUseEventArbitrary = fc.record({
    type: fc.constant('toolUse' as const),
    data: fc.record({
        toolName: fc.constantFrom('check_balance', 'get_transactions', 'transfer_to_banking', 'return_to_triage'),
        toolUseId: fc.uuid(),
        input: fc.record({
            accountNumber: fc.option(fc.string({ minLength: 8, maxLength: 8 }), { nil: undefined }),
            reason: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
            taskCompleted: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined })
        })
    })
});

const metadataEventArbitrary = fc.record({
    type: fc.constant('metadata' as const),
    data: fc.record({
        sentiment: fc.constantFrom('positive', 'negative', 'neutral'),
        confidence: fc.double({ min: 0, max: 1, noNaN: true })
    })
});

const errorEventArbitrary = fc.record({
    type: fc.constant('error' as const),
    data: fc.record({
        message: fc.string({ minLength: 5, maxLength: 100 }),
        details: fc.string({ minLength: 10, maxLength: 200 })
    })
});

const interruptionEventArbitrary = fc.record({
    type: fc.constant('interruption' as const),
    data: fc.record({
        reason: fc.string({ minLength: 5, maxLength: 50 }),
        timestamp: fc.integer({ min: Date.now() - 10000, max: Date.now() })
    })
});

const usageEventArbitrary = fc.record({
    type: fc.constant('usageEvent' as const),
    data: fc.record({
        inputTokens: fc.integer({ min: 0, max: 10000 }),
        outputTokens: fc.integer({ min: 0, max: 10000 }),
        totalTokens: fc.integer({ min: 0, max: 20000 })
    })
});

const workflowUpdateEventArbitrary = fc.record({
    type: fc.constant('workflow_update' as const),
    data: fc.record({
        nodeId: fc.constantFrom('start', 'greeting', 'end')
    })
});

const sessionStartEventArbitrary = fc.record({
    type: fc.constant('session_start' as const),
    data: fc.record({
        sessionId: fc.uuid(),
        timestamp: fc.integer({ min: Date.now() - 10000, max: Date.now() })
    })
});

const contentStartEventArbitrary = fc.record({
    type: fc.constant('contentStart' as const),
    data: fc.constant({})
});

const contentEndEventArbitrary = fc.record({
    type: fc.constant('contentEnd' as const),
    data: fc.constant({})
});

const interactionTurnEndEventArbitrary = fc.record({
    type: fc.constant('interactionTurnEnd' as const),
    data: fc.constant({})
});

// Combined arbitrary for any SonicEvent
const sonicEventArbitrary = fc.oneof(
    audioEventArbitrary,
    transcriptEventArbitrary,
    toolUseEventArbitrary,
    metadataEventArbitrary,
    errorEventArbitrary,
    interruptionEventArbitrary,
    usageEventArbitrary,
    workflowUpdateEventArbitrary,
    sessionStartEventArbitrary,
    contentStartEventArbitrary,
    contentEndEventArbitrary,
    interactionTurnEndEventArbitrary
);

describe('Property-Based Tests: Voice Side-Car Forwarding Consistency', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Feature: voice-agnostic-agent-architecture, Property 2: Adapter Forwarding Consistency
     * 
     * For any sequence of events from SonicClient, the Voice Side-Car SHALL forward all events
     * to the client WebSocket and delegate tool executions to Agent Core without loss or corruption.
     * 
     * **Validates: Requirements 2.2, 2.3, 2.6**
     */
    describe('Property 2: Adapter Forwarding Consistency', () => {
        it('should forward all audio events to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        audioEvents: fc.array(audioEventArbitrary, { minLength: 1, maxLength: 20 })
                    }),
                    async ({ sessionId, audioEvents }) => {
                        const { voiceSideCar } = createVoiceSideCar();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Simulate audio events from SonicClient
                            for (const event of audioEvents) {
                                await (voiceSideCar as any).handleSonicEvent(sessionId, event);
                            }

                            // All audio events should be forwarded as binary
                            const binaryMessages = mockWs.getBinaryMessages();
                            expect(binaryMessages.length).toBe(audioEvents.length);

                            // Verify no corruption - each buffer should match
                            for (let i = 0; i < audioEvents.length; i++) {
                                expect(binaryMessages[i]).toEqual(audioEvents[i].data.buffer);
                            }
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward all transcript events to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        transcriptEvents: fc.array(transcriptEventArbitrary, { minLength: 1, maxLength: 20 })
                    }),
                    async ({ sessionId, transcriptEvents }) => {
                        const { voiceSideCar } = createVoiceSideCar();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Simulate transcript events from SonicClient
                            for (const event of transcriptEvents) {
                                await (voiceSideCar as any).handleSonicEvent(sessionId, event);
                            }

                            // All transcript events should be forwarded
                            const transcriptMessages = mockWs.getMessagesByType('transcript');
                            expect(transcriptMessages.length).toBe(transcriptEvents.length);

                            // Verify no corruption - each transcript should match
                            for (let i = 0; i < transcriptEvents.length; i++) {
                                expect(transcriptMessages[i].role).toBe(transcriptEvents[i].data.role);
                                expect(transcriptMessages[i].text).toBe(transcriptEvents[i].data.text);
                            }
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should delegate all tool executions to Agent Core without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolEvents: fc.array(toolUseEventArbitrary, { minLength: 1, maxLength: 10 })
                    }),
                    async ({ sessionId, toolEvents }) => {
                        const { voiceSideCar, agentCore } = createVoiceSideCar();
                        const mockWs = new MockWebSocket();

                        // Spy on executeTool to verify delegation
                        const executeToolSpy = jest.spyOn(agentCore, 'executeTool');

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Simulate tool use events from SonicClient
                            for (const event of toolEvents) {
                                await (voiceSideCar as any).handleSonicEvent(sessionId, event);
                            }

                            // All tool executions should be delegated to Agent Core
                            expect(executeToolSpy).toHaveBeenCalledTimes(toolEvents.length);

                            // Verify each tool was called with correct parameters
                            for (let i = 0; i < toolEvents.length; i++) {
                                expect(executeToolSpy).toHaveBeenNthCalledWith(
                                    i + 1,
                                    sessionId,
                                    toolEvents[i].data.toolName,
                                    toolEvents[i].data.input,
                                    toolEvents[i].data.toolUseId
                                );
                            }

                            // All tool results should be forwarded to WebSocket
                            const toolResultMessages = mockWs.getMessagesByType('tool_result');
                            expect(toolResultMessages.length).toBe(toolEvents.length);
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward all metadata events to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        metadataEvents: fc.array(metadataEventArbitrary, { minLength: 1, maxLength: 20 })
                    }),
                    async ({ sessionId, metadataEvents }) => {
                        const { voiceSideCar } = createVoiceSideCar();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Simulate metadata events from SonicClient
                            for (const event of metadataEvents) {
                                await (voiceSideCar as any).handleSonicEvent(sessionId, event);
                            }

                            // All metadata events should be forwarded
                            const metadataMessages = mockWs.getMessagesByType('metadata');
                            expect(metadataMessages.length).toBe(metadataEvents.length);

                            // Verify no corruption
                            for (let i = 0; i < metadataEvents.length; i++) {
                                expect(metadataMessages[i].data.sentiment).toBe(metadataEvents[i].data.sentiment);
                                expect(metadataMessages[i].data.confidence).toBe(metadataEvents[i].data.confidence);
                            }
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward all error events to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        errorEvents: fc.array(errorEventArbitrary, { minLength: 1, maxLength: 10 })
                    }),
                    async ({ sessionId, errorEvents }) => {
                        const { voiceSideCar } = createVoiceSideCar();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Simulate error events from SonicClient
                            for (const event of errorEvents) {
                                await (voiceSideCar as any).handleSonicEvent(sessionId, event);
                            }

                            // All error events should be forwarded
                            const errorMessages = mockWs.getMessagesByType('error');
                            expect(errorMessages.length).toBe(errorEvents.length);

                            // Verify no corruption
                            for (let i = 0; i < errorEvents.length; i++) {
                                expect(errorMessages[i].message).toBe(errorEvents[i].data.message);
                                expect(errorMessages[i].details).toBe(errorEvents[i].data.details);
                            }
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward all usage events to WebSocket without loss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        usageEvents: fc.array(usageEventArbitrary, { minLength: 1, maxLength: 20 })
                    }),
                    async ({ sessionId, usageEvents }) => {
                        const { voiceSideCar } = createVoiceSideCar();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Simulate usage events from SonicClient
                            for (const event of usageEvents) {
                                await (voiceSideCar as any).handleSonicEvent(sessionId, event);
                            }

                            // All usage events should be forwarded
                            const usageMessages = mockWs.getMessagesByType('usage');
                            expect(usageMessages.length).toBe(usageEvents.length);

                            // Verify no corruption
                            for (let i = 0; i < usageEvents.length; i++) {
                                expect(usageMessages[i].inputTokens).toBe(usageEvents[i].data.inputTokens);
                                expect(usageMessages[i].outputTokens).toBe(usageEvents[i].data.outputTokens);
                                expect(usageMessages[i].totalTokens).toBe(usageEvents[i].data.totalTokens);
                            }
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should forward mixed event sequences without loss or corruption', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        events: fc.array(sonicEventArbitrary, { minLength: 5, maxLength: 30 })
                    }),
                    async ({ sessionId, events }) => {
                        const { voiceSideCar, agentCore } = createVoiceSideCar();
                        const mockWs = new MockWebSocket();

                        // Spy on executeTool for tool events
                        const executeToolSpy = jest.spyOn(agentCore, 'executeTool');

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            const initialMessageCount = mockWs.sentMessages.length;
                            mockWs.clearMessages(); // Clear initial messages

                            // Count expected events by type
                            const expectedCounts = {
                                audio: events.filter(e => e.type === 'audio').length,
                                transcript: events.filter(e => e.type === 'transcript').length,
                                toolUse: events.filter(e => e.type === 'toolUse').length,
                                metadata: events.filter(e => e.type === 'metadata').length,
                                error: events.filter(e => e.type === 'error').length,
                                interruption: events.filter(e => e.type === 'interruption').length,
                                usage: events.filter(e => e.type === 'usageEvent').length,
                                workflow_update: events.filter(e => e.type === 'workflow_update').length,
                                session_start: events.filter(e => e.type === 'session_start').length,
                                contentStart: events.filter(e => e.type === 'contentStart').length,
                                contentEnd: events.filter(e => e.type === 'contentEnd').length,
                                interactionTurnEnd: events.filter(e => e.type === 'interactionTurnEnd').length
                            };

                            // Simulate all events from SonicClient
                            for (const event of events) {
                                await (voiceSideCar as any).handleSonicEvent(sessionId, event);
                            }

                            // Verify all events were forwarded
                            const binaryMessages = mockWs.getBinaryMessages();
                            expect(binaryMessages.length).toBe(expectedCounts.audio);

                            const transcriptMessages = mockWs.getMessagesByType('transcript');
                            expect(transcriptMessages.length).toBe(expectedCounts.transcript);

                            const metadataMessages = mockWs.getMessagesByType('metadata');
                            expect(metadataMessages.length).toBe(expectedCounts.metadata);

                            const errorMessages = mockWs.getMessagesByType('error');
                            expect(errorMessages.length).toBe(expectedCounts.error);

                            const interruptionMessages = mockWs.getMessagesByType('interruption');
                            expect(interruptionMessages.length).toBe(expectedCounts.interruption);

                            const usageMessages = mockWs.getMessagesByType('usage');
                            expect(usageMessages.length).toBe(expectedCounts.usage);

                            // Verify tool executions were delegated
                            expect(executeToolSpy).toHaveBeenCalledTimes(expectedCounts.toolUse);

                            // Verify tool results were forwarded
                            const toolResultMessages = mockWs.getMessagesByType('tool_result');
                            expect(toolResultMessages.length).toBe(expectedCounts.toolUse);

                            // Total forwarded events should match input (excluding tool_use which generates tool_result)
                            const totalForwardedEvents = 
                                binaryMessages.length +
                                transcriptMessages.length +
                                mockWs.getMessagesByType('tool_use').length +
                                toolResultMessages.length +
                                metadataMessages.length +
                                errorMessages.length +
                                interruptionMessages.length +
                                usageMessages.length +
                                mockWs.getMessagesByType('workflow_update').length +
                                mockWs.getMessagesByType('session_start').length +
                                mockWs.getMessagesByType('contentStart').length +
                                mockWs.getMessagesByType('contentEnd').length +
                                mockWs.getMessagesByType('interactionTurnEnd').length;

                            // Should have forwarded all events (tool events generate 2 messages: tool_use + tool_result)
                            expect(totalForwardedEvents).toBeGreaterThanOrEqual(events.length);
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle handoff tools by delegating to Agent Core and forwarding handoff requests', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        handoffTool: fc.constantFrom('transfer_to_banking', 'return_to_triage'),
                        reason: fc.string({ minLength: 10, maxLength: 100 }),
                        taskCompleted: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined }),
                        summary: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined })
                    }),
                    async ({ sessionId, handoffTool, reason, taskCompleted, summary }) => {
                        const { voiceSideCar, agentCore } = createVoiceSideCar();
                        const mockWs = new MockWebSocket();

                        // For return_to_triage, we need both taskCompleted and summary
                        if (handoffTool === 'return_to_triage' && (!taskCompleted || !summary)) {
                            return; // Skip invalid combinations
                        }

                        // Spy on executeTool and mock it to return handoff request
                        const executeToolSpy = jest.spyOn(agentCore, 'executeTool').mockResolvedValue({
                            success: true,
                            result: {
                                message: 'Handoff initiated',
                                handoffRequest: {
                                    targetAgentId: handoffTool === 'return_to_triage' ? 'triage' : 'banking',
                                    context: {
                                        fromAgent: 'test-agent',
                                        reason,
                                        isReturn: handoffTool === 'return_to_triage',
                                        taskCompleted,
                                        summary
                                    },
                                    graphState: {}
                                }
                            }
                        });

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            mockWs.clearMessages(); // Clear initial messages

                            // Simulate handoff tool event
                            const toolEvent: SonicEvent = {
                                type: 'toolUse',
                                data: {
                                    toolName: handoffTool,
                                    toolUseId: 'handoff-123',
                                    input: handoffTool === 'return_to_triage' 
                                        ? { taskCompleted, summary }
                                        : { reason }
                                }
                            };

                            await (voiceSideCar as any).handleSonicEvent(sessionId, toolEvent);

                            // Should delegate tool execution to Agent Core
                            expect(executeToolSpy).toHaveBeenCalled();

                            // Should forward handoff request to WebSocket
                            const handoffMessages = mockWs.getMessagesByType('handoff_request');
                            expect(handoffMessages.length).toBe(1);
                            expect(handoffMessages[0].targetAgentId).toBeDefined();
                            expect(handoffMessages[0].context.reason).toBe(reason);
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
