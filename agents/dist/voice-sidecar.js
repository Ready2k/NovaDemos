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
const handoff_tools_1 = require("./handoff-tools");
const banking_tools_1 = require("./banking-tools");
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
            // Check interaction mode from memory
            const interactionMode = memory?.interactionMode || 'chat_voice';
            const voiceEnabled = interactionMode !== 'chat_only';
            // Initialize Agent Core session with voice/hybrid mode for speech formatting
            this.agentCore.initializeSession(sessionId, memory, 'hybrid');
            // Create SonicClient for this session
            const sonicClient = new sonic_client_1.SonicClient(this.sonicConfig);
            // Store session
            const session = {
                sessionId,
                ws,
                sonicClient,
                startTime: Date.now(),
                voiceEnabled,
                isStarted: false,
                isStarting: false
            };
            this.sessions.set(sessionId, session);
            // If voice is enabled, try to start the session immediately
            if (voiceEnabled) {
                try {
                    await this.actuallyStartVoice(session, false); // Don't send connected message yet
                }
                catch (error) {
                    console.warn(`[VoiceSideCar] ⚠️ Failed to initialize voice stream: ${error.message}`);
                    console.warn(`[VoiceSideCar] downgrading to chat-only mode for session ${sessionId}`);
                    session.voiceEnabled = false;
                    // Proceed without throwing - allow chat functionality
                }
            }
            else {
                console.log(`[VoiceSideCar] Voice stream NOT started for session ${sessionId} (interactionMode=${interactionMode})`);
            }
            // Always send connected message to client
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
     * Actually start the Sonic session for a session
     */
    async actuallyStartVoice(session, sendConnected = true) {
        if (session.isStarted || session.isStarting)
            return;
        session.isStarting = true;
        console.log(`[VoiceSideCar] Actually starting voice for session: ${session.sessionId}`);
        try {
            // Get system prompt and tools from Agent Core
            const personaConfig = this.agentCore.getPersonaConfig();
            const systemPrompt = this.agentCore.getSystemPrompt(session.sessionId);
            const tools = this.agentCore.getAllTools();
            console.log(`[VoiceSideCar] Configuring SonicClient for ${session.sessionId} (prompt length: ${systemPrompt.length}, tools: ${tools.length})`);
            // Configure SonicClient
            session.sonicClient.setConfig({
                systemPrompt,
                voiceId: personaConfig?.voiceId || 'matthew',
                tools
            });
            // Start SonicClient with event handler
            console.log(`[VoiceSideCar] Calling sonicClient.startSession for ${session.sessionId}...`);
            await session.sonicClient.startSession((event) => this.handleSonicEvent(session.sessionId, event), session.sessionId);
            session.isStarted = true;
            session.isStarting = false;
            console.log(`[VoiceSideCar] ✅ Voice session started successfully: ${session.sessionId}`);
            if (sendConnected) {
                // Send connected message to client
                session.ws.send(JSON.stringify({
                    type: 'connected',
                    sessionId: session.sessionId,
                    timestamp: Date.now()
                }));
            }
        }
        catch (error) {
            session.isStarting = false;
            console.error(`[VoiceSideCar] ❌ Failed to actually start voice for session ${session.sessionId}:`, error);
            throw error; // Let the caller (handleTextInput/handleAudioChunk) handle it
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
            // Lazy start if not already started
            if (!session.isStarted) {
                console.log(`[VoiceSideCar] User sending audio - lazily starting voice for session ${sessionId}`);
                await this.actuallyStartVoice(session, false);
            }
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
            if (session.isStarted) {
                await session.sonicClient.endAudioInput();
                console.log(`[VoiceSideCar] Audio input ended for session: ${sessionId}`);
            }
        }
        catch (error) {
            console.error(`[VoiceSideCar] Error ending audio input: ${error.message}`);
        }
    }
    /**
     * Handle text input (for hybrid mode)
     */
    async handleTextInput(sessionId, text, skipTranscript = false) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot handle text input: Session not found: ${sessionId}`);
            return;
        }
        try {
            // Lazy start if not already started BUT only if voice is enabled
            if (!session.isStarted) {
                if (session.voiceEnabled) {
                    console.log(`[VoiceSideCar] User sending text in hybrid mode - lazily starting voice for session ${sessionId}`);
                    await this.actuallyStartVoice(session, false);
                    await session.sonicClient.sendText(text, skipTranscript);
                }
                else {
                    console.log(`[VoiceSideCar] User sending text in chat-only mode - using AgentCore processUserMessage (Voice-Agnostic)`);
                    // Echo user message as transcript for frontend display (if not skipping)
                    if (!skipTranscript) {
                        session.ws.send(JSON.stringify({
                            type: 'transcript',
                            id: `user-${Date.now()}`,
                            role: 'user',
                            text,
                            isFinal: true,
                            timestamp: Date.now()
                        }));
                    }
                    // Generate response using Agent Core (Claude Sonnet) directly
                    const response = await this.agentCore.processUserMessage(sessionId, text);
                    this.sendTextResponse(sessionId, response);
                }
            }
            else {
                // Already started, use Sonic
                await session.sonicClient.sendText(text, skipTranscript);
            }
            console.log(`[VoiceSideCar] Text input processed for session: ${sessionId} (skipTranscript=${skipTranscript})`);
        }
        catch (error) {
            console.error(`[VoiceSideCar] ❌ Error handling text input for session ${sessionId}:`, error);
            if (error.stack)
                console.error(error.stack);
            // Send error to client
            session.ws.send(JSON.stringify({
                type: 'error',
                message: 'Error processing text input',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }));
        }
    }
    /**
     * Send text response to client (Voice-Agnostic path)
     */
    sendTextResponse(sessionId, response) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        try {
            switch (response.type) {
                case 'text':
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
                    if (response.toolCalls) {
                        for (const toolCall of response.toolCalls) {
                            session.ws.send(JSON.stringify({
                                type: 'tool_use',
                                toolName: toolCall.toolName,
                                toolUseId: toolCall.toolUseId,
                                input: toolCall.input,
                                timestamp: toolCall.timestamp
                            }));
                            this.agentCore.executeTool(sessionId, toolCall.toolName, toolCall.input, toolCall.toolUseId)
                                .then(result => {
                                session.ws.send(JSON.stringify({
                                    type: 'tool_result',
                                    toolName: toolCall.toolName,
                                    toolUseId: toolCall.toolUseId,
                                    result: result.result,
                                    success: result.success,
                                    error: result.error,
                                    timestamp: Date.now()
                                }));
                                if (result.success && result.result?.handoffRequest) {
                                    this.sendHandoffRequest(sessionId, result.result.handoffRequest);
                                }
                                else if (!(0, handoff_tools_1.isHandoffTool)(toolCall.toolName)) {
                                    // Auto-trigger follow-up for text mode
                                    this.agentCore.generateResponse(sessionId, '')
                                        .then(followUp => this.sendTextResponse(sessionId, followUp));
                                }
                            });
                        }
                    }
                    break;
                case 'handoff':
                    if (response.handoffRequest) {
                        this.sendHandoffRequest(sessionId, response.handoffRequest);
                    }
                    break;
                case 'error':
                    this.sendError(sessionId, response.error || 'Unknown error');
                    break;
            }
        }
        catch (error) {
            console.error(`[VoiceSideCar] Error sending text response: ${error.message}`);
        }
    }
    /**
     * Send handoff request to client
     */
    sendHandoffRequest(sessionId, handoff) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.ws.send(JSON.stringify({
            type: 'handoff_request',
            targetAgentId: handoff.targetAgentId,
            context: handoff.context,
            graphState: handoff.graphState,
            timestamp: Date.now()
        }));
    }
    /**
     * Send error message to client
     */
    sendError(sessionId, error) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.ws.send(JSON.stringify({
            type: 'error',
            message: error,
            timestamp: Date.now()
        }));
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
            if (session.isStarted) {
                session.sonicClient.setConfig(config);
                console.log(`[VoiceSideCar] Session config updated for: ${sessionId}`);
            }
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
                    // Forward session start to client (FLATTENED)
                    session.ws.send(JSON.stringify({
                        type: 'session_start',
                        sessionId: event.data.sessionId,
                        timestamp: new Date().toISOString()
                    }));
                    break;
                case 'contentStart':
                case 'contentEnd':
                case 'interactionTurnEnd':
                    // Forward these events to client for frontend processing (FLATTENED)
                    session.ws.send(JSON.stringify({
                        type: event.type,
                        ...event.data
                    }));
                    break;
                default:
                    // CRITICAL: Don't forward unknown events to prevent JSON errors
                    console.log(`[VoiceSideCar] Filtered unknown event type: ${event.type} (not forwarding to client)`);
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
        if (audioData.audio) {
            console.log(`[VoiceSideCar] Sending audio chunk: ${audioData.audio.length} bytes`);
            session.ws.send(audioData.audio);
        }
        else if (audioData.buffer) {
            console.log(`[VoiceSideCar] Sending audio buffer: ${audioData.buffer.length} bytes`);
            session.ws.send(audioData.buffer);
        }
    }
    /**
     * Handle transcript event
     */
    handleTranscriptEvent(session, transcriptData) {
        const text = transcriptData.text || transcriptData.content || transcriptData.transcript || '';
        console.log(`[VoiceSideCar] Transcript event - Role: ${transcriptData.role}, Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        const role = transcriptData.role || 'assistant';
        const stableId = transcriptData.id || `${session.sessionId}-${role}-${transcriptData.timestamp || Date.now()}`;
        // Forward transcript to client (FLATTENED)
        session.ws.send(JSON.stringify({
            type: 'transcript',
            id: stableId,
            role: role,
            text: text,
            isFinal: transcriptData.isFinal !== undefined ? transcriptData.isFinal : true,
            timestamp: transcriptData.timestamp || Date.now()
        }));
        const isFinal = transcriptData.isFinal !== undefined ? transcriptData.isFinal : true;
        if (role === 'user' && isFinal) {
            this.agentCore.trackUserMessage(session.sessionId, text);
            console.log(`[VoiceSideCar] Synced FINAL User transcript to history: "${text.substring(0, 30)}..."`);
        }
        else if (role === 'assistant' && isFinal) {
            this.agentCore.trackAssistantResponse(session.sessionId, text);
            console.log(`[VoiceSideCar] Synced FINAL Assistant transcript to history: "${text.substring(0, 30)}..."`);
        }
    }
    /**
     * Handle tool use event
     */
    async handleToolUseEvent(session, toolData) {
        console.log(`[VoiceSideCar] Tool use event: ${toolData.toolName}`);
        let toolInput = toolData.input || toolData.content;
        if (typeof toolInput === 'string') {
            try {
                toolInput = JSON.parse(toolInput);
            }
            catch (e) {
                console.warn(`[VoiceSideCar] Tool input is a string but not valid JSON, using as-is: ${toolInput}`);
                toolInput = { value: toolInput };
            }
        }
        if (typeof toolInput !== 'object' || toolInput === null) {
            toolInput = { value: toolInput };
        }
        session.ws.send(JSON.stringify({
            type: 'tool_use',
            toolName: toolData.toolName,
            toolUseId: toolData.toolUseId,
            input: toolInput,
            timestamp: Date.now()
        }));
        try {
            const result = await this.agentCore.executeTool(session.sessionId, toolData.toolName, toolInput, toolData.toolUseId);
            await session.sonicClient.sendToolResult(toolData.toolUseId, result.result, !result.success);
            const agentSession = this.agentCore.getSession(session.sessionId);
            const isHandingOff = !!agentSession?.graphState?.pendingHandoff;
            const isBanking = (0, banking_tools_1.isBankingTool)(toolData.toolName);
            if (!isHandingOff && isBanking) {
                const updatedSystemPrompt = this.agentCore.getSystemPrompt(session.sessionId);
                session.sonicClient.updateSystemPrompt(updatedSystemPrompt);
                console.log(`[VoiceSideCar] 🔄 Refreshed system prompt after state-changing banking tool (${toolData.toolName})`);
            }
            session.ws.send(JSON.stringify({
                type: 'tool_result',
                toolName: toolData.toolName,
                toolUseId: toolData.toolUseId,
                input: toolInput,
                result: result.result,
                success: result.success,
                error: result.error,
                timestamp: Date.now()
            }));
            if (agentSession?.graphState?.pendingHandoff) {
                const pendingHandoff = agentSession.graphState.pendingHandoff;
                delete agentSession.graphState.pendingHandoff;
                setTimeout(() => {
                    session.ws.send(JSON.stringify({
                        type: 'handoff_request',
                        targetAgentId: pendingHandoff.targetAgent,
                        context: pendingHandoff.context,
                        graphState: agentSession.graphState,
                        timestamp: Date.now()
                    }));
                }, 2000);
            }
            if (result.success && result.result?.handoffRequest) {
                const handoffRequest = result.result.handoffRequest;
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
            console.error(`[VoiceSideCar] ❌ Tool execution error: ${error.message}`);
            await session.sonicClient.sendToolResult(toolData.toolUseId, { error: error.message }, true);
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
        if (workflowData.nodeId) {
            try {
                const update = this.agentCore.updateWorkflowState(session.sessionId, workflowData.nodeId);
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
    /**
     * Get a voice session
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
}
exports.VoiceSideCar = VoiceSideCar;
