/**
 * Unit tests for Voice Side-Car
 */

import { VoiceSideCar, VoiceSideCarConfig } from '../../src/voice-sidecar';
import { AgentCore, AgentCoreConfig } from '../../src/agent-core';
import { SonicConfig, AudioChunk } from '../../src/sonic-client';
import { GraphExecutor } from '../../src/graph-executor';
import { WorkflowDefinition } from '../../src/graph-types';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { PersonaConfig } from '../../src/persona-types';

// Mock SonicClient before importing voice-sidecar
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

// Mock WebSocket
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
}

// Mock workflow definition
const mockWorkflow: WorkflowDefinition = {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: [
        { id: 'start', type: 'start', label: 'Start' },
        { id: 'greeting', type: 'message', label: 'Greeting', message: 'Hello!' }
    ],
    edges: [
        { from: 'start', to: 'greeting', label: 'begin' }
    ],
    testConfig: {
        personaId: 'test-persona'
    }
};

// Mock persona config
const mockPersona: PersonaConfig = {
    id: 'test-persona',
    name: 'Test Persona',
    description: 'Test persona for unit tests',
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

describe('VoiceSideCar', () => {
    let voiceSideCar: VoiceSideCar;
    let agentCore: AgentCore;
    let mockToolsClient: ToolsClient;
    let mockDecisionEvaluator: DecisionEvaluator;
    let mockGraphExecutor: GraphExecutor;
    let sonicConfig: SonicConfig;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Create mock dependencies
        mockToolsClient = new ToolsClient('http://localhost:9000');
        mockDecisionEvaluator = new DecisionEvaluator('us-east-1');
        mockGraphExecutor = new GraphExecutor(mockWorkflow);

        // Create agent core config
        const agentCoreConfig: AgentCoreConfig = {
            agentId: 'test-agent',
            workflowDef: mockWorkflow,
            personaConfig: mockPersona,
            toolsClient: mockToolsClient,
            decisionEvaluator: mockDecisionEvaluator,
            graphExecutor: mockGraphExecutor,
            localToolsUrl: 'http://localhost:9000'
        };

        agentCore = new AgentCore(agentCoreConfig);

        // Sonic config
        sonicConfig = {
            region: 'us-east-1',
            modelId: 'amazon.nova-2-sonic-v1:0',
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret'
        };

        // Create voice side-car
        const config: VoiceSideCarConfig = {
            agentCore,
            sonicConfig
        };

        voiceSideCar = new VoiceSideCar(config);
    });

    describe('Constructor', () => {
        it('should initialize with agent core and sonic config', () => {
            expect(voiceSideCar).toBeDefined();
            expect(voiceSideCar.getActiveSessionCount()).toBe(0);
        });
    });

    describe('Session Management', () => {
        it('should start a voice session', async () => {
            const sessionId = 'test-session-1';
            const ws = new MockWebSocket() as any;

            await voiceSideCar.startVoiceSession(sessionId, ws);

            expect(voiceSideCar.hasSession(sessionId)).toBe(true);
            expect(voiceSideCar.getActiveSessionCount()).toBe(1);

            // Check that connected message was sent
            expect(ws.sentMessages.length).toBeGreaterThan(0);
            const connectedMsg = JSON.parse(ws.sentMessages[0]);
            expect(connectedMsg.type).toBe('connected');
            expect(connectedMsg.sessionId).toBe(sessionId);
        });

        it('should start session with memory', async () => {
            const sessionId = 'test-session-2';
            const ws = new MockWebSocket() as any;
            const memory = {
                verified: true,
                userName: 'John Doe',
                account: '12345678',
                sortCode: '123456'
            };

            await voiceSideCar.startVoiceSession(sessionId, ws, memory);

            expect(voiceSideCar.hasSession(sessionId)).toBe(true);

            // Verify memory was passed to agent core
            const session = agentCore.getSession(sessionId);
            expect(session?.verifiedUser?.customer_name).toBe('John Doe');
        });

        it('should throw error if session already exists', async () => {
            const sessionId = 'test-session-3';
            const ws = new MockWebSocket() as any;

            await voiceSideCar.startVoiceSession(sessionId, ws);

            await expect(voiceSideCar.startVoiceSession(sessionId, ws))
                .rejects.toThrow('Voice session already exists');
        });

        it('should handle start session error', async () => {
            const sessionId = 'test-session-4';
            const ws = new MockWebSocket() as any;

            // Mock SonicClient to throw error on this specific test
            const { SonicClient } = require('../../src/sonic-client');
            SonicClient.mockImplementationOnce(() => ({
                startSession: jest.fn().mockRejectedValue(new Error('Failed to start')),
                setConfig: jest.fn(),
                stopSession: jest.fn(),
                sendAudioChunk: jest.fn(),
                endAudioInput: jest.fn(),
                sendText: jest.fn(),
                sendToolResult: jest.fn()
            }));

            await expect(voiceSideCar.startVoiceSession(sessionId, ws))
                .rejects.toThrow('Failed to start');

            // Session should be cleaned up
            expect(voiceSideCar.hasSession(sessionId)).toBe(false);
            expect(agentCore.getSession(sessionId)).toBeUndefined();

            // Error message should be sent to client
            const errorMsg = ws.sentMessages.find((msg: any) => {
                const parsed = JSON.parse(msg);
                return parsed.type === 'error';
            });
            expect(errorMsg).toBeDefined();
        });

        it('should stop a voice session', async () => {
            const sessionId = 'test-session-5';
            const ws = new MockWebSocket() as any;

            await voiceSideCar.startVoiceSession(sessionId, ws);
            await voiceSideCar.stopVoiceSession(sessionId);

            expect(voiceSideCar.hasSession(sessionId)).toBe(false);
            expect(agentCore.getSession(sessionId)).toBeUndefined();
        });

        it('should handle stop session for non-existent session', async () => {
            // Should not throw
            await expect(voiceSideCar.stopVoiceSession('non-existent'))
                .resolves.not.toThrow();
        });
    });

    describe('Audio Handling', () => {
        it('should handle audio chunk', async () => {
            const sessionId = 'test-session-6';
            const ws = new MockWebSocket() as any;
            const audioBuffer = Buffer.alloc(3200); // 100ms of audio

            await voiceSideCar.startVoiceSession(sessionId, ws);
            await voiceSideCar.handleAudioChunk(sessionId, audioBuffer);

            // Just verify it doesn't throw
            expect(voiceSideCar.hasSession(sessionId)).toBe(true);
        });

        it('should handle audio chunk for non-existent session', async () => {
            const audioBuffer = Buffer.alloc(3200);

            // Should not throw
            await expect(voiceSideCar.handleAudioChunk('non-existent', audioBuffer))
                .resolves.not.toThrow();
        });

        it('should end audio input', async () => {
            const sessionId = 'test-session-7';
            const ws = new MockWebSocket() as any;

            await voiceSideCar.startVoiceSession(sessionId, ws);
            await voiceSideCar.endAudioInput(sessionId);

            // Just verify it doesn't throw
            expect(voiceSideCar.hasSession(sessionId)).toBe(true);
        });
    });

    describe('Text Input (Hybrid Mode)', () => {
        it('should handle text input', async () => {
            const sessionId = 'test-session-8';
            const ws = new MockWebSocket() as any;
            const text = 'Hello, how are you?';

            await voiceSideCar.startVoiceSession(sessionId, ws);
            await voiceSideCar.handleTextInput(sessionId, text);

            // Just verify it doesn't throw
            expect(voiceSideCar.hasSession(sessionId)).toBe(true);
        });

        it('should handle text input for non-existent session', async () => {
            // Should not throw
            await expect(voiceSideCar.handleTextInput('non-existent', 'Hello'))
                .resolves.not.toThrow();
        });
    });

    describe('Configuration Updates', () => {
        it('should update session config', async () => {
            const sessionId = 'test-session-9';
            const ws = new MockWebSocket() as any;

            await voiceSideCar.startVoiceSession(sessionId, ws);

            const newConfig = {
                systemPrompt: 'New prompt',
                voiceId: 'tiffany'
            };

            voiceSideCar.updateSessionConfig(sessionId, newConfig);

            // Just verify it doesn't throw
            expect(voiceSideCar.hasSession(sessionId)).toBe(true);
        });

        it('should handle config update for non-existent session', () => {
            // Should not throw
            expect(() => voiceSideCar.updateSessionConfig('non-existent', {}))
                .not.toThrow();
        });
    });

    describe('Session Queries', () => {
        it('should return active session count', async () => {
            const ws1 = new MockWebSocket() as any;
            const ws2 = new MockWebSocket() as any;

            expect(voiceSideCar.getActiveSessionCount()).toBe(0);

            await voiceSideCar.startVoiceSession('session-1', ws1);
            expect(voiceSideCar.getActiveSessionCount()).toBe(1);

            await voiceSideCar.startVoiceSession('session-2', ws2);
            expect(voiceSideCar.getActiveSessionCount()).toBe(2);

            await voiceSideCar.stopVoiceSession('session-1');
            expect(voiceSideCar.getActiveSessionCount()).toBe(1);
        });

        it('should check if session exists', async () => {
            const sessionId = 'test-session-10';
            const ws = new MockWebSocket() as any;

            expect(voiceSideCar.hasSession(sessionId)).toBe(false);

            await voiceSideCar.startVoiceSession(sessionId, ws);
            expect(voiceSideCar.hasSession(sessionId)).toBe(true);

            await voiceSideCar.stopVoiceSession(sessionId);
            expect(voiceSideCar.hasSession(sessionId)).toBe(false);
        });
    });
});
