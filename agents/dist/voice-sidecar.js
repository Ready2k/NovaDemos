"use strict";
/**
 * Voice Side-Car - Wraps Agent Core with Voice I/O
 *
 * This module wraps Agent Core with voice capabilities using SonicClient.
 * It manages the SonicClient lifecycle and forwards events between Sonic and Agent Core.
 *
 * The Voice Side-Car maintains backward compatibility with existing voice features
 * while decoupling voice I/O from business logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceSideCar = void 0;
const sonic_client_1 = require("./sonic-client");
/**
 * Voice Side-Car - Wraps Agent Core with voice I/O using SonicClient
 */
class VoiceSideCar {
    constructor(config) {
        this.sessions = new Map();
        this.agentCore = config.agentCore;
        this.sonicConfig = config.sonicConfig;
        console.log('[VoiceSideCar] Initialized');
    }
    /**
     * Start a voice session
     * Creates a SonicClient, initializes Agent Core session, and starts streaming
     */
    async startVoiceSession(sessionId, ws, memory) {
        console.log(`[VoiceSideCar] Starting voice session: ${sessionId}`);
        // Check if session already exists
        if (this.sessions.has(sessionId)) {
            throw new Error(`Voice session already exists: ${sessionId}`);
        }
        try {
            // Initialize Agent Core session
            this.agentCore.initializeSession(sessionId, memory);
            // Create SonicClient for this session
            const sonicClient = new sonic_client_1.SonicClient(this.sonicConfig);
            // Store session
            const session = {
                sessionId,
                ws,
                sonicClient,
                startTime: Date.now()
            };
            this.sessions.set(sessionId, session);
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
            await sonicClient.startSession((event) => this.handleSonicEvent(sessionId, event), sessionId);
            console.log(`[VoiceSideCar] Voice session started successfully: ${sessionId}`);
            // Send connected message to client
            ws.send(JSON.stringify({
                type: 'connected',
                sessionId,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.error(`[VoiceSideCar] Failed to start voice session: ${error.message}`);
            // Clean up on error
            this.sessions.delete(sessionId);
            this.agentCore.endSession(sessionId);
            // Send error to client
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to start voice session',
                details: error.message
            }));
            throw error;
        }
    }
    /**
     * Stop a voice session
     * Stops SonicClient and cleans up Agent Core session
     */
    async stopVoiceSession(sessionId) {
        console.log(`[VoiceSideCar] Stopping voice session: ${sessionId}`);
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Session not found: ${sessionId}`);
            return;
        }
        try {
            // Stop SonicClient
            await session.sonicClient.stopSession();
            // End Agent Core session
            this.agentCore.endSession(sessionId);
            // Remove session
            this.sessions.delete(sessionId);
            console.log(`[VoiceSideCar] Voice session stopped: ${sessionId}`);
        }
        catch (error) {
            console.error(`[VoiceSideCar] Error stopping voice session: ${error.message}`);
            // Force cleanup even on error
            this.sessions.delete(sessionId);
            this.agentCore.endSession(sessionId);
        }
    }
    /**
     * Handle audio chunk from client
     * Forwards audio to SonicClient
     */
    async handleAudioChunk(sessionId, audioBuffer) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot handle audio chunk: Session not found: ${sessionId}`);
            return;
        }
        try {
            const audioChunk = {
                buffer: audioBuffer,
                timestamp: Date.now()
            };
            await session.sonicClient.sendAudioChunk(audioChunk);
        }
        catch (error) {
            console.error(`[VoiceSideCar] Error handling audio chunk: ${error.message}`);
            // Send error to client
            session.ws.send(JSON.stringify({
                type: 'error',
                message: 'Error processing audio',
                details: error.message
            }));
        }
    }
    /**
     * End audio input stream
     * Signals SonicClient that user has finished speaking
     */
    async endAudioInput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot end audio input: Session not found: ${sessionId}`);
            return;
        }
        try {
            await session.sonicClient.endAudioInput();
            console.log(`[VoiceSideCar] Audio input ended for session: ${sessionId}`);
        }
        catch (error) {
            console.error(`[VoiceSideCar] Error ending audio input: ${error.message}`);
        }
    }
    /**
     * Handle text input (for hybrid mode)
     * Sends text to SonicClient for processing
     */
    async handleTextInput(sessionId, text) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot handle text input: Session not found: ${sessionId}`);
            return;
        }
        try {
            await session.sonicClient.sendText(text);
            console.log(`[VoiceSideCar] Text input sent for session: ${sessionId}`);
        }
        catch (error) {
            console.error(`[VoiceSideCar] Error handling text input: ${error.message}`);
            // Send error to client
            session.ws.send(JSON.stringify({
                type: 'error',
                message: 'Error processing text input',
                details: error.message
            }));
        }
    }
    /**
     * Update session configuration
     * Updates SonicClient configuration (system prompt, tools, voice, etc.)
     */
    updateSessionConfig(sessionId, config) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot update config: Session not found: ${sessionId}`);
            return;
        }
        try {
            session.sonicClient.setConfig(config);
            console.log(`[VoiceSideCar] Session config updated for: ${sessionId}`);
        }
        catch (error) {
            console.error(`[VoiceSideCar] Error updating session config: ${error.message}`);
        }
    }
    /**
     * Handle events from SonicClient
     * Translates Sonic events to Agent Core method calls and forwards to client
     */
    async handleSonicEvent(sessionId, event) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot handle event: Session not found: ${sessionId}`);
            return;
        }
        try {
            switch (event.type) {
                case 'audio':
                    // Forward audio to client
                    this.forwardAudioToClient(session, event.data);
                    break;
                case 'transcript':
                    // Forward transcript to client and update Agent Core
                    this.handleTranscriptEvent(session, event.data);
                    break;
                case 'toolUse':
                    // Delegate tool execution to Agent Core
                    await this.handleToolUseEvent(session, event.data);
                    break;
                case 'metadata':
                    // Forward metadata to client
                    this.forwardMetadataToClient(session, event.data);
                    break;
                case 'error':
                    // Forward error to client
                    this.forwardErrorToClient(session, event.data);
                    break;
                case 'interruption':
                    // Forward interruption to client
                    this.forwardInterruptionToClient(session, event.data);
                    break;
                case 'usageEvent':
                    // Forward usage event to client
                    this.forwardUsageEventToClient(session, event.data);
                    break;
                case 'workflow_update':
                    // Update workflow state in Agent Core and forward to client
                    this.handleWorkflowUpdateEvent(session, event.data);
                    break;
                case 'session_start':
                    // Forward session start to client
                    session.ws.send(JSON.stringify({
                        type: 'session_start',
                        data: event.data
                    }));
                    break;
                case 'contentStart':
                case 'contentEnd':
                case 'interactionTurnEnd':
                    // Forward these events to client for frontend processing
                    session.ws.send(JSON.stringify({
                        type: event.type,
                        data: event.data
                    }));
                    break;
                default:
                    console.warn(`[VoiceSideCar] Unknown event type: ${event.type}`);
            }
        }
        catch (error) {
            console.error(`[VoiceSideCar] Error handling Sonic event: ${error.message}`);
        }
    }
    /**
     * Forward audio to client
     */
    forwardAudioToClient(session, audioData) {
        // Send audio as binary data
        if (audioData.buffer) {
            session.ws.send(audioData.buffer);
        }
    }
    /**
     * Handle transcript event
     */
    handleTranscriptEvent(session, transcriptData) {
        // Forward transcript to client
        session.ws.send(JSON.stringify({
            type: 'transcript',
            role: transcriptData.role || 'assistant',
            text: transcriptData.text || transcriptData.content || '',
            timestamp: Date.now()
        }));
        // If this is a user transcript, process it through Agent Core
        if (transcriptData.role === 'user') {
            const userMessage = transcriptData.text || transcriptData.content || '';
            this.agentCore.processUserMessage(session.sessionId, userMessage)
                .catch(error => {
                console.error(`[VoiceSideCar] Error processing user message: ${error.message}`);
            });
        }
    }
    /**
     * Handle tool use event
     */
    async handleToolUseEvent(session, toolData) {
        console.log(`[VoiceSideCar] Tool use event: ${toolData.toolName}`);
        // Forward tool use to client for UI feedback
        session.ws.send(JSON.stringify({
            type: 'tool_use',
            toolName: toolData.toolName,
            toolUseId: toolData.toolUseId,
            input: toolData.input || toolData.content,
            timestamp: Date.now()
        }));
        try {
            // Execute tool via Agent Core
            const result = await this.agentCore.executeTool(session.sessionId, toolData.toolName, toolData.input || toolData.content, toolData.toolUseId);
            // Send tool result back to SonicClient
            await session.sonicClient.sendToolResult(toolData.toolUseId, result.result, !result.success);
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
            // Requirement 9.4: Send handoff_request to Gateway (via adapter)
            if (result.success && result.result?.handoffRequest) {
                const handoffRequest = result.result.handoffRequest;
                console.log(`[VoiceSideCar] Forwarding handoff request: ${handoffRequest.targetAgentId}`);
                // Forward handoff request to client (which will forward to Gateway)
                session.ws.send(JSON.stringify({
                    type: 'handoff_request',
                    targetAgentId: handoffRequest.targetAgentId,
                    context: handoffRequest.context,
                    graphState: handoffRequest.graphState,
                    timestamp: Date.now()
                }));
            }
        }
        catch (error) {
            console.error(`[VoiceSideCar] Tool execution error: ${error.message}`);
            // Send error result to SonicClient
            await session.sonicClient.sendToolResult(toolData.toolUseId, { error: error.message }, true);
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
    /**
     * Forward metadata to client
     */
    forwardMetadataToClient(session, metadata) {
        session.ws.send(JSON.stringify({
            type: 'metadata',
            data: metadata,
            timestamp: Date.now()
        }));
    }
    /**
     * Forward error to client
     */
    forwardErrorToClient(session, errorData) {
        session.ws.send(JSON.stringify({
            type: 'error',
            message: errorData.message || 'An error occurred',
            details: errorData.details || errorData,
            timestamp: Date.now()
        }));
    }
    /**
     * Forward interruption to client
     */
    forwardInterruptionToClient(session, interruptionData) {
        session.ws.send(JSON.stringify({
            type: 'interruption',
            data: interruptionData,
            timestamp: Date.now()
        }));
    }
    /**
     * Forward usage event to client
     */
    forwardUsageEventToClient(session, usageData) {
        session.ws.send(JSON.stringify({
            type: 'usage',
            inputTokens: usageData.inputTokens || 0,
            outputTokens: usageData.outputTokens || 0,
            totalTokens: usageData.totalTokens || 0,
            timestamp: Date.now()
        }));
    }
    /**
     * Handle workflow update event
     */
    handleWorkflowUpdateEvent(session, workflowData) {
        // Update workflow state in Agent Core
        if (workflowData.nodeId) {
            try {
                const update = this.agentCore.updateWorkflowState(session.sessionId, workflowData.nodeId);
                // Forward workflow update to client
                session.ws.send(JSON.stringify({
                    type: 'workflow_update',
                    currentNode: update.currentNode,
                    previousNode: update.previousNode,
                    nextNodes: update.nextNodes,
                    validTransition: update.validTransition,
                    nodeInfo: update.nodeInfo,
                    timestamp: Date.now()
                }));
            }
            catch (error) {
                console.error(`[VoiceSideCar] Error updating workflow state: ${error.message}`);
            }
        }
        else {
            // Just forward the workflow update to client
            session.ws.send(JSON.stringify({
                type: 'workflow_update',
                data: workflowData,
                timestamp: Date.now()
            }));
        }
    }
    /**
     * Get active session count
     */
    getActiveSessionCount() {
        return this.sessions.size;
    }
    /**
     * Check if session exists
     */
    hasSession(sessionId) {
        return this.sessions.has(sessionId);
    }
}
exports.VoiceSideCar = VoiceSideCar;
