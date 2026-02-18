/**
 * Voice Side-Car - Wraps Agent Core with Voice I/O
 * 
 * This module wraps Agent Core with voice capabilities using SonicClient.
 * It manages the SonicClient lifecycle and forwards events between Sonic and Agent Core.
 * 
 * The Voice Side-Car maintains backward compatibility with existing voice features
 * while decoupling voice I/O from business logic.
 */

import { WebSocket } from 'ws';
import { SonicClient, SonicConfig, SonicEvent, AudioChunk } from './sonic-client';
import { AgentCore } from './agent-core';
import { isHandoffTool } from './handoff-tools';
import { isBankingTool } from './banking-tools';

/**
 * Configuration for Voice Side-Car
 */
export interface VoiceSideCarConfig {
    agentCore: AgentCore;
    sonicConfig: SonicConfig;
}

/**
 * Voice session state
 */
interface VoiceSession {
    sessionId: string;
    ws: WebSocket;
    sonicClient: SonicClient;
    startTime: number;
}

/**
 * Voice Side-Car - Wraps Agent Core with voice I/O using SonicClient
 */
export class VoiceSideCar {
    private agentCore: AgentCore;
    private sonicConfig: SonicConfig;
    private sessions: Map<string, VoiceSession> = new Map();

    constructor(config: VoiceSideCarConfig) {
        this.agentCore = config.agentCore;
        this.sonicConfig = config.sonicConfig;

        console.log('[VoiceSideCar] Initialized');
    }

    /**
     * Start a voice session
     * Creates a SonicClient, initializes Agent Core session, and starts streaming
     */
    public async startVoiceSession(
        sessionId: string,
        ws: WebSocket,
        memory?: any
    ): Promise<void> {
        console.log(`[VoiceSideCar] Starting voice session: ${sessionId}`);

        // Check if session already exists
        if (this.sessions.has(sessionId)) {
            throw new Error(`Voice session already exists: ${sessionId}`);
        }

        try {
            // Initialize Agent Core session with voice/hybrid mode for speech formatting
            this.agentCore.initializeSession(sessionId, memory, 'hybrid');

            // Create SonicClient for this session
            const sonicClient = new SonicClient(this.sonicConfig);

            // Store session
            const session: VoiceSession = {
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
            await sonicClient.startSession(
                (event: SonicEvent) => this.handleSonicEvent(sessionId, event),
                sessionId
            );

            console.log(`[VoiceSideCar] Voice session started successfully: ${sessionId}`);

            // Send connected message to client
            ws.send(JSON.stringify({
                type: 'connected',
                sessionId,
                timestamp: Date.now()
            }));

        } catch (error: any) {
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
    public async stopVoiceSession(sessionId: string): Promise<void> {
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

        } catch (error: any) {
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
    public async handleAudioChunk(sessionId: string, audioBuffer: Buffer): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot handle audio chunk: Session not found: ${sessionId}`);
            return;
        }

        try {
            const audioChunk: AudioChunk = {
                buffer: audioBuffer,
                timestamp: Date.now()
            };

            await session.sonicClient.sendAudioChunk(audioChunk);

        } catch (error: any) {
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
    public async endAudioInput(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot end audio input: Session not found: ${sessionId}`);
            return;
        }

        try {
            await session.sonicClient.endAudioInput();
            console.log(`[VoiceSideCar] Audio input ended for session: ${sessionId}`);

        } catch (error: any) {
            console.error(`[VoiceSideCar] Error ending audio input: ${error.message}`);
        }
    }

    /**
     * Handle text input (for hybrid mode)
     * Sends text to SonicClient for processing
     */
    public async handleTextInput(sessionId: string, text: string, skipTranscript: boolean = false): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot handle text input: Session not found: ${sessionId}`);
            return;
        }

        try {
            await session.sonicClient.sendText(text, skipTranscript);
            console.log(`[VoiceSideCar] Text input sent for session: ${sessionId} (skipTranscript=${skipTranscript})`);

        } catch (error: any) {
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
    public updateSessionConfig(sessionId: string, config: any): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[VoiceSideCar] Cannot update config: Session not found: ${sessionId}`);
            return;
        }

        try {
            session.sonicClient.setConfig(config);
            console.log(`[VoiceSideCar] Session config updated for: ${sessionId}`);

        } catch (error: any) {
            console.error(`[VoiceSideCar] Error updating session config: ${error.message}`);
        }
    }

    /**
     * Handle events from SonicClient
     * Translates Sonic events to Agent Core method calls and forwards to client
     */
    private async handleSonicEvent(sessionId: string, event: SonicEvent): Promise<void> {
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
                    // Nova Sonic may send internal events (TEXT, AUDIO, TOOL, etc.) that aren't in our SonicEvent type
                    // These raw events should be silently filtered to prevent the client from receiving unexpected message formats
                    console.log(`[VoiceSideCar] Filtered unknown event type: ${event.type} (not forwarding to client)`);
            }

        } catch (error: any) {
            console.error(`[VoiceSideCar] Error handling Sonic event: ${error.message}`);
        }
    }

    /**
     * Forward audio to client
     */
    private forwardAudioToClient(session: VoiceSession, audioData: any): void {
        // Send audio as binary data
        // SonicClient emits matches { audio: Buffer }, so we access .audio
        if (audioData.audio) {
            console.log(`[VoiceSideCar] Sending audio chunk: ${audioData.audio.length} bytes`);
            session.ws.send(audioData.audio);
        } else if (audioData.buffer) {
            // Fallback for legacy or different event shapes
            console.log(`[VoiceSideCar] Sending audio buffer: ${audioData.buffer.length} bytes`);
            session.ws.send(audioData.buffer);
        }
    }

    /**
     * Handle transcript event
     */
    private handleTranscriptEvent(session: VoiceSession, transcriptData: any): void {
        // Extract text from various possible fields
        const text = transcriptData.text || transcriptData.content || transcriptData.transcript || '';

        console.log(`[VoiceSideCar] Transcript event - Role: ${transcriptData.role}, Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

        // CRITICAL FIX: Generate stable ID if not provided by SonicClient
        const role = transcriptData.role || 'assistant';
        const stableId = transcriptData.id || `${session.sessionId}-${role}-${transcriptData.timestamp || Date.now()}`;

        // Forward transcript to client (FLATTENED)
        session.ws.send(JSON.stringify({
            type: 'transcript',
            id: stableId, // Stable ID for deduplication
            role: role,
            text: text,
            isFinal: transcriptData.isFinal !== undefined ? transcriptData.isFinal : true, // Default to true if not specified
            timestamp: transcriptData.timestamp || Date.now()
        }));

        // CRITICAL: Store messages in Agent Core for conversation history
        // Only record FINAL transcripts to history to avoid speculative duplicates
        const isFinal = transcriptData.isFinal !== undefined ? transcriptData.isFinal : true;

        if (role === 'user' && isFinal) {
            // Sync user message to history WITHOUT triggering a new generation
            this.agentCore.trackUserMessage(session.sessionId, text);
            console.log(`[VoiceSideCar] Synced FINAL User transcript to history: "${text.substring(0, 30)}..."`);
        } else if (role === 'assistant' && isFinal) {
            // Store final assistant responses in conversation history
            this.agentCore.trackAssistantResponse(session.sessionId, text);
            console.log(`[VoiceSideCar] Synced FINAL Assistant transcript to history: "${text.substring(0, 30)}..."`);
        }
    }

    /**
     * Handle tool use event
     */
    private async handleToolUseEvent(session: VoiceSession, toolData: any): Promise<void> {
        console.log(`[VoiceSideCar] Tool use event: ${toolData.toolName}`);
        console.log(`[VoiceSideCar] Raw tool input type: ${typeof (toolData.input || toolData.content)}`);

        // Parse tool input if it's a JSON string
        let toolInput = toolData.input || toolData.content;

        // Handle JSON string inputs
        if (typeof toolInput === 'string') {
            try {
                toolInput = JSON.parse(toolInput);
                console.log(`[VoiceSideCar] ✅ Parsed tool input from JSON string`);
            } catch (e) {
                console.warn(`[VoiceSideCar] ⚠️  Tool input is a string but not valid JSON, using as-is: ${toolInput}`);
                // If it's not valid JSON, wrap it in an object
                toolInput = { value: toolInput };
            }
        }

        // Ensure toolInput is an object
        if (typeof toolInput !== 'object' || toolInput === null) {
            console.warn(`[VoiceSideCar] ⚠️  Tool input is not an object, wrapping: ${typeof toolInput}`);
            toolInput = { value: toolInput };
        }

        console.log(`[VoiceSideCar] Parsed tool input:`, JSON.stringify(toolInput).substring(0, 200));

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
            await session.sonicClient.sendToolResult(
                toolData.toolUseId,
                result.result,
                !result.success
            );

            // CRITICAL: Refresh system prompt in SonicClient from AgentCore
            // Only if NOT handing off, and only for state-changing tools.
            const agentSession = this.agentCore.getSession(session.sessionId);
            const isHandingOff = !!agentSession?.graphState?.pendingHandoff;
            const isBanking = isBankingTool(toolData.toolName);

            if (!isHandingOff && isBanking) {
                const updatedSystemPrompt = this.agentCore.getSystemPrompt(session.sessionId);
                session.sonicClient.updateSystemPrompt(updatedSystemPrompt);
                console.log(`[VoiceSideCar] 🔄 Refreshed system prompt after state-changing banking tool (${toolData.toolName})`);
            }

            // Forward tool result to client
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

            // CRITICAL: Check for pending handoff from Verified State Gate
            if (agentSession?.graphState?.pendingHandoff) {
                const pendingHandoff = agentSession.graphState.pendingHandoff;
                console.log(`[VoiceSideCar] 🚀 Detected pending handoff from Verified State Gate: ${pendingHandoff.targetAgent}`);

                // SHIELD: Clear locally so we don't trigger twice
                delete agentSession.graphState.pendingHandoff;

                // DELAY: Give the agent 2 seconds to finish speaking the confirmation
                // of successful verification before actually handing off.
                setTimeout(() => {
                    console.log(`[VoiceSideCar] 🚀 Executing delayed automatic handoff to ${pendingHandoff.targetAgent}`);
                    session.ws.send(JSON.stringify({
                        type: 'handoff_request',
                        targetAgentId: pendingHandoff.targetAgent,
                        context: pendingHandoff.context,
                        graphState: agentSession.graphState,
                        timestamp: Date.now()
                    }));
                }, 2000);
            }

            // Check for explicit handoff from tool result
            if (result.success && result.result?.handoffRequest) {
                const handoffRequest = result.result.handoffRequest;
                console.log(`[VoiceSideCar] 🔄 Forwarding explicit handoff request: ${handoffRequest.targetAgentId}`);

                session.ws.send(JSON.stringify({
                    type: 'handoff_request',
                    targetAgentId: handoffRequest.targetAgentId,
                    context: handoffRequest.context,
                    graphState: handoffRequest.graphState,
                    timestamp: Date.now()
                }));
            }
        } catch (error: any) {
            console.error(`[VoiceSideCar] ❌ Tool execution error: ${error.message}`);

            // Send error result to SonicClient
            await session.sonicClient.sendToolResult(
                toolData.toolUseId,
                { error: error.message },
                true
            );

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
    private forwardMetadataToClient(session: VoiceSession, metadata: any): void {
        session.ws.send(JSON.stringify({
            type: 'metadata',
            data: metadata,
            timestamp: Date.now()
        }));
    }

    /**
     * Forward error to client
     */
    private forwardErrorToClient(session: VoiceSession, errorData: any): void {
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
    private forwardInterruptionToClient(session: VoiceSession, interruptionData: any): void {
        session.ws.send(JSON.stringify({
            type: 'interruption',
            data: interruptionData,
            timestamp: Date.now()
        }));
    }

    /**
     * Forward usage event to client
     */
    private forwardUsageEventToClient(session: VoiceSession, usageData: any): void {
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
    private handleWorkflowUpdateEvent(session: VoiceSession, workflowData: any): void {
        // Update workflow state in Agent Core
        if (workflowData.nodeId) {
            try {
                const update = this.agentCore.updateWorkflowState(
                    session.sessionId,
                    workflowData.nodeId
                );

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

            } catch (error: any) {
                console.error(`[VoiceSideCar] Error updating workflow state: ${error.message}`);
            }
        } else {
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
    public getActiveSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Check if session exists
     */
    public hasSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    /**
     * Get a voice session
     * Used for updating session state (e.g., system prompt updates)
     */
    public getSession(sessionId: string): VoiceSession | undefined {
        return this.sessions.get(sessionId);
    }
}
