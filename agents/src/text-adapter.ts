/**
 * Text Adapter - Wraps Agent Core with Text I/O
 * 
 * This module wraps Agent Core with text capabilities using WebSocket.
 * It manages text sessions and forwards events between WebSocket clients and Agent Core.
 * 
 * CRITICAL: Text mode also needs LLM invocation via SonicClient to generate responses.
 * This adapter uses SonicClient in text-only mode (no audio streaming).
 */

import { WebSocket } from 'ws';
import { AgentCore, AgentResponse, HandoffRequest } from './agent-core';
import { SonicClient, SonicConfig, SonicEvent } from './sonic-client';

/**
 * Configuration for Text Adapter
 */
export interface TextAdapterConfig {
    agentCore: AgentCore;
    sonicConfig?: SonicConfig; // Optional - if not provided, will use placeholder responses
}

/**
 * Text session state
 */
interface TextSession {
    sessionId: string;
    ws: WebSocket;
    sonicClient: SonicClient | null; // SonicClient for LLM invocation
    startTime: number;
}

/**
 * Text Adapter - Wraps Agent Core with WebSocket text I/O
 */
export class TextAdapter {
    private agentCore: AgentCore;
    private sonicConfig: SonicConfig | null;
    private sessions: Map<string, TextSession> = new Map();

    constructor(config: TextAdapterConfig) {
        this.agentCore = config.agentCore;
        this.sonicConfig = config.sonicConfig || null;
        
        console.log('[TextAdapter] Initialized', this.sonicConfig ? 'with SonicClient' : 'without SonicClient (placeholder mode)');
    }

    /**
     * Start a text session
     * Initializes Agent Core session and sets up WebSocket handlers
     * Creates SonicClient for LLM invocation if config is available
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

            // Create SonicClient if config is available
            let sonicClient: SonicClient | null = null;
            if (this.sonicConfig) {
                sonicClient = new SonicClient(this.sonicConfig);
                
                // Get system prompt and tools from Agent Core
                const personaConfig = this.agentCore.getPersonaConfig();
                const systemPrompt = this.agentCore.getSystemPrompt(sessionId);
                const tools = this.agentCore.getAllTools();

                // Configure SonicClient
                sonicClient.setConfig({
                    systemPrompt,
                    voiceId: personaConfig?.voiceId || 'matthew',
                    tools
                });

                // Start SonicClient with event handler
                await sonicClient.startSession(
                    (event: SonicEvent) => this.handleSonicEvent(sessionId, event),
                    sessionId
                );

                console.log(`[TextAdapter] SonicClient started for session: ${sessionId}`);
            }

            // Store session
            const session: TextSession = {
                sessionId,
                ws,
                sonicClient,
                startTime: Date.now()
            };
            this.sessions.set(sessionId, session);

            console.log(`[TextAdapter] Text session started successfully: ${sessionId}`);

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
     * Stops SonicClient and cleans up Agent Core session
     */
    public async stopTextSession(sessionId: string): Promise<void> {
        console.log(`[TextAdapter] Stopping text session: ${sessionId}`);

        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Session not found: ${sessionId}`);
            return;
        }

        try {
            // Stop SonicClient if it exists
            if (session.sonicClient) {
                await session.sonicClient.stopSession();
            }

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
     * Forwards text to SonicClient for LLM processing (if available)
     * Otherwise uses Agent Core directly (placeholder mode)
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
                role: 'user',
                text,
                isFinal: true,
                timestamp: Date.now()
            }));

            // If SonicClient is available, use it for LLM invocation
            if (session.sonicClient) {
                console.log(`[TextAdapter] Sending text to SonicClient for LLM processing`);
                await session.sonicClient.sendText(text);
            } else {
                // Fallback: Use Agent Core directly (placeholder mode)
                console.warn(`[TextAdapter] No SonicClient available, using placeholder mode`);
                const response = await this.agentCore.processUserMessage(sessionId, text);
                this.sendResponse(sessionId, response);
            }

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
                        role: 'assistant',
                        text: response.content,
                        isFinal: true, // Text responses are always final
                        timestamp: Date.now()
                    }));
                    break;

                case 'tool_call':
                    // Send tool call notification
                    if (response.toolCalls) {
                        for (const toolCall of response.toolCalls) {
                            session.ws.send(JSON.stringify({
                                type: 'tool_use',
                                toolName: toolCall.toolName,
                                toolUseId: toolCall.toolUseId,
                                input: toolCall.input,
                                timestamp: toolCall.timestamp
                            }));
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

    /**
     * Handle events from SonicClient
     * Translates Sonic events to WebSocket messages for the client
     * Similar to VoiceSideCar but without audio streaming
     */
    private async handleSonicEvent(sessionId: string, event: SonicEvent): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Cannot handle event: Session not found: ${sessionId}`);
            return;
        }

        try {
            switch (event.type) {
                case 'transcript':
                    // Forward transcript to client
                    this.handleTranscriptEvent(session, event.data);
                    break;

                case 'toolUse':
                    // Delegate tool execution to Agent Core
                    await this.handleToolUseEvent(session, event.data);
                    break;

                case 'metadata':
                    // Forward metadata to client
                    session.ws.send(JSON.stringify({
                        type: 'metadata',
                        data: event.data,
                        timestamp: Date.now()
                    }));
                    break;

                case 'error':
                    // Forward error to client
                    this.sendError(sessionId, event.data.message || 'An error occurred');
                    break;

                case 'usageEvent':
                    // Forward usage event to client
                    session.ws.send(JSON.stringify({
                        type: 'usage',
                        inputTokens: event.data.inputTokens || 0,
                        outputTokens: event.data.outputTokens || 0,
                        totalTokens: event.data.totalTokens || 0,
                        timestamp: Date.now()
                    }));
                    break;

                case 'workflow_update':
                    // Forward workflow update to client
                    session.ws.send(JSON.stringify({
                        type: 'workflow_update',
                        data: event.data,
                        timestamp: Date.now()
                    }));
                    break;

                case 'session_start':
                case 'contentStart':
                case 'contentEnd':
                case 'interactionTurnEnd':
                    // Forward these events to client
                    session.ws.send(JSON.stringify({
                        type: event.type,
                        data: event.data
                    }));
                    break;

                default:
                    console.warn(`[TextAdapter] Unknown event type: ${event.type}`);
            }

        } catch (error: any) {
            console.error(`[TextAdapter] Error handling Sonic event: ${error.message}`);
        }
    }

    /**
     * Handle transcript event from SonicClient
     */
    private handleTranscriptEvent(session: TextSession, transcriptData: any): void {
        const text = transcriptData.text || transcriptData.content || transcriptData.transcript || '';
        
        console.log(`[TextAdapter] Transcript event - Role: ${transcriptData.role}, Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        // Forward transcript to client
        session.ws.send(JSON.stringify({
            type: 'transcript',
            role: transcriptData.role || 'assistant',
            text,
            isFinal: transcriptData.isFinal !== undefined ? transcriptData.isFinal : true,
            timestamp: Date.now()
        }));

        // If this is a user transcript, process it through Agent Core
        if (transcriptData.role === 'user') {
            this.agentCore.processUserMessage(session.sessionId, text)
                .catch(error => {
                    console.error(`[TextAdapter] Error processing user message: ${error.message}`);
                });
        }
    }

    /**
     * Handle tool use event from SonicClient
     */
    private async handleToolUseEvent(session: TextSession, toolData: any): Promise<void> {
        console.log(`[TextAdapter] Tool use event: ${toolData.toolName}`);

        // Parse tool input if it's a JSON string
        let toolInput = toolData.input || toolData.content;
        
        if (typeof toolInput === 'string') {
            try {
                toolInput = JSON.parse(toolInput);
                console.log(`[TextAdapter] ✅ Parsed tool input from JSON string`);
            } catch (e) {
                console.warn(`[TextAdapter] ⚠️  Tool input is a string but not valid JSON, using as-is`);
                toolInput = { value: toolInput };
            }
        }
        
        if (typeof toolInput !== 'object' || toolInput === null) {
            console.warn(`[TextAdapter] ⚠️  Tool input is not an object, wrapping`);
            toolInput = { value: toolInput };
        }

        // Forward tool use to client for UI feedback
        session.ws.send(JSON.stringify({
            type: 'tool_use',
            toolName: toolData.toolName,
            toolUseId: toolData.toolUseId,
            input: toolInput,
            timestamp: Date.now()
        }));

        try {
            // Execute tool via Agent Core
            const result = await this.agentCore.executeTool(
                session.sessionId,
                toolData.toolName,
                toolInput,
                toolData.toolUseId
            );

            // Send tool result back to SonicClient
            if (session.sonicClient) {
                await session.sonicClient.sendToolResult(
                    toolData.toolUseId,
                    result.result,
                    !result.success
                );
            }

            // Forward tool result to client
            session.ws.send(JSON.stringify({
                type: 'tool_result',
                toolName: toolData.toolName,
                toolUseId: toolData.toolUseId,
                result: result.result,
                success: result.success,
                error: result.error,
                timestamp: Date.now()
            }));

            // Check if this is a handoff tool and the result contains a handoff request
            if (result.success && result.result?.handoffRequest) {
                const handoffRequest = result.result.handoffRequest;
                
                console.log(`[TextAdapter] 🔄 Forwarding handoff request: ${handoffRequest.targetAgentId}`);
                
                // Forward handoff request to client (which will forward to Gateway)
                session.ws.send(JSON.stringify({
                    type: 'handoff_request',
                    targetAgentId: handoffRequest.targetAgentId,
                    context: handoffRequest.context,
                    graphState: handoffRequest.graphState,
                    timestamp: Date.now()
                }));
            }

        } catch (error: any) {
            console.error(`[TextAdapter] ❌ Tool execution error: ${error.message}`);

            // Send error result to SonicClient
            if (session.sonicClient) {
                await session.sonicClient.sendToolResult(
                    toolData.toolUseId,
                    { error: error.message },
                    true
                );
            }

            // Forward error to client
            session.ws.send(JSON.stringify({
                type: 'tool_error',
                toolName: toolData.toolName,
                toolUseId: toolData.toolUseId,
                error: error.message,
                timestamp: Date.now()
            }));
        }
    }
}
