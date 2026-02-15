/**
 * Text Adapter - Wraps Agent Core with Text I/O
 * 
 * This module wraps Agent Core with text capabilities using WebSocket.
 * It manages text sessions and forwards events between WebSocket clients and Agent Core.
 * 
 * VOICE-AGNOSTIC: This adapter does NOT use Nova Sonic. Agent Core generates responses
 * using Claude Sonnet directly, making it truly voice-independent.
 */

import { WebSocket } from 'ws';
import { AgentCore, AgentResponse, HandoffRequest } from './agent-core';

/**
 * Configuration for Text Adapter
 */
export interface TextAdapterConfig {
    agentCore: AgentCore;
}

/**
 * Text session state
 */
interface TextSession {
    sessionId: string;
    ws: WebSocket;
    startTime: number;
}

/**
 * Text Adapter - Wraps Agent Core with WebSocket text I/O
 */
export class TextAdapter {
    private agentCore: AgentCore;
    private sessions: Map<string, TextSession> = new Map();

    constructor(config: TextAdapterConfig) {
        this.agentCore = config.agentCore;
        console.log('[TextAdapter] Initialized (Voice-Agnostic Mode - No Nova Sonic)');
    }

    /**
     * Start a text session
     * Initializes Agent Core session and sets up WebSocket handlers
     */
    public async startTextSession(
        sessionId: string,
        ws: WebSocket,
        memory?: any
    ): Promise<void> {
        console.log(`[TextAdapter] Starting text session: ${sessionId}`);

        // Check if session already exists
        if (this.sessions.has(sessionId)) {
            throw new Error(`Text session already exists: ${sessionId}`);
        }

        try {
            // Initialize Agent Core session
            this.agentCore.initializeSession(sessionId, memory);

            // Store session
            const session: TextSession = {
                sessionId,
                ws,
                startTime: Date.now()
            };
            this.sessions.set(sessionId, session);

            console.log(`[TextAdapter] Text session started successfully: ${sessionId} (Voice-Agnostic Mode)`);

            // Send connected message to client
            ws.send(JSON.stringify({
                type: 'connected',
                sessionId,
                timestamp: Date.now()
            }));

        } catch (error: any) {
            console.error(`[TextAdapter] Failed to start text session: ${error.message}`);

            // Clean up on error
            this.sessions.delete(sessionId);
            this.agentCore.endSession(sessionId);

            // Send error to client
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to start text session',
                details: error.message
            }));

            throw error;
        }
    }

    /**
     * Stop a text session
     * Cleans up Agent Core session
     */
    public async stopTextSession(sessionId: string): Promise<void> {
        console.log(`[TextAdapter] Stopping text session: ${sessionId}`);

        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Session not found: ${sessionId}`);
            return;
        }

        try {
            // End Agent Core session
            this.agentCore.endSession(sessionId);

            // Remove session
            this.sessions.delete(sessionId);

            console.log(`[TextAdapter] Text session stopped: ${sessionId}`);

        } catch (error: any) {
            console.error(`[TextAdapter] Error stopping text session: ${error.message}`);

            // Force cleanup even on error
            this.sessions.delete(sessionId);
            this.agentCore.endSession(sessionId);
        }
    }

    /**
     * Handle user text input
     * Forwards text to Agent Core for processing (NO Nova Sonic)
     */
    public async handleUserInput(sessionId: string, text: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Cannot handle user input: Session not found: ${sessionId}`);
            return;
        }

        try {
            console.log(`[TextAdapter] Processing user input: ${text.substring(0, 50)}...`);

            // Echo user message as transcript for frontend display
            session.ws.send(JSON.stringify({
                type: 'transcript',
                id: `user-${Date.now()}`,
                role: 'user',
                text,
                isFinal: true,
                timestamp: Date.now()
            }));

            // Generate response using Agent Core (Claude Sonnet)
            console.log(`[TextAdapter] Calling Agent Core to generate response...`);
            const response = await this.agentCore.processUserMessage(sessionId, text);
            
            // Send response to client
            this.sendResponse(sessionId, response);

        } catch (error: any) {
            console.error(`[TextAdapter] Error handling user input: ${error.message}`);
            this.sendError(sessionId, error.message);
        }
    }

    /**
     * Send response to client
     * Routes response based on type (text, tool_call, handoff, error)
     */
    public sendResponse(sessionId: string, response: AgentResponse): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Cannot send response: Session not found: ${sessionId}`);
            return;
        }

        try {
            switch (response.type) {
                case 'text':
                    // Send text response as transcript
                    session.ws.send(JSON.stringify({
                        type: 'transcript',
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        text: response.content,
                        isFinal: true,
                        timestamp: Date.now()
                    }));
                    break;

                case 'tool_call':
                    // Execute tool calls
                    if (response.toolCalls) {
                        for (const toolCall of response.toolCalls) {
                            // Send tool use notification
                            session.ws.send(JSON.stringify({
                                type: 'tool_use',
                                toolName: toolCall.toolName,
                                toolUseId: toolCall.toolUseId,
                                input: toolCall.input,
                                timestamp: toolCall.timestamp
                            }));

                            // Execute tool via Agent Core
                            this.agentCore.executeTool(
                                sessionId,
                                toolCall.toolName,
                                toolCall.input,
                                toolCall.toolUseId
                            ).then(result => {
                                // Send tool result to client
                                session.ws.send(JSON.stringify({
                                    type: 'tool_result',
                                    toolName: toolCall.toolName,
                                    toolUseId: toolCall.toolUseId,
                                    result: result.result,
                                    success: result.success,
                                    error: result.error,
                                    timestamp: Date.now()
                                }));

                                // Check for handoff in tool result
                                if (result.success && result.result?.handoffRequest) {
                                    this.sendHandoffRequest(sessionId, result.result.handoffRequest);
                                } else {
                                    // Generate follow-up response after tool execution
                                    this.agentCore.generateResponse(sessionId, `[Tool ${toolCall.toolName} completed]`)
                                        .then(followUpResponse => {
                                            this.sendResponse(sessionId, followUpResponse);
                                        })
                                        .catch(error => {
                                            console.error(`[TextAdapter] Error generating follow-up response: ${error.message}`);
                                        });
                                }
                            }).catch(error => {
                                console.error(`[TextAdapter] Tool execution error: ${error.message}`);
                                session.ws.send(JSON.stringify({
                                    type: 'tool_error',
                                    toolName: toolCall.toolName,
                                    toolUseId: toolCall.toolUseId,
                                    error: error.message,
                                    timestamp: Date.now()
                                }));
                            });
                        }
                    }
                    break;

                case 'handoff':
                    // Send handoff request
                    if (response.handoffRequest) {
                        this.sendHandoffRequest(sessionId, response.handoffRequest);
                    }
                    break;

                case 'error':
                    // Send error message
                    this.sendError(sessionId, response.error || 'Unknown error');
                    break;

                default:
                    console.warn(`[TextAdapter] Unknown response type: ${response.type}`);
            }

        } catch (error: any) {
            console.error(`[TextAdapter] Error sending response: ${error.message}`);
            this.sendError(sessionId, error.message);
        }
    }

    /**
     * Send tool result to client
     * Forwards tool execution results to WebSocket client
     */
    public sendToolResult(sessionId: string, toolName: string, result: any): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Cannot send tool result: Session not found: ${sessionId}`);
            return;
        }

        try {
            session.ws.send(JSON.stringify({
                type: 'tool_result',
                toolName,
                result,
                timestamp: Date.now()
            }));

        } catch (error: any) {
            console.error(`[TextAdapter] Error sending tool result: ${error.message}`);
        }
    }

    /**
     * Send handoff request to Gateway
     * Forwards handoff request to WebSocket client (which forwards to Gateway)
     */
    public sendHandoffRequest(sessionId: string, handoff: HandoffRequest): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Cannot send handoff request: Session not found: ${sessionId}`);
            return;
        }

        try {
            console.log(`[TextAdapter] Sending handoff request: ${handoff.targetAgentId}`);

            session.ws.send(JSON.stringify({
                type: 'handoff_request',
                targetAgentId: handoff.targetAgentId,
                context: handoff.context,
                graphState: handoff.graphState,
                timestamp: Date.now()
            }));

        } catch (error: any) {
            console.error(`[TextAdapter] Error sending handoff request: ${error.message}`);
        }
    }

    /**
     * Send error message to client
     * Sends error notification to WebSocket client
     */
    public sendError(sessionId: string, error: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Cannot send error: Session not found: ${sessionId}`);
            return;
        }

        try {
            session.ws.send(JSON.stringify({
                type: 'error',
                message: error,
                timestamp: Date.now()
            }));

        } catch (error: any) {
            console.error(`[TextAdapter] Error sending error message: ${error.message}`);
        }
    }

    /**
     * Get active session count
     * Returns the number of active text sessions
     */
    public getActiveSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Check if session exists
     * Returns true if session is active
     */
    public hasSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }
}
