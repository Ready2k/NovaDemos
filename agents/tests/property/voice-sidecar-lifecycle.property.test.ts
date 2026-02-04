/**
 * Property-Based Tests for Voice Side-Car Lifecycle Management
 * 
 * These tests verify that VoiceSideCar correctly manages SonicClient lifecycle
 * (start, stop, cleanup) across all scenarios.
 * 
 * Feature: voice-agnostic-agent-architecture, Property 4: SonicClient Lifecycle Management
 * 
 * For any voice session, the Voice Side-Car SHALL create a SonicClient on startVoiceSession,
 * stop it on stopVoiceSession, and clean up resources on errors.
 * 
 * **Validates: Requirements 2.5**
 */

import * as fc from 'fast-check';
import { VoiceSideCar, VoiceSideCarConfig } from '../../src/voice-sidecar';
import { AgentCore, AgentCoreConfig } from '../../src/agent-core';
import { SonicConfig } from '../../src/sonic-client';
import { GraphExecutor } from '../../src/graph-executor';
import { WorkflowDefinition } from '../../src/graph-types';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { PersonaConfig } from '../../src/persona-types';

// Mock SonicClient module completely to avoid Langfuse import issues
jest.mock('../../src/sonic-client', () => ({
    SonicClient: jest.fn()
}));

// Mock SonicClient to track lifecycle
class MockSonicClient {
    public isStarted: boolean = false;
    public isStopped: boolean = false;
    public startSessionCalled: number = 0;
    public stopSessionCalled: number = 0;
    public eventCallback?: (event: any) => void;
    public shouldFailOnStart: boolean = false;
    public shouldFailOnStop: boolean = false;

    async startSession(onEvent: (event: any) => void, sessionId: string): Promise<void> {
        this.startSessionCalled++;
        
        if (this.shouldFailOnStart) {
            throw new Error('Failed to start SonicClient');
        }
        
        this.isStarted = true;
        this.isStopped = false;
        this.eventCallback = onEvent;
    }

    setConfig(config: any): void {
        // Mock config setter
    }

    async stopSession(): Promise<void> {
        this.stopSessionCalled++;
        
        if (this.shouldFailOnStop) {
            throw new Error('Failed to stop SonicClient');
        }
        
        this.isStarted = false;
        this.isStopped = true;
        this.eventCallback = undefined;
    }

    async sendAudioChunk(chunk: any): Promise<void> {
        if (!this.isStarted) {
            throw new Error('Cannot send audio chunk: Session not started');
        }
    }

    async endAudioInput(): Promise<void> {
        if (!this.isStarted) {
            throw new Error('Cannot end audio input: Session not started');
        }
    }

    async sendText(text: string): Promise<void> {
        if (!this.isStarted) {
            throw new Error('Cannot send text: Session not started');
        }
    }

    async sendToolResult(toolUseId: string, result: any, isError: boolean): Promise<void> {
        if (!this.isStarted) {
            throw new Error('Cannot send tool result: Session not started');
        }
    }

    // Helper to check if resources are cleaned up
    isCleanedUp(): boolean {
        return this.isStopped && !this.isStarted && this.eventCallback === undefined;
    }
}

// Mock WebSocket for tracking messages
class MockWebSocket {
    public sentMessages: any[] = [];
    public readyState: number = 1; // OPEN
    public isClosed: boolean = false;

    send(data: any): void {
        this.sentMessages.push(data);
    }

    close(): void {
        this.readyState = 3; // CLOSED
        this.isClosed = true;
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
    allowedTools: ['check_balance', 'get_transactions'],
    metadata: {
        language: 'en-US',
        region: 'US',
        tone: 'professional'
    }
};

// Helper to create voice side-car with mocked SonicClient
function createVoiceSideCarWithMockSonic(): {
    voiceSideCar: VoiceSideCar;
    agentCore: AgentCore;
    mockSonicClient: MockSonicClient;
} {
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

    // Create mock SonicClient instance
    const mockSonicClient = new MockSonicClient();

    // Mock the SonicClient constructor
    const { SonicClient } = require('../../src/sonic-client');
    (SonicClient as jest.Mock).mockImplementation(() => mockSonicClient);

    const config: VoiceSideCarConfig = {
        agentCore,
        sonicConfig
    };

    const voiceSideCar = new VoiceSideCar(config);

    return { voiceSideCar, agentCore, mockSonicClient };
}

describe('Property-Based Tests: Voice Side-Car Lifecycle Management', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Feature: voice-agnostic-agent-architecture, Property 4: SonicClient Lifecycle Management
     * 
     * For any voice session, the Voice Side-Car SHALL create a SonicClient on startVoiceSession,
     * stop it on stopVoiceSession, and clean up resources on errors.
     * 
     * **Validates: Requirements 2.5**
     */
    describe('Property 4: SonicClient Lifecycle Management', () => {
        it('should create SonicClient on startVoiceSession', async () => {
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
                        const { voiceSideCar, mockSonicClient } = createVoiceSideCarWithMockSonic();
                        const mockWs = new MockWebSocket();

                        try {
                            // Start voice session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any, memory);

                            // SonicClient should be created and started
                            expect(mockSonicClient.startSessionCalled).toBe(1);
                            expect(mockSonicClient.isStarted).toBe(true);
                            expect(mockSonicClient.isStopped).toBe(false);

                            // Session should exist in VoiceSideCar
                            expect(voiceSideCar.hasSession(sessionId)).toBe(true);

                            // Should send connected message to client
                            const connectedMessages = mockWs.getMessagesByType('connected');
                            expect(connectedMessages.length).toBe(1);
                            expect(connectedMessages[0].sessionId).toBe(sessionId);
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should stop SonicClient on stopVoiceSession', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { voiceSideCar, mockSonicClient } = createVoiceSideCarWithMockSonic();
                        const mockWs = new MockWebSocket();

                        // Start voice session
                        await voiceSideCar.startVoiceSession(sessionId, mockWs as any);

                        // Verify session is started
                        expect(mockSonicClient.isStarted).toBe(true);
                        expect(voiceSideCar.hasSession(sessionId)).toBe(true);

                        // Stop voice session
                        await voiceSideCar.stopVoiceSession(sessionId);

                        // SonicClient should be stopped
                        expect(mockSonicClient.stopSessionCalled).toBe(1);
                        expect(mockSonicClient.isStopped).toBe(true);
                        expect(mockSonicClient.isStarted).toBe(false);

                        // Session should be removed from VoiceSideCar
                        expect(voiceSideCar.hasSession(sessionId)).toBe(false);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should clean up resources on errors during startVoiceSession', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { voiceSideCar, mockSonicClient, agentCore } = createVoiceSideCarWithMockSonic();
                        const mockWs = new MockWebSocket();

                        // Make SonicClient fail on start
                        mockSonicClient.shouldFailOnStart = true;

                        try {
                            // Attempt to start voice session (should fail)
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            
                            // Should not reach here
                            expect(true).toBe(false);
                        } catch (error: any) {
                            // Should throw error
                            expect(error.message).toContain('Failed to start SonicClient');

                            // Session should NOT exist in VoiceSideCar
                            expect(voiceSideCar.hasSession(sessionId)).toBe(false);

                            // Agent Core session should be cleaned up
                            expect(agentCore.getSession(sessionId)).toBeUndefined();

                            // Should send error message to client
                            const errorMessages = mockWs.getMessagesByType('error');
                            expect(errorMessages.length).toBe(1);
                            expect(errorMessages[0].message).toContain('Failed to start voice session');
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should clean up resources even if stopSession fails', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { voiceSideCar, mockSonicClient, agentCore } = createVoiceSideCarWithMockSonic();
                        const mockWs = new MockWebSocket();

                        // Start voice session
                        await voiceSideCar.startVoiceSession(sessionId, mockWs as any);

                        // Verify session is started
                        expect(mockSonicClient.isStarted).toBe(true);
                        expect(voiceSideCar.hasSession(sessionId)).toBe(true);

                        // Make SonicClient fail on stop
                        mockSonicClient.shouldFailOnStop = true;

                        // Stop voice session (should handle error gracefully)
                        await voiceSideCar.stopVoiceSession(sessionId);

                        // Session should still be removed from VoiceSideCar (force cleanup)
                        expect(voiceSideCar.hasSession(sessionId)).toBe(false);

                        // Agent Core session should be cleaned up
                        expect(agentCore.getSession(sessionId)).toBeUndefined();
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
                        const { voiceSideCar, agentCore } = createVoiceSideCarWithMockSonic();

                        // Start and stop each session
                        for (const { sessionId } of sessions) {
                            const mockWs = new MockWebSocket();

                            // Start session
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            expect(voiceSideCar.hasSession(sessionId)).toBe(true);
                            expect(agentCore.getSession(sessionId)).toBeDefined();

                            // Stop session
                            await voiceSideCar.stopVoiceSession(sessionId);
                            expect(voiceSideCar.hasSession(sessionId)).toBe(false);
                            expect(agentCore.getSession(sessionId)).toBeUndefined();
                        }

                        // No sessions should remain
                        expect(voiceSideCar.getActiveSessionCount()).toBe(0);
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
                        const { voiceSideCar, agentCore } = createVoiceSideCarWithMockSonic();

                        // Start all sessions concurrently
                        const startPromises = sessions.map(({ sessionId }) => {
                            const mockWs = new MockWebSocket();
                            return voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                        });

                        await Promise.all(startPromises);

                        // All sessions should exist
                        for (const { sessionId } of sessions) {
                            expect(voiceSideCar.hasSession(sessionId)).toBe(true);
                            expect(agentCore.getSession(sessionId)).toBeDefined();
                        }

                        expect(voiceSideCar.getActiveSessionCount()).toBe(sessions.length);

                        // Stop all sessions concurrently
                        const stopPromises = sessions.map(({ sessionId }) =>
                            voiceSideCar.stopVoiceSession(sessionId)
                        );

                        await Promise.all(stopPromises);

                        // No sessions should remain
                        for (const { sessionId } of sessions) {
                            expect(voiceSideCar.hasSession(sessionId)).toBe(false);
                            expect(agentCore.getSession(sessionId)).toBeUndefined();
                        }

                        expect(voiceSideCar.getActiveSessionCount()).toBe(0);
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
                        const { voiceSideCar, mockSonicClient } = createVoiceSideCarWithMockSonic();
                        const mockWs = new MockWebSocket();

                        // Start voice session
                        await voiceSideCar.startVoiceSession(sessionId, mockWs as any);

                        // Verify session is started
                        expect(mockSonicClient.startSessionCalled).toBe(1);
                        expect(voiceSideCar.hasSession(sessionId)).toBe(true);

                        try {
                            // Attempt to start same session again (should fail)
                            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
                            
                            // Should not reach here
                            expect(true).toBe(false);
                        } catch (error: any) {
                            // Should throw error about duplicate session
                            expect(error.message).toContain('Voice session already exists');

                            // Original session should still exist
                            expect(voiceSideCar.hasSession(sessionId)).toBe(true);

                            // SonicClient should only be started once
                            expect(mockSonicClient.startSessionCalled).toBe(1);
                        } finally {
                            await voiceSideCar.stopVoiceSession(sessionId);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle stopVoiceSession gracefully for non-existent sessions', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid()
                    }),
                    async ({ sessionId }) => {
                        const { voiceSideCar, mockSonicClient } = createVoiceSideCarWithMockSonic();

                        // Attempt to stop non-existent session (should not throw)
                        await voiceSideCar.stopVoiceSession(sessionId);

                        // Should not have called stopSession on SonicClient
                        expect(mockSonicClient.stopSessionCalled).toBe(0);

                        // Session should not exist
                        expect(voiceSideCar.hasSession(sessionId)).toBe(false);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should clean up Agent Core session when SonicClient lifecycle completes', async () => {
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
                        const { voiceSideCar, agentCore } = createVoiceSideCarWithMockSonic();
                        const mockWs = new MockWebSocket();

                        // Start voice session with memory
                        await voiceSideCar.startVoiceSession(sessionId, mockWs as any, memory);

                        // Verify Agent Core session exists with memory
                        const session = agentCore.getSession(sessionId);
                        expect(session).toBeDefined();
                        
                        if (memory?.verified && memory.userName) {
                            expect(session?.verifiedUser).toBeDefined();
                            expect(session?.verifiedUser?.customer_name).toBe(memory.userName);
                        }

                        // Stop voice session
                        await voiceSideCar.stopVoiceSession(sessionId);

                        // Agent Core session should be cleaned up
                        expect(agentCore.getSession(sessionId)).toBeUndefined();

                        // Memory should be cleared
                        expect(agentCore.getSessionMemory(sessionId)).toEqual({});
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should maintain lifecycle integrity across audio operations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        audioChunks: fc.array(
                            fc.uint8Array({ minLength: 100, maxLength: 3200 }).map(arr => Buffer.from(arr)),
                            { minLength: 1, maxLength: 10 }
                        )
                    }),
                    async ({ sessionId, audioChunks }) => {
                        const { voiceSideCar, mockSonicClient } = createVoiceSideCarWithMockSonic();
                        const mockWs = new MockWebSocket();

                        // Start voice session
                        await voiceSideCar.startVoiceSession(sessionId, mockWs as any);

                        // Send audio chunks
                        for (const chunk of audioChunks) {
                            await voiceSideCar.handleAudioChunk(sessionId, chunk);
                        }

                        // SonicClient should still be active
                        expect(mockSonicClient.isStarted).toBe(true);
                        expect(voiceSideCar.hasSession(sessionId)).toBe(true);

                        // Stop voice session
                        await voiceSideCar.stopVoiceSession(sessionId);

                        // SonicClient should be stopped
                        expect(mockSonicClient.isStopped).toBe(true);
                        expect(voiceSideCar.hasSession(sessionId)).toBe(false);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
