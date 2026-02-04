"use strict";
/**
 * Text Adapter - Wraps Agent Core with Text I/O
 *
 * This module wraps Agent Core with text capabilities using WebSocket.
 * It manages text sessions and forwards events between WebSocket clients and Agent Core.
 *
 * The Text Adapter maintains backward compatibility with existing text features
 * while decoupling text I/O from business logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextAdapter = void 0;
/**
 * Text Adapter - Wraps Agent Core with WebSocket text I/O
 */
class TextAdapter {
    constructor(config) {
        this.sessions = new Map();
        this.agentCore = config.agentCore;
        console.log('[TextAdapter] Initialized');
    }
    /**
     * Start a text session
     * Initializes Agent Core session and sets up WebSocket handlers
     */
    startTextSession(sessionId, ws, memory) {
        console.log(`[TextAdapter] Starting text session: ${sessionId}`);
        // Check if session already exists
        if (this.sessions.has(sessionId)) {
            throw new Error(`Text session already exists: ${sessionId}`);
        }
        try {
            // Initialize Agent Core session
            this.agentCore.initializeSession(sessionId, memory);
            // Store session
            const session = {
                sessionId,
                ws,
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
        }
        catch (error) {
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
     * Cleans up Agent Core session and removes session state
     */
    stopTextSession(sessionId) {
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
        }
        catch (error) {
            console.error(`[TextAdapter] Error stopping text session: ${error.message}`);
            // Force cleanup even on error
            this.sessions.delete(sessionId);
            // Try to end session again, but catch any errors
            try {
                this.agentCore.endSession(sessionId);
            }
            catch (cleanupError) {
                console.error(`[TextAdapter] Error during forced cleanup: ${cleanupError.message}`);
            }
        }
    }
    /**
     * Handle user text input
     * Forwards text to Agent Core for processing and sends response back to client
     */
    async handleUserInput(sessionId, text) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TextAdapter] Cannot handle user input: Session not found: ${sessionId}`);
            return;
        }
        try {
            console.log(`[TextAdapter] Processing user input: ${text.substring(0, 50)}...`);
            // Echo user message as transcript for frontend display (backward compatibility)
            session.ws.send(JSON.stringify({
                type: 'transcript',
                role: 'user',
                text,
                timestamp: Date.now()
            }));
            // Process message through Agent Core
            const response = await this.agentCore.processUserMessage(sessionId, text);
            // Send response based on type
            this.sendResponse(sessionId, response);
        }
        catch (error) {
            console.error(`[TextAdapter] Error handling user input: ${error.message}`);
            this.sendError(sessionId, error.message);
        }
    }
    /**
     * Send response to client
     * Routes response based on type (text, tool_call, handoff, error)
     */
    sendResponse(sessionId, response) {
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
        }
        catch (error) {
            console.error(`[TextAdapter] Error sending response: ${error.message}`);
            this.sendError(sessionId, error.message);
        }
    }
    /**
     * Send tool result to client
     * Forwards tool execution results to WebSocket client
     */
    sendToolResult(sessionId, toolName, result) {
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
        }
        catch (error) {
            console.error(`[TextAdapter] Error sending tool result: ${error.message}`);
        }
    }
    /**
     * Send handoff request to Gateway
     * Forwards handoff request to WebSocket client (which forwards to Gateway)
     */
    sendHandoffRequest(sessionId, handoff) {
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
        }
        catch (error) {
            console.error(`[TextAdapter] Error sending handoff request: ${error.message}`);
        }
    }
    /**
     * Send error message to client
     * Sends error notification to WebSocket client
     */
    sendError(sessionId, error) {
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
        }
        catch (error) {
            console.error(`[TextAdapter] Error sending error message: ${error.message}`);
        }
    }
    /**
     * Get active session count
     * Returns the number of active text sessions
     */
    getActiveSessionCount() {
        return this.sessions.size;
    }
    /**
     * Check if session exists
     * Returns true if session is active
     */
    hasSession(sessionId) {
        return this.sessions.has(sessionId);
    }
}
exports.TextAdapter = TextAdapter;
