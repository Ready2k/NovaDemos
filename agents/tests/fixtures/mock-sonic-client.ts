/**
 * Mock SonicClient for Testing
 * 
 * This mock implementation provides a testable version of SonicClient
 * that tracks method calls and allows event emission for testing.
 * 
 * Validates: Requirement 13.2 - Testing Support
 */

import { SonicEvent, AudioChunk } from '../../src/sonic-client';

/**
 * Mock SonicClient for testing voice interactions
 * Implements the same interface as SonicClient but with tracking capabilities
 */
export class MockSonicClient {
    // State tracking
    public isStarted: boolean = false;
    public isStopped: boolean = false;
    public startSessionCalled: number = 0;
    public stopSessionCalled: number = 0;
    public sendAudioChunkCalled: number = 0;
    public sendTextCalled: number = 0;
    public sendToolResultCalled: number = 0;
    public endAudioInputCalled: number = 0;
    public setConfigCalled: number = 0;

    // Data tracking
    public receivedChunks: Buffer[] = [];
    public receivedTexts: string[] = [];
    public receivedToolResults: Array<{ toolUseId: string; result: any; isError: boolean }> = [];
    public currentConfig: any = {};
    public eventCallback?: (event: SonicEvent) => void;
    public sessionId?: string;

    // Error simulation
    public shouldFailOnStart: boolean = false;
    public shouldFailOnStop: boolean = false;
    public shouldFailOnSendAudio: boolean = false;
    public shouldFailOnSendText: boolean = false;
    public shouldFailOnSendToolResult: boolean = false;
    public startErrorMessage: string = 'Failed to start SonicClient';
    public stopErrorMessage: string = 'Failed to stop SonicClient';

    /**
     * Start a mock session
     * Tracks the event callback and session ID
     */
    async startSession(onEvent: (event: SonicEvent) => void, sessionId: string): Promise<void> {
        this.startSessionCalled++;
        
        if (this.shouldFailOnStart) {
            throw new Error(this.startErrorMessage);
        }
        
        this.isStarted = true;
        this.isStopped = false;
        this.eventCallback = onEvent;
        this.sessionId = sessionId;
    }

    /**
     * Set configuration
     * Tracks config updates
     */
    setConfig(config: any): void {
        this.setConfigCalled++;
        this.currentConfig = { ...this.currentConfig, ...config };
    }

    /**
     * Stop the mock session
     * Cleans up state
     */
    async stopSession(): Promise<void> {
        this.stopSessionCalled++;
        
        if (this.shouldFailOnStop) {
            throw new Error(this.stopErrorMessage);
        }
        
        this.isStarted = false;
        this.isStopped = true;
        this.eventCallback = undefined;
    }

    /**
     * Send audio chunk
     * Tracks received audio data
     */
    async sendAudioChunk(chunk: AudioChunk): Promise<void> {
        this.sendAudioChunkCalled++;
        
        if (!this.isStarted) {
            throw new Error('Cannot send audio chunk: Session not started');
        }
        
        if (this.shouldFailOnSendAudio) {
            throw new Error('Failed to send audio chunk');
        }
        
        this.receivedChunks.push(chunk.buffer);
    }

    /**
     * End audio input
     * Signals end of user speech
     */
    async endAudioInput(): Promise<void> {
        this.endAudioInputCalled++;
        
        if (!this.isStarted) {
            throw new Error('Cannot end audio input: Session not started');
        }
    }

    /**
     * Send text input
     * Tracks received text messages
     */
    async sendText(text: string): Promise<void> {
        this.sendTextCalled++;
        
        if (!this.isStarted) {
            throw new Error('Cannot send text: Session not started');
        }
        
        if (this.shouldFailOnSendText) {
            throw new Error('Failed to send text');
        }
        
        this.receivedTexts.push(text);
    }

    /**
     * Send tool result
     * Tracks tool execution results
     */
    async sendToolResult(toolUseId: string, result: any, isError: boolean): Promise<void> {
        this.sendToolResultCalled++;
        
        if (!this.isStarted) {
            throw new Error('Cannot send tool result: Session not started');
        }
        
        if (this.shouldFailOnSendToolResult) {
            throw new Error('Failed to send tool result');
        }
        
        this.receivedToolResults.push({ toolUseId, result, isError });
    }

    /**
     * Emit a mock event
     * Allows tests to simulate SonicClient events
     */
    emitEvent(event: SonicEvent): void {
        if (this.eventCallback) {
            this.eventCallback(event);
        }
    }

    /**
     * Emit audio event
     * Helper for emitting audio data
     */
    emitAudio(audioBuffer: Buffer): void {
        this.emitEvent({
            type: 'audio',
            data: { buffer: audioBuffer }
        });
    }

    /**
     * Emit transcript event
     * Helper for emitting transcripts
     */
    emitTranscript(role: 'user' | 'assistant', text: string): void {
        this.emitEvent({
            type: 'transcript',
            data: { role, text, content: text }
        });
    }

    /**
     * Emit tool use event
     * Helper for emitting tool calls
     */
    emitToolUse(toolName: string, toolUseId: string, input: any): void {
        this.emitEvent({
            type: 'toolUse',
            data: { toolName, toolUseId, input, content: input }
        });
    }

    /**
     * Emit metadata event
     * Helper for emitting metadata
     */
    emitMetadata(metadata: any): void {
        this.emitEvent({
            type: 'metadata',
            data: metadata
        });
    }

    /**
     * Emit error event
     * Helper for emitting errors
     */
    emitError(message: string, details?: any): void {
        this.emitEvent({
            type: 'error',
            data: { message, details }
        });
    }

    /**
     * Emit interruption event
     * Helper for emitting interruptions
     */
    emitInterruption(data: any): void {
        this.emitEvent({
            type: 'interruption',
            data
        });
    }

    /**
     * Emit usage event
     * Helper for emitting token usage
     */
    emitUsage(inputTokens: number, outputTokens: number, totalTokens: number): void {
        this.emitEvent({
            type: 'usageEvent',
            data: { inputTokens, outputTokens, totalTokens }
        });
    }

    /**
     * Emit workflow update event
     * Helper for emitting workflow state changes
     */
    emitWorkflowUpdate(nodeId: string, data?: any): void {
        this.emitEvent({
            type: 'workflow_update',
            data: { nodeId, ...data }
        });
    }

    /**
     * Check if resources are cleaned up
     * Useful for lifecycle tests
     */
    isCleanedUp(): boolean {
        return this.isStopped && !this.isStarted && this.eventCallback === undefined;
    }

    /**
     * Reset all tracking data
     * Useful for test cleanup
     */
    reset(): void {
        this.isStarted = false;
        this.isStopped = false;
        this.startSessionCalled = 0;
        this.stopSessionCalled = 0;
        this.sendAudioChunkCalled = 0;
        this.sendTextCalled = 0;
        this.sendToolResultCalled = 0;
        this.endAudioInputCalled = 0;
        this.setConfigCalled = 0;
        this.receivedChunks = [];
        this.receivedTexts = [];
        this.receivedToolResults = [];
        this.currentConfig = {};
        this.eventCallback = undefined;
        this.sessionId = undefined;
        this.shouldFailOnStart = false;
        this.shouldFailOnStop = false;
        this.shouldFailOnSendAudio = false;
        this.shouldFailOnSendText = false;
        this.shouldFailOnSendToolResult = false;
    }

    /**
     * Get total audio data received (in bytes)
     */
    getTotalAudioBytes(): number {
        return this.receivedChunks.reduce((total, chunk) => total + chunk.length, 0);
    }

    /**
     * Get last received audio chunk
     */
    getLastAudioChunk(): Buffer | undefined {
        return this.receivedChunks[this.receivedChunks.length - 1];
    }

    /**
     * Get last received text
     */
    getLastText(): string | undefined {
        return this.receivedTexts[this.receivedTexts.length - 1];
    }

    /**
     * Get last tool result
     */
    getLastToolResult(): { toolUseId: string; result: any; isError: boolean } | undefined {
        return this.receivedToolResults[this.receivedToolResults.length - 1];
    }
}
