/**
 * Unit Tests for Text Adapter
 * 
 * Tests the TextAdapter class that wraps Agent Core with WebSocket text I/O.
 */

import { TextAdapter, TextAdapterConfig } from '../../src/text-adapter';
import { AgentCore, AgentCoreConfig, AgentResponse, HandoffRequest } from '../../src/agent-core';
import { WebSocket } from 'ws';

// Mock WebSocket
class MockWebSocket {
    public sentMessages: string[] = [];
    public readyState: number = 1; // OPEN

    send(data: string): void {
        this.sentMessages.push(data);
    }

    close(): void {
        this.readyState = 3; // CLOSED
    }

    on(event: string, handler: Function): void {
        // Store handlers for testing
    }

    getLastMessage(): any {
        if (this.sentMessages.length === 0) return null;
        return JSON.parse(this.sentMessages[this.sentMessages.length - 1]);
    }

    getAllMessages(): any[] {
        return this.sentMessages.map(msg => JSON.parse(msg));
    }

    clearMessages(): void {
        this.sentMessages = [];
    }
}

// Mock Agent Core
class MockAgentCore {
    private sessions: Map<string, any> = new Map();

    initializeSession(sessionId: string, memory?: any): any {
        const session = {
            sessionId,
            startTime: Date.now(),
            messages: [],
            memory: memory || {}
        };
        this.sessions.set(sessionId, session);
        return session;
    }

    getSession(sessionId: string): any {
        return this.sessions.get(sessionId);
    }

    endSession(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    async processUserMessage(sessionId: string, message: string): Promise<AgentResponse> {
        return {
            type: 'text',
            content: `Echo: ${message}`
        };
    }

    getPersonaConfig(): any {
        return null;
    }

    getWorkflowDefinition(): any {
        return null;
    }

    getAllTools(): any[] {
        return [];
    }

    getSystemPrompt(sessionId: string): string {
        return 'Test system prompt';
    }
}

describe('TextAdapter', () => {
    let textAdapter: TextAdapter;
    let mockAgentCore: MockAgentCore;
    let mockWebSocket: MockWebSocket;

    beforeEach(() => {
        mockAgentCore = new MockAgentCore();
        textAdapter = new TextAdapter({
            agentCore: mockAgentCore as any
        });
        mockWebSocket = new MockWebSocket();
    });

    describe('Constructor', () => {
        it('should initialize with AgentCore', () => {
            expect(textAdapter).toBeDefined();
            expect(textAdapter.getActiveSessionCount()).toBe(0);
        });
    });

    describe('startTextSession', () => {
        it('should start a text session successfully', () => {
            const sessionId = 'test-session-1';

            textAdapter.startTextSession(sessionId, mockWebSocket as any);

            expect(textAdapter.hasSession(sessionId)).toBe(true);
            expect(textAdapter.getActiveSessionCount()).toBe(1);
            expect(mockAgentCore.getSession(sessionId)).toBeDefined();
        });

        it('should send connected message to client', () => {
            const sessionId = 'test-session-2';

            textAdapter.startTextSession(sessionId, mockWebSocket as any);

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('connected');
            expect(lastMessage.sessionId).toBe(sessionId);
            expect(lastMessage.timestamp).toBeDefined();
        });

        it('should restore session memory if provided', () => {
            const sessionId = 'test-session-3';
            const memory = {
                verified: true,
                userName: 'John Doe',
                account: '12345678',
                sortCode: '123456'
            };

            textAdapter.startTextSession(sessionId, mockWebSocket as any, memory);

            const session = mockAgentCore.getSession(sessionId);
            expect(session.memory).toEqual(memory);
        });

        it('should throw error if session already exists', () => {
            const sessionId = 'test-session-4';

            textAdapter.startTextSession(sessionId, mockWebSocket as any);

            expect(() => {
                textAdapter.startTextSession(sessionId, mockWebSocket as any);
            }).toThrow('Text session already exists');
        });

        it('should send error message on failure', () => {
            const sessionId = 'test-session-5';
            const badAgentCore = {
                initializeSession: () => {
                    throw new Error('Initialization failed');
                },
                endSession: () => {}
            };

            const badAdapter = new TextAdapter({
                agentCore: badAgentCore as any
            });

            expect(() => {
                badAdapter.startTextSession(sessionId, mockWebSocket as any);
            }).toThrow('Initialization failed');

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('error');
            expect(lastMessage.message).toBe('Failed to start text session');
        });
    });

    describe('stopTextSession', () => {
        it('should stop a text session successfully', () => {
            const sessionId = 'test-session-6';

            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            expect(textAdapter.hasSession(sessionId)).toBe(true);

            textAdapter.stopTextSession(sessionId);

            expect(textAdapter.hasSession(sessionId)).toBe(false);
            expect(textAdapter.getActiveSessionCount()).toBe(0);
            expect(mockAgentCore.getSession(sessionId)).toBeUndefined();
        });

        it('should handle stopping non-existent session gracefully', () => {
            const sessionId = 'non-existent-session';

            // Should not throw
            expect(() => {
                textAdapter.stopTextSession(sessionId);
            }).not.toThrow();
        });

        it('should force cleanup even on error', () => {
            const sessionId = 'test-session-7';
            const errorAgentCore = new MockAgentCore();
            errorAgentCore.endSession = () => {
                throw new Error('Cleanup error');
            };

            const errorAdapter = new TextAdapter({
                agentCore: errorAgentCore as any
            });

            errorAdapter.startTextSession(sessionId, mockWebSocket as any);
            expect(errorAdapter.hasSession(sessionId)).toBe(true);

            // Should not throw and should still clean up
            expect(() => {
                errorAdapter.stopTextSession(sessionId);
            }).not.toThrow();

            expect(errorAdapter.hasSession(sessionId)).toBe(false);
        });
    });

    describe('handleUserInput', () => {
        it('should process user input and send response', async () => {
            const sessionId = 'test-session-8';
            const userText = 'Hello, I need help';

            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            await textAdapter.handleUserInput(sessionId, userText);

            const messages = mockWebSocket.getAllMessages();
            
            // Should have user transcript and assistant response
            expect(messages.length).toBeGreaterThanOrEqual(2);
            
            // First message should be user transcript
            const userTranscript = messages[0];
            expect(userTranscript.type).toBe('transcript');
            expect(userTranscript.role).toBe('user');
            expect(userTranscript.text).toBe(userText);
            
            // Second message should be assistant response
            const assistantResponse = messages[1];
            expect(assistantResponse.type).toBe('transcript');
            expect(assistantResponse.role).toBe('assistant');
            expect(assistantResponse.text).toContain('Echo');
        });

        it('should echo user message as transcript for frontend display', async () => {
            const sessionId = 'test-session-9';
            const userText = 'Check my balance';

            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            await textAdapter.handleUserInput(sessionId, userText);

            const messages = mockWebSocket.getAllMessages();
            const userTranscript = messages.find(m => m.role === 'user');
            
            expect(userTranscript).toBeDefined();
            expect(userTranscript.type).toBe('transcript');
            expect(userTranscript.text).toBe(userText);
            expect(userTranscript.timestamp).toBeDefined();
        });

        it('should handle non-existent session gracefully', async () => {
            const sessionId = 'non-existent-session';
            const userText = 'Hello';

            // Should not throw
            await expect(
                textAdapter.handleUserInput(sessionId, userText)
            ).resolves.not.toThrow();
        });

        it('should send error on processing failure', async () => {
            const sessionId = 'test-session-10';
            const errorAgentCore = new MockAgentCore();
            errorAgentCore.processUserMessage = async () => {
                throw new Error('Processing failed');
            };

            const errorAdapter = new TextAdapter({
                agentCore: errorAgentCore as any
            });

            errorAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            await errorAdapter.handleUserInput(sessionId, 'Test message');

            const messages = mockWebSocket.getAllMessages();
            const errorMessage = messages.find(m => m.type === 'error');
            
            expect(errorMessage).toBeDefined();
            expect(errorMessage.message).toContain('Processing failed');
        });
    });

    describe('sendResponse', () => {
        beforeEach(() => {
            textAdapter.startTextSession('test-session', mockWebSocket as any);
            mockWebSocket.clearMessages();
        });

        it('should send text response as transcript', () => {
            const response: AgentResponse = {
                type: 'text',
                content: 'This is a text response'
            };

            textAdapter.sendResponse('test-session', response);

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('transcript');
            expect(lastMessage.role).toBe('assistant');
            expect(lastMessage.text).toBe('This is a text response');
        });

        it('should send tool call notifications', () => {
            const response: AgentResponse = {
                type: 'tool_call',
                content: '',
                toolCalls: [
                    {
                        toolName: 'check_balance',
                        toolUseId: 'tool-123',
                        input: { accountId: '12345' },
                        timestamp: Date.now()
                    }
                ]
            };

            textAdapter.sendResponse('test-session', response);

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('tool_use');
            expect(lastMessage.toolName).toBe('check_balance');
            expect(lastMessage.toolUseId).toBe('tool-123');
            expect(lastMessage.input).toEqual({ accountId: '12345' });
        });

        it('should send handoff request', () => {
            const handoffRequest: HandoffRequest = {
                targetAgentId: 'banking-agent',
                context: {
                    fromAgent: 'triage',
                    targetAgent: 'banking',
                    reason: 'User needs banking services'
                },
                graphState: {}
            };

            const response: AgentResponse = {
                type: 'handoff',
                content: '',
                handoffRequest
            };

            textAdapter.sendResponse('test-session', response);

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('handoff_request');
            expect(lastMessage.targetAgentId).toBe('banking-agent');
            expect(lastMessage.context.reason).toBe('User needs banking services');
        });

        it('should send error message', () => {
            const response: AgentResponse = {
                type: 'error',
                content: '',
                error: 'Something went wrong'
            };

            textAdapter.sendResponse('test-session', response);

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('error');
            expect(lastMessage.message).toBe('Something went wrong');
        });

        it('should handle non-existent session gracefully', () => {
            const response: AgentResponse = {
                type: 'text',
                content: 'Test'
            };

            // Should not throw
            expect(() => {
                textAdapter.sendResponse('non-existent', response);
            }).not.toThrow();
        });
    });

    describe('sendToolResult', () => {
        it('should send tool result to client', () => {
            const sessionId = 'test-session-11';
            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            const toolResult = {
                balance: 1000.50,
                currency: 'GBP'
            };

            textAdapter.sendToolResult(sessionId, 'check_balance', toolResult);

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('tool_result');
            expect(lastMessage.toolName).toBe('check_balance');
            expect(lastMessage.result).toEqual(toolResult);
            expect(lastMessage.timestamp).toBeDefined();
        });

        it('should handle non-existent session gracefully', () => {
            // Should not throw
            expect(() => {
                textAdapter.sendToolResult('non-existent', 'test_tool', {});
            }).not.toThrow();
        });
    });

    describe('sendHandoffRequest', () => {
        it('should send handoff request to Gateway', () => {
            const sessionId = 'test-session-12';
            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            const handoff: HandoffRequest = {
                targetAgentId: 'banking-agent',
                context: {
                    fromAgent: 'triage',
                    targetAgent: 'banking',
                    reason: 'User needs balance check',
                    verified: true,
                    userName: 'John Doe'
                },
                graphState: { currentNode: 'start' }
            };

            textAdapter.sendHandoffRequest(sessionId, handoff);

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('handoff_request');
            expect(lastMessage.targetAgentId).toBe('banking-agent');
            expect(lastMessage.context.fromAgent).toBe('triage');
            expect(lastMessage.context.verified).toBe(true);
            expect(lastMessage.graphState).toEqual({ currentNode: 'start' });
        });

        it('should handle non-existent session gracefully', () => {
            const handoff: HandoffRequest = {
                targetAgentId: 'test-agent',
                context: { fromAgent: 'test' },
                graphState: {}
            };

            // Should not throw
            expect(() => {
                textAdapter.sendHandoffRequest('non-existent', handoff);
            }).not.toThrow();
        });
    });

    describe('sendError', () => {
        it('should send error message to client', () => {
            const sessionId = 'test-session-13';
            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            textAdapter.sendError(sessionId, 'Test error message');

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('error');
            expect(lastMessage.message).toBe('Test error message');
            expect(lastMessage.timestamp).toBeDefined();
        });

        it('should handle non-existent session gracefully', () => {
            // Should not throw
            expect(() => {
                textAdapter.sendError('non-existent', 'Test error');
            }).not.toThrow();
        });
    });

    describe('Session Management', () => {
        it('should track multiple sessions', () => {
            const ws1 = new MockWebSocket();
            const ws2 = new MockWebSocket();
            const ws3 = new MockWebSocket();

            textAdapter.startTextSession('session-1', ws1 as any);
            textAdapter.startTextSession('session-2', ws2 as any);
            textAdapter.startTextSession('session-3', ws3 as any);

            expect(textAdapter.getActiveSessionCount()).toBe(3);
            expect(textAdapter.hasSession('session-1')).toBe(true);
            expect(textAdapter.hasSession('session-2')).toBe(true);
            expect(textAdapter.hasSession('session-3')).toBe(true);
        });

        it('should clean up sessions independently', () => {
            const ws1 = new MockWebSocket();
            const ws2 = new MockWebSocket();

            textAdapter.startTextSession('session-1', ws1 as any);
            textAdapter.startTextSession('session-2', ws2 as any);

            textAdapter.stopTextSession('session-1');

            expect(textAdapter.getActiveSessionCount()).toBe(1);
            expect(textAdapter.hasSession('session-1')).toBe(false);
            expect(textAdapter.hasSession('session-2')).toBe(true);
        });
    });

    describe('Backward Compatibility', () => {
        it('should maintain existing event format for frontend', async () => {
            const sessionId = 'test-session-14';
            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            await textAdapter.handleUserInput(sessionId, 'Test message');

            const messages = mockWebSocket.getAllMessages();
            
            // Check that all messages have expected format
            messages.forEach(msg => {
                expect(msg.type).toBeDefined();
                expect(msg.timestamp).toBeDefined();
                
                if (msg.type === 'transcript') {
                    expect(msg.role).toBeDefined();
                    expect(msg.text).toBeDefined();
                }
            });
        });

        it('should support existing tool execution format', () => {
            const sessionId = 'test-session-15';
            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            textAdapter.sendToolResult(sessionId, 'check_balance', {
                balance: 500,
                currency: 'GBP'
            });

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage).toMatchObject({
                type: 'tool_result',
                toolName: 'check_balance',
                result: {
                    balance: 500,
                    currency: 'GBP'
                }
            });
        });

        it('should support existing handoff request format', () => {
            const sessionId = 'test-session-16';
            textAdapter.startTextSession(sessionId, mockWebSocket as any);
            mockWebSocket.clearMessages();

            const handoff: HandoffRequest = {
                targetAgentId: 'banking-agent',
                context: {
                    fromAgent: 'triage',
                    reason: 'Banking services needed'
                },
                graphState: {}
            };

            textAdapter.sendHandoffRequest(sessionId, handoff);

            const lastMessage = mockWebSocket.getLastMessage();
            expect(lastMessage.type).toBe('handoff_request');
            expect(lastMessage.targetAgentId).toBeDefined();
            expect(lastMessage.context).toBeDefined();
            expect(lastMessage.graphState).toBeDefined();
        });
    });
});
