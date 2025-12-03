/**
 * Amazon Nova 2 Sonic Client - Bidirectional Streaming Implementation
 * 
 * This module handles real-time streaming with Amazon Nova 2 Sonic via AWS Bedrock.
 * It manages bidirectional audio streaming, event processing, and session lifecycle.
 */

import {
    BedrockRuntimeClient,
    InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Configuration for Nova 2 Sonic
 */
export interface SonicConfig {
    region?: string;
    modelId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
}

/**
 * Audio chunk structure for streaming
 */
export interface AudioChunk {
    buffer: Buffer;
    timestamp: number;
}

/**
 * Events emitted by Nova Sonic
 */
export interface SonicEvent {
    type: 'audio' | 'transcript' | 'metadata' | 'error';
    data: any;
}

/**
 * Nova 2 Sonic Client for Bidirectional Streaming
 */
export class SonicClient {
    private client: BedrockRuntimeClient;
    private config: Required<SonicConfig>;
    private sessionId: string | null = null;
    private eventCallback: ((event: SonicEvent) => void) | null = null;
    private inputStream: AsyncGenerator<any> | null = null;
    private outputStream: AsyncIterable<any> | null = null;
    private isProcessing: boolean = false;
    private inputQueue: Buffer[] = [];
    private streamController: any = null;

    constructor(config: SonicConfig = {}) {
        // Load configuration from environment variables with fallbacks
        this.config = {
            region: config.region || process.env.AWS_REGION || 'us-east-1',
            modelId: config.modelId || process.env.NOVA_SONIC_MODEL_ID || 'amazon.nova-2-sonic-v1:0',
            accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '',
        };

        // Initialize AWS Bedrock Runtime client
        this.client = new BedrockRuntimeClient({
            region: this.config.region,
            credentials: this.config.accessKeyId && this.config.secretAccessKey ? {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            } : undefined,
        });

        console.log(`[SonicClient] Initialized with model: ${this.config.modelId} in region: ${this.config.region}`);
    }

    /**
     * Start a bidirectional streaming session with Nova 2 Sonic
     */
    async startSession(onEvent: (event: SonicEvent) => void): Promise<void> {
        if (this.sessionId) {
            throw new Error('Session already active. Call stopSession() first.');
        }

        this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.eventCallback = onEvent;
        this.isProcessing = true;

        console.log(`[SonicClient] Starting session: ${this.sessionId}`);

        try {
            // Create async generator for input stream
            this.inputStream = this.createInputStream();

            // Create the bidirectional stream command
            const command = new InvokeModelWithBidirectionalStreamCommand({
                modelId: this.config.modelId,
                body: this.inputStream,
            });

            // Invoke the streaming API
            const response = await this.client.send(command);
            this.outputStream = response.body || null;

            // Start processing output events
            this.processOutputEvents();

            console.log(`[SonicClient] Session started successfully: ${this.sessionId}`);
        } catch (error) {
            console.error('[SonicClient] Failed to start session:', error);
            this.sessionId = null;
            this.isProcessing = false;
            throw error;
        }
    }

    /**
     * Create async generator for input audio stream
     */
    private async *createInputStream(): AsyncGenerator<any> {
        console.log('[SonicClient] Input stream generator started');

        while (this.isProcessing) {
            // Wait for audio chunks from the queue
            if (this.inputQueue.length > 0) {
                const audioBuffer = this.inputQueue.shift()!;

                // Yield audio event in Nova Sonic format
                yield {
                    audioEvent: {
                        audioChunk: audioBuffer,
                    },
                };
            } else {
                // Wait briefly before checking queue again
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        console.log('[SonicClient] Input stream generator ended');
    }

    /**
     * Send audio chunk to Nova 2 Sonic
     */
    async sendAudioChunk(chunk: AudioChunk): Promise<void> {
        if (!this.sessionId) {
            throw new Error('Session not started. Call startSession() first.');
        }

        if (!this.isProcessing) {
            throw new Error('Session is not active.');
        }

        // Add to input queue for the async generator
        this.inputQueue.push(chunk.buffer);

        console.log(`[SonicClient] Queued audio chunk: ${chunk.buffer.length} bytes (queue size: ${this.inputQueue.length})`);
    }

    /**
     * Process output events from Nova 2 Sonic
     */
    private async processOutputEvents(): Promise<void> {
        if (!this.outputStream) {
            console.error('[SonicClient] No output stream available');
            return;
        }

        console.log('[SonicClient] Starting output event processing');

        try {
            for await (const event of this.outputStream) {
                if (!this.isProcessing) {
                    console.log('[SonicClient] Stopping event processing (session ended)');
                    break;
                }

                // Parse different event types from Nova Sonic
                if (event.chunk?.bytes) {
                    // Decode the event payload
                    const decoder = new TextDecoder();
                    const payload = decoder.decode(event.chunk.bytes);

                    try {
                        const parsedEvent = JSON.parse(payload);

                        // Handle audio events
                        if (parsedEvent.audioEvent) {
                            const audioData = parsedEvent.audioEvent.audioChunk;
                            console.log(`[SonicClient] Received audio event: ${audioData?.length || 0} bytes`);

                            this.eventCallback?.({
                                type: 'audio',
                                data: { audio: audioData },
                            });
                        }

                        // Handle transcript events
                        if (parsedEvent.transcriptEvent) {
                            const transcript = parsedEvent.transcriptEvent.transcript;
                            console.log(`[SonicClient] Received transcript: "${transcript}"`);

                            this.eventCallback?.({
                                type: 'transcript',
                                data: { transcript, role: parsedEvent.transcriptEvent.role || 'assistant' },
                            });
                        }

                        // Handle metadata events
                        if (parsedEvent.metadata) {
                            console.log('[SonicClient] Received metadata event');

                            this.eventCallback?.({
                                type: 'metadata',
                                data: parsedEvent.metadata,
                            });
                        }

                    } catch (parseError) {
                        // If not JSON, might be raw audio
                        console.log(`[SonicClient] Received raw audio chunk: ${event.chunk.bytes.length} bytes`);

                        this.eventCallback?.({
                            type: 'audio',
                            data: { audio: Buffer.from(event.chunk.bytes) },
                        });
                    }
                }
            }

            console.log('[SonicClient] Output event processing completed');
        } catch (error) {
            console.error('[SonicClient] Error processing output events:', error);

            this.eventCallback?.({
                type: 'error',
                data: { message: 'Stream processing error', error },
            });
        }
    }

    /**
     * Stop the Nova Sonic session
     */
    async stopSession(): Promise<void> {
        if (!this.sessionId) {
            return;
        }

        console.log(`[SonicClient] Stopping session: ${this.sessionId}`);

        // Stop processing
        this.isProcessing = false;

        // Clear input queue
        this.inputQueue = [];

        // Give streams time to close gracefully
        await new Promise(resolve => setTimeout(resolve, 100));

        // Reset state
        this.sessionId = null;
        this.eventCallback = null;
        this.inputStream = null;
        this.outputStream = null;

        console.log('[SonicClient] Session stopped');
    }

    /**
     * Check if session is active
     */
    isActive(): boolean {
        return this.sessionId !== null && this.isProcessing;
    }

    /**
     * Get current session ID
     */
    getSessionId(): string | null {
        return this.sessionId;
    }
}
