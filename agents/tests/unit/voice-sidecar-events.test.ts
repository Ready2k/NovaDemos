/**
 * Unit tests for Voice Side-Car Event Handling
 * Tests the handleSonicEvent() method for all event types
 * 
 * Requirements: 2.3, 2.6, 2.7
 */

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

    getMessagesByType(type: string): any[] {
        return this.sentMessages
            .filter(msg => typeof msg === 'string')
            .map(msg => JSON.parse(msg))
            .filter(parsed => parsed.type === type);
    }

    getLastMessage(): any {
        if (this.sentMessages.length === 0) return null;
        const lastMsg = this.sentMessages[this.sentMessages.length - 1];
        return typeof lastMsg === 'string' ? JSON.parse(lastMsg) : lastMsg;
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
    allowedTools: ['check_balance', 'get_transactions', 'transfer_to_banking'],
    metadata: {
        language: 'en-US',
        region: 'US',
        tone: 'professional'
    }
};

describe('VoiceSideCar Event Handling', () => {
    let voiceSideCar: VoiceSideCar;
    let agentCore: AgentCore;
    let mockToolsClient: ToolsClient;
    let mockDecisionEvaluator: DecisionEvaluator;
    let mockGraphExecutor: GraphExecutor;
    let sonicConfig: SonicConfig;
    let mockWs: MockWebSocket;
    let sessionId: string;

    beforeEach(async () => {
        // Clear all mocks
        jest.clearAllMocks();

        // Create mock dependencies
        mockToolsClient = new ToolsClient('http://localhost:9000');
        mockDecisionEvaluator = new DecisionEvaluator('us-east-1');
        mockGraphExecutor = new GraphExecutor(mockWorkflow);

        // Mock tool execution
        jest.spyOn(mockToolsClient, 'executeTool').mockResolvedValue({
            success: true,
            result: { balance: 1000 }
        });

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

        // Start a session for testing
        sessionId = 'test-event-session';
        mockWs = new MockWebSocket();
        
        try {
            await voiceSideCar.startVoiceSession(sessionId, mockWs as any);
            // Clear initial messages (connected message)
            mockWs.clearMessages();
        } catch (error) {
            // If session start fails, that's okay for event testing
            // We'll test events on a non-existent session
            console.log('Session start failed in test setup, continuing anyway');
        }
    });

    afterEach(async () => {
        // Clean up session if it exists
        try {
            if (voiceSideCar && voiceSideCar.hasSession(sessionId)) {
                await voiceSideCar.stopVoiceSession(sessionId);
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Audio Event Handling', () => {
        it('should forward audio events to WebSocket', async () => {
            const audioBuffer = Buffer.alloc(3200);
            const audioEvent: SonicEvent = {
                type: 'audio',
                data: {
                    buffer: audioBuffer
                }
            };

            // Simulate event from SonicClient
            await (voiceSideCar as any).handleSonicEvent(sessionId, audioEvent);

            // Should forward audio buffer to client
            const binaryMessages = mockWs.sentMessages.filter(msg => Buffer.isBuffer(msg));
            expect(binaryMessages.length).toBe(1);
            expect(binaryMessages[0]).toEqual(audioBuffer);
        });

        it('should handle audio event without buffer gracefully', async () => {
            const audioEvent: SonicEvent = {
                type: 'audio',
                data: {}
            };

            // Should not throw
            await expect((voiceSideCar as any).handleSonicEvent(sessionId, audioEvent))
                .resolves.not.toThrow();
        });
    });

    describe('Transcript Event Handling', () => {
        it('should forward assistant transcript to client', async () => {
            const transcriptEvent: SonicEvent = {
                type: 'transcript',
                data: {
                    role: 'assistant',
                    text: 'Hello, how can I help you?'
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, transcriptEvent);

            const transcriptMessages = mockWs.getMessagesByType('transcript');
            expect(transcriptMessages.length).toBe(1);
            expect(transcriptMessages[0].role).toBe('assistant');
            expect(transcriptMessages[0].text).toBe('Hello, how can I help you?');
        });

        it('should forward user transcript to client and process through Agent Core', async () => {
            const transcriptEvent: SonicEvent = {
                type: 'transcript',
                data: {
                    role: 'user',
                    text: 'Check my balance'
                }
            };

            // Mock processUserMessage
            const processSpy = jest.spyOn(agentCore, 'processUserMessage')
                .mockResolvedValue({
                    type: 'text',
                    content: 'Your balance is $1000'
                });

            await (voiceSideCar as any).handleSonicEvent(sessionId, transcriptEvent);

            // Should forward transcript
            const transcriptMessages = mockWs.getMessagesByType('transcript');
            expect(transcriptMessages.length).toBe(1);
            expect(transcriptMessages[0].role).toBe('user');
            expect(transcriptMessages[0].text).toBe('Check my balance');

            // Should process through Agent Core
            await new Promise(resolve => setTimeout(resolve, 10)); // Wait for async processing
            expect(processSpy).toHaveBeenCalledWith(sessionId, 'Check my balance');
        });

        it('should handle transcript with content field instead of text', async () => {
            const transcriptEvent: SonicEvent = {
                type: 'transcript',
                data: {
                    role: 'assistant',
                    content: 'Using content field'
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, transcriptEvent);

            const transcriptMessages = mockWs.getMessagesByType('transcript');
            expect(transcriptMessages.length).toBe(1);
            expect(transcriptMessages[0].text).toBe('Using content field');
        });
    });

    describe('Tool Use Event Handling', () => {
        it('should handle tool use event and execute tool', async () => {
            const toolEvent: SonicEvent = {
                type: 'toolUse',
                data: {
                    toolName: 'check_balance',
                    toolUseId: 'tool-123',
                    input: { accountNumber: '12345678' }
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, toolEvent);

            // Should forward tool use to client
            const toolUseMessages = mockWs.getMessagesByType('tool_use');
            expect(toolUseMessages.length).toBe(1);
            expect(toolUseMessages[0].toolName).toBe('check_balance');
            expect(toolUseMessages[0].toolUseId).toBe('tool-123');

            // Should forward tool result to client
            const toolResultMessages = mockWs.getMessagesByType('tool_result');
            expect(toolResultMessages.length).toBe(1);
            expect(toolResultMessages[0].toolName).toBe('check_balance');
            expect(toolResultMessages[0].success).toBe(true);
        });

        it('should handle tool execution error', async () => {
            const toolEvent: SonicEvent = {
                type: 'toolUse',
                data: {
                    toolName: 'failing_tool',
                    toolUseId: 'tool-456',
                    input: {}
                }
            };

            // Mock tool execution to fail
            jest.spyOn(agentCore, 'executeTool').mockResolvedValue({
                success: false,
                result: null,
                error: 'Tool execution failed'
            });

            await (voiceSideCar as any).handleSonicEvent(sessionId, toolEvent);

            // Should forward error result
            const toolResultMessages = mockWs.getMessagesByType('tool_result');
            expect(toolResultMessages.length).toBe(1);
            expect(toolResultMessages[0].success).toBe(false);
            expect(toolResultMessages[0].error).toBe('Tool execution failed');
        });

        it('should handle handoff tool (transfer_to_banking)', async () => {
            const toolEvent: SonicEvent = {
                type: 'toolUse',
                data: {
                    toolName: 'transfer_to_banking',
                    toolUseId: 'tool-789',
                    input: {
                        reason: 'User needs banking assistance',
                        lastUserMessage: 'I want to check my balance'
                    }
                }
            };

            // Mock tool execution with handoff request in result
            jest.spyOn(agentCore, 'executeTool').mockResolvedValue({
                success: true,
                result: {
                    message: 'Handoff initiated',
                    handoffRequest: {
                        targetAgentId: 'banking',
                        context: {
                            fromAgent: 'test-agent',
                            reason: 'User needs banking assistance',
                            lastUserMessage: 'I want to check my balance',
                            isReturn: false
                        },
                        graphState: {}
                    }
                }
            });

            await (voiceSideCar as any).handleSonicEvent(sessionId, toolEvent);

            // Should forward handoff request
            const handoffMessages = mockWs.getMessagesByType('handoff_request');
            expect(handoffMessages.length).toBe(1);
            expect(handoffMessages[0].targetAgentId).toBe('banking');
            expect(handoffMessages[0].context.reason).toBe('User needs banking assistance');
        });

        it('should handle return handoff (return_to_triage)', async () => {
            const toolEvent: SonicEvent = {
                type: 'toolUse',
                data: {
                    toolName: 'return_to_triage',
                    toolUseId: 'tool-999',
                    input: {
                        taskCompleted: 'Balance checked',
                        summary: 'User balance is $1000'
                    }
                }
            };

            // Mock tool execution with handoff request in result
            jest.spyOn(agentCore, 'executeTool').mockResolvedValue({
                success: true,
                result: {
                    message: 'Handoff initiated',
                    handoffRequest: {
                        targetAgentId: 'triage',
                        context: {
                            fromAgent: 'test-agent',
                            isReturn: true,
                            taskCompleted: 'Balance checked',
                            summary: 'User balance is $1000'
                        },
                        graphState: {}
                    }
                }
            });

            await (voiceSideCar as any).handleSonicEvent(sessionId, toolEvent);

            // Should forward handoff request
            const handoffMessages = mockWs.getMessagesByType('handoff_request');
            expect(handoffMessages.length).toBe(1);
            expect(handoffMessages[0].targetAgentId).toBe('triage');
            expect(handoffMessages[0].context.isReturn).toBe(true);
        });

        it('should handle tool use with content field instead of input', async () => {
            const toolEvent: SonicEvent = {
                type: 'toolUse',
                data: {
                    toolName: 'check_balance',
                    toolUseId: 'tool-content',
                    content: { accountNumber: '87654321' }
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, toolEvent);

            // Should forward tool use with content
            const toolUseMessages = mockWs.getMessagesByType('tool_use');
            expect(toolUseMessages.length).toBe(1);
            expect(toolUseMessages[0].input).toEqual({ accountNumber: '87654321' });
        });
    });

    describe('Metadata Event Handling', () => {
        it('should forward metadata events to client', async () => {
            const metadataEvent: SonicEvent = {
                type: 'metadata',
                data: {
                    sentiment: 'positive',
                    confidence: 0.95
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, metadataEvent);

            const metadataMessages = mockWs.getMessagesByType('metadata');
            expect(metadataMessages.length).toBe(1);
            expect(metadataMessages[0].data.sentiment).toBe('positive');
            expect(metadataMessages[0].data.confidence).toBe(0.95);
        });
    });

    describe('Error Event Handling', () => {
        it('should forward error events to client', async () => {
            const errorEvent: SonicEvent = {
                type: 'error',
                data: {
                    message: 'Something went wrong',
                    details: 'Error details here'
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, errorEvent);

            const errorMessages = mockWs.getMessagesByType('error');
            expect(errorMessages.length).toBe(1);
            expect(errorMessages[0].message).toBe('Something went wrong');
            expect(errorMessages[0].details).toBe('Error details here');
        });

        it('should handle error event with only message', async () => {
            const errorEvent: SonicEvent = {
                type: 'error',
                data: 'Simple error message'
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, errorEvent);

            const errorMessages = mockWs.getMessagesByType('error');
            expect(errorMessages.length).toBe(1);
            expect(errorMessages[0].details).toBe('Simple error message');
        });
    });

    describe('Interruption Event Handling', () => {
        it('should forward interruption events to client', async () => {
            const interruptionEvent: SonicEvent = {
                type: 'interruption',
                data: {
                    reason: 'User started speaking',
                    timestamp: Date.now()
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, interruptionEvent);

            const interruptionMessages = mockWs.getMessagesByType('interruption');
            expect(interruptionMessages.length).toBe(1);
            expect(interruptionMessages[0].data.reason).toBe('User started speaking');
        });
    });

    describe('Usage Event Handling', () => {
        it('should forward usage events to client', async () => {
            const usageEvent: SonicEvent = {
                type: 'usageEvent',
                data: {
                    inputTokens: 100,
                    outputTokens: 50,
                    totalTokens: 150
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, usageEvent);

            const usageMessages = mockWs.getMessagesByType('usage');
            expect(usageMessages.length).toBe(1);
            expect(usageMessages[0].inputTokens).toBe(100);
            expect(usageMessages[0].outputTokens).toBe(50);
            expect(usageMessages[0].totalTokens).toBe(150);
        });

        it('should handle usage event with missing fields', async () => {
            const usageEvent: SonicEvent = {
                type: 'usageEvent',
                data: {}
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, usageEvent);

            const usageMessages = mockWs.getMessagesByType('usage');
            expect(usageMessages.length).toBe(1);
            expect(usageMessages[0].inputTokens).toBe(0);
            expect(usageMessages[0].outputTokens).toBe(0);
            expect(usageMessages[0].totalTokens).toBe(0);
        });
    });

    describe('Workflow Update Event Handling', () => {
        it('should update workflow state and forward to client', async () => {
            const workflowEvent: SonicEvent = {
                type: 'workflow_update',
                data: {
                    nodeId: 'greeting'
                }
            };

            // Mock workflow update
            jest.spyOn(agentCore, 'updateWorkflowState').mockReturnValue({
                currentNode: 'greeting',
                previousNode: 'start',
                nextNodes: [],
                validTransition: true,
                nodeInfo: { id: 'greeting', type: 'message', label: 'Greeting' }
            });

            await (voiceSideCar as any).handleSonicEvent(sessionId, workflowEvent);

            const workflowMessages = mockWs.getMessagesByType('workflow_update');
            expect(workflowMessages.length).toBe(1);
            expect(workflowMessages[0].currentNode).toBe('greeting');
            expect(workflowMessages[0].previousNode).toBe('start');
            expect(workflowMessages[0].validTransition).toBe(true);
        });

        it('should forward workflow update without nodeId', async () => {
            const workflowEvent: SonicEvent = {
                type: 'workflow_update',
                data: {
                    status: 'in_progress',
                    step: 'processing'
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, workflowEvent);

            const workflowMessages = mockWs.getMessagesByType('workflow_update');
            expect(workflowMessages.length).toBe(1);
            expect(workflowMessages[0].data.status).toBe('in_progress');
        });
    });

    describe('Other Event Types', () => {
        it('should forward session_start events to client', async () => {
            const sessionStartEvent: SonicEvent = {
                type: 'session_start',
                data: {
                    sessionId: sessionId,
                    timestamp: Date.now()
                }
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, sessionStartEvent);

            const sessionStartMessages = mockWs.getMessagesByType('session_start');
            expect(sessionStartMessages.length).toBe(1);
        });

        it('should forward contentStart events to client', async () => {
            const contentStartEvent: SonicEvent = {
                type: 'contentStart',
                data: {}
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, contentStartEvent);

            const contentStartMessages = mockWs.getMessagesByType('contentStart');
            expect(contentStartMessages.length).toBe(1);
        });

        it('should forward contentEnd events to client', async () => {
            const contentEndEvent: SonicEvent = {
                type: 'contentEnd',
                data: {}
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, contentEndEvent);

            const contentEndMessages = mockWs.getMessagesByType('contentEnd');
            expect(contentEndMessages.length).toBe(1);
        });

        it('should forward interactionTurnEnd events to client', async () => {
            const turnEndEvent: SonicEvent = {
                type: 'interactionTurnEnd',
                data: {}
            };

            await (voiceSideCar as any).handleSonicEvent(sessionId, turnEndEvent);

            const turnEndMessages = mockWs.getMessagesByType('interactionTurnEnd');
            expect(turnEndMessages.length).toBe(1);
        });
    });

    describe('Unknown Event Handling', () => {
        it('should handle unknown event types gracefully', async () => {
            const unknownEvent: SonicEvent = {
                type: 'unknown_event_type' as any,
                data: {}
            };

            // Should not throw
            await expect((voiceSideCar as any).handleSonicEvent(sessionId, unknownEvent))
                .resolves.not.toThrow();
        });
    });

    describe('Event Handling for Non-Existent Session', () => {
        it('should handle events for non-existent session gracefully', async () => {
            const audioEvent: SonicEvent = {
                type: 'audio',
                data: { buffer: Buffer.alloc(100) }
            };

            // Should not throw
            await expect((voiceSideCar as any).handleSonicEvent('non-existent-session', audioEvent))
                .resolves.not.toThrow();
        });
    });
});
