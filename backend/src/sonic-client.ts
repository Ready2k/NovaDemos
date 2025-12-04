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
    sessionToken?: string;
    bearerToken?: string;
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
    type: 'audio' | 'transcript' | 'metadata' | 'error' | 'interruption' | 'usageEvent';
    data: any;
}

/**
 * Nova 2 Sonic Client for Bidirectional Streaming
 */
export class SonicClient {
    private client: BedrockRuntimeClient;
    private config: Required<SonicConfig> & { bearerToken?: string; sessionToken?: string };
    private sessionId: string | null = null;
    private eventCallback?: (event: SonicEvent) => void;
    private currentPromptName?: string;
    private currentContentName?: string;
    private currentRole: string = 'assistant';
    private recentOutputs: string[] = [];
    private contentStages: Map<string, string> = new Map(); // Track generation stage
    private currentTurnTranscript: string = ''; // Accumulate text for the current turn
    private isTurnComplete: boolean = false; // Track if the previous turn ended
    private inputStream: AsyncGenerator<any> | null = null;
    private outputStream: AsyncIterable<any> | null = null;
    private isProcessing: boolean = false;
    private inputQueue: Buffer[] = [];
    private streamController: any = null;
    private sessionConfig: { systemPrompt?: string; speechPrompt?: string; voiceId?: string } = {};

    constructor(config: SonicConfig = {}) {
        // Load configuration from environment variables with fallbacks
        this.config = {
            region: config.region || process.env.AWS_REGION || 'us-east-1',
            modelId: config.modelId || process.env.NOVA_SONIC_MODEL_ID || 'amazon.nova-2-sonic-v1:0',
            accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '',
            sessionToken: config.sessionToken || process.env.AWS_SESSION_TOKEN || '',
            bearerToken: config.bearerToken || process.env.AWS_BEARER_TOKEN_BEDROCK || '',
        };

        // Initialize AWS Bedrock Runtime client
        const clientConfig: any = {
            region: this.config.region,
        };

        if (this.config.bearerToken) {
            console.log('[SonicClient] Using Bearer Token authentication');
            // The SDK expects a TokenIdentityProvider (function returning Promise<Token>)
            // or a static Token object. We'll provide a static identity object.
            clientConfig.token = { token: this.config.bearerToken };
        } else if (this.config.accessKeyId && this.config.secretAccessKey) {
            console.log('[SonicClient] Using IAM Credentials authentication');
            clientConfig.credentials = {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
                sessionToken: this.config.sessionToken || undefined,
            };
        }

        this.client = new BedrockRuntimeClient(clientConfig);

        console.log(`[SonicClient] Initialized with model: ${this.config.modelId} in region: ${this.config.region}`);
    }

    setConfig(config: { systemPrompt?: string; speechPrompt?: string; voiceId?: string }) {
        this.sessionConfig = { ...this.sessionConfig, ...config };
        console.log('[SonicClient] Configuration updated:', JSON.stringify(this.sessionConfig));
    }

    /**
     * Get current session ID
     */
    public getSessionId(): string | null {
        return this.sessionId;
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
            if (this.outputStream) {
                this.processOutputEvents(this.outputStream);
            }

            console.log(`[SonicClient] Session started successfully: ${this.sessionId}`);
        } catch (error: any) {
            console.error('[SonicClient] Failed to start session:', error);

            // Handle specific AWS errors
            if (error.name === 'AccessDeniedException') {
                console.error('[SonicClient] Access Denied: Check AWS credentials and model access permissions.');
            } else if (error.name === 'ValidationException') {
                console.error('[SonicClient] Validation Error: Check model ID and region.');
            }

            this.sessionId = null;
            this.isProcessing = false;
            // Re-throw to let the caller handle the cleanup/notification
            throw error;
        }
    }

    /**
     * Create async generator for input audio stream
     */
    private async *createInputStream(): AsyncGenerator<any> {
        console.log('[SonicClient] Input stream generator started');
        console.log('[SonicClient] Current Session Config:', JSON.stringify(this.sessionConfig, null, 2));

        const promptName = `prompt-${Date.now()}`;
        const contentName = `audio-${Date.now()}`;
        this.currentPromptName = promptName;
        this.currentContentName = contentName;

        const voiceId = this.sessionConfig.voiceId || "matthew";
        console.log(`[SonicClient] Using Voice ID: ${voiceId}`);

        // 1. Session Start
        const sessionStartEvent = {
            event: {
                sessionStart: {
                    inferenceConfiguration: {
                        maxTokens: 2048,
                        topP: 0.9,
                        temperature: 0.7
                    }
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(sessionStartEvent)) } };

        // 2. Prompt Start
        const promptStartEvent = {
            event: {
                promptStart: {
                    promptName: promptName,
                    textOutputConfiguration: {
                        mediaType: "text/plain"
                    },
                    audioOutputConfiguration: {
                        mediaType: "audio/lpcm",
                        sampleRateHertz: 16000,
                        sampleSizeBits: 16,
                        channelCount: 1,
                        voiceId: this.sessionConfig.voiceId || "matthew",
                        encoding: "base64",
                        audioType: "SPEECH"
                    }
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(promptStartEvent)) } };

        // 3. System Prompt Content Start
        const systemContentName = `system-${Date.now()}`;
        const systemContentStartEvent = {
            event: {
                contentStart: {
                    promptName: promptName,
                    contentName: systemContentName,
                    type: "TEXT",
                    interactive: false,
                    role: "SYSTEM",
                    textInputConfiguration: {
                        mediaType: "text/plain"
                    }
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(systemContentStartEvent)) } };

        // 4. System Prompt Text Input
        const systemPromptText = this.sessionConfig.systemPrompt || "You are a warm, professional, and helpful AI assistant.";
        console.log('[SonicClient] Using System Prompt:', systemPromptText);
        const systemTextInputEvent = {
            event: {
                textInput: {
                    promptName: promptName,
                    contentName: systemContentName,
                    content: systemPromptText
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(systemTextInputEvent)) } };

        // 5. System Prompt Content End
        const systemContentEndEvent = {
            event: {
                contentEnd: {
                    promptName: promptName,
                    contentName: systemContentName
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(systemContentEndEvent)) } };

        // Optional: Speech Prompt (for Hindi code-switching etc)
        if (this.sessionConfig.speechPrompt) {
            const speechPromptName = `speech-prompt-${Date.now()}`;
            const speechContentStartEvent = {
                event: {
                    contentStart: {
                        promptName: promptName,
                        contentName: speechPromptName,
                        type: "TEXT",
                        interactive: false,
                        role: "USER", // Speech prompts are sent as user input but act as instructions
                        textInputConfiguration: {
                            mediaType: "text/plain"
                        }
                    }
                }
            };
            yield { chunk: { bytes: Buffer.from(JSON.stringify(speechContentStartEvent)) } };

            const speechTextInputEvent = {
                event: {
                    textInput: {
                        promptName: promptName,
                        contentName: speechPromptName,
                        content: this.sessionConfig.speechPrompt
                    }
                }
            };
            yield { chunk: { bytes: Buffer.from(JSON.stringify(speechTextInputEvent)) } };

            const speechContentEndEvent = {
                event: {
                    contentEnd: {
                        promptName: promptName,
                        contentName: speechPromptName
                    }
                }
            };
            yield { chunk: { bytes: Buffer.from(JSON.stringify(speechContentEndEvent)) } };
        }

        // 6. User Audio Content Start
        const contentStartEvent = {
            event: {
                contentStart: {
                    promptName: promptName,
                    contentName: contentName,
                    type: "AUDIO",
                    interactive: true,
                    role: "USER",
                    audioInputConfiguration: {
                        mediaType: "audio/lpcm",
                        sampleRateHertz: 16000,
                        sampleSizeBits: 16,
                        channelCount: 1,
                        audioType: "SPEECH",
                        encoding: "base64"
                    }
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(contentStartEvent)) } };

        while (this.isProcessing) {
            // Wait for audio chunks from the queue
            if (this.inputQueue.length > 0) {
                const audioBuffer = this.inputQueue.shift()!;

                // 7. Audio Input
                const audioInputEvent = {
                    event: {
                        audioInput: {
                            promptName: promptName,
                            contentName: contentName,
                            content: audioBuffer.toString('base64')
                        }
                    }
                };

                yield {
                    chunk: {
                        bytes: Buffer.from(JSON.stringify(audioInputEvent))
                    }
                };
                // console.log('[SonicClient] Sent audio chunk');
            } else {
                // Check if we need to stop
                if (!this.isProcessing) break;

                // Wait briefly before checking queue again
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        // We can't easily yield the end events here if the loop breaks due to isProcessing = false
        // because the generator might be closed. 
        // However, the AWS SDK stream might need us to yield them before finishing.
        // Let's try to yield them if we are closing gracefully.

        if (this.currentPromptName && this.currentContentName) {
            // 8. User Audio Content End
            const contentEndEvent = {
                event: {
                    contentEnd: {
                        promptName: this.currentPromptName,
                        contentName: this.currentContentName
                    }
                }
            };
            yield { chunk: { bytes: Buffer.from(JSON.stringify(contentEndEvent)) } };
            console.log('[SonicClient] Sent UserAudioContentEndEvent');

            // 9. Prompt End
            const promptEndEvent = {
                event: {
                    promptEnd: {
                        promptName: this.currentPromptName
                    }
                }
            };
            yield { chunk: { bytes: Buffer.from(JSON.stringify(promptEndEvent)) } };
            console.log('[SonicClient] Sent PromptEndEvent');

            // 10. Session End
            const sessionEndEvent = {
                event: {
                    sessionEnd: {}
                }
            };
            yield { chunk: { bytes: Buffer.from(JSON.stringify(sessionEndEvent)) } };
            console.log('[SonicClient] Sent SessionEndEvent');
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

        // Check for silence (debugging)
        const buffer = chunk.buffer;
        let isSilent = true;
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] !== 0) {
                isSilent = false;
                break;
            }
        }
        if (isSilent) {
            console.warn('[SonicClient] Warning: Received silent audio chunk');
        }

        // Add to input queue for the async generator
        this.inputQueue.push(chunk.buffer);

        // Log every 50 chunks to avoid spam
        if (this.inputQueue.length % 50 === 0) {
            console.log(`[SonicClient] Queue size: ${this.inputQueue.length}`);
        }
    }

    /**
     * Handle output events from Nova Sonic
     */
    private async processOutputEvents(outputStream: AsyncIterable<any>) {
        console.log('[SonicClient] Starting output event processing');
        const currentSessionId = this.sessionId; // Capture session ID for race condition check

        try {
            for await (const event of outputStream) {
                // Loop safety check: Stop if session has changed/stopped
                if (this.sessionId !== currentSessionId) {
                    console.log('[SonicClient] Session changed, stopping old event loop');
                    break;
                }

                // console.log('[SonicClient] Received raw event:', JSON.stringify(event));

                if (event.chunk && event.chunk.bytes) {
                    const rawEvent = JSON.parse(Buffer.from(event.chunk.bytes).toString());
                    console.log('[SonicClient] Received event type:', Object.keys(rawEvent.event || rawEvent)[0]);

                    // Handle different event types
                    const eventData = rawEvent.event || rawEvent;

                    if (eventData.contentStart) {
                        const contentId = eventData.contentStart.contentId;
                        let stage = 'UNKNOWN';
                        if (eventData.contentStart.additionalModelFields) {
                            try {
                                const fields = JSON.parse(eventData.contentStart.additionalModelFields);
                                stage = fields.generationStage || 'UNKNOWN';
                            } catch (e) {
                                // Ignore parse error
                            }
                        }
                        this.contentStages.set(contentId, stage);

                        // Reset transcript if role changes OR previous turn completed
                        if (eventData.contentStart.role !== this.currentRole || this.isTurnComplete) {
                            this.currentTurnTranscript = '';
                            this.isTurnComplete = false;
                        }

                        console.log(`[SonicClient] Content Start: ${eventData.contentStart.type} (${eventData.contentStart.role}) ID: ${contentId} Stage: ${stage}`);
                        this.currentRole = eventData.contentStart.role;
                    }

                    if (eventData.audioOutput) {
                        const content = eventData.audioOutput.content;
                        // console.log(`[SonicClient] Received audio chunk: ${content.length} bytes`);
                        this.eventCallback?.({
                            type: 'audio',
                            data: { audio: Buffer.from(content, 'base64') }
                        });
                    }

                    if (eventData.textOutput) {
                        const content = eventData.textOutput.content;
                        const contentId = eventData.textOutput.contentId;
                        const stage = this.contentStages.get(contentId) || 'UNKNOWN';

                        if (content && content.length > 0) {
                            // Accumulate text for the current turn
                            this.currentTurnTranscript += content;

                            console.log(`[SonicClient] Received text (ID: ${contentId}, Stage: ${stage}): "${content}" -> Turn Total: "${this.currentTurnTranscript.substring(0, 50)}..."`);

                            this.eventCallback?.({
                                type: 'transcript',
                                data: {
                                    transcript: this.currentTurnTranscript, // Send FULL accumulated turn text
                                    role: this.currentRole === 'USER' ? 'user' : 'assistant',
                                    isFinal: stage === 'FINAL'
                                },
                            });
                        }
                    }

                    if (eventData.contentEnd) {
                        console.log(`[SonicClient] Content End: ${eventData.contentEnd.promptName} (${eventData.contentEnd.stopReason})`);

                        // Mark turn as complete if END_TURN or INTERRUPTED
                        if (eventData.contentEnd.stopReason === 'END_TURN' || eventData.contentEnd.stopReason === 'INTERRUPTED') {
                            this.isTurnComplete = true;
                        }

                        if (eventData.contentEnd.stopReason === 'INTERRUPTED') {
                            console.log('[SonicClient] Interruption detected!');
                            this.eventCallback?.({
                                type: 'interruption',
                                data: {}
                            });
                        }
                    }

                    if (eventData.serviceMetrics) {
                        console.log('[SonicClient] Received metrics:', eventData.serviceMetrics);
                    }

                    if (eventData.usageEvent) {
                        console.log('[SonicClient] Usage:', JSON.stringify(eventData.usageEvent));
                        this.eventCallback?.({
                            type: 'usageEvent',
                            data: eventData.usageEvent
                        });
                    }
                } else {
                    console.log('[SonicClient] Received unknown event structure:', event);
                }
            }
        } catch (error) {
            console.error('[SonicClient] Error processing output events:', error);
            this.eventCallback?.({
                type: 'error',
                data: { message: 'Stream processing error', error },
            });
        }
        console.log('[SonicClient] Output event processing ended');
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
        this.isProcessing = false;
        this.sessionId = null;
        this.eventCallback = undefined;
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


}
