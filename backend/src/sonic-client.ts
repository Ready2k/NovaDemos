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
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

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
    agentCoreRuntimeArn?: string;
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
    type: 'audio' | 'transcript' | 'metadata' | 'error' | 'interruption' | 'usageEvent' | 'toolUse' | 'contentEnd' | 'interactionTurnEnd' | 'contentStart';
    data: any;
}

/**
 * Nova 2 Sonic Client for Bidirectional Streaming
 */
export class SonicClient {
    private client: BedrockRuntimeClient;
    private id: string;
    public config: Required<SonicConfig> & { bearerToken?: string; sessionToken?: string };
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
    private textQueue: string[] = [];
    private toolResultQueue: any[] = [];
    private streamController: any = null;
    private sessionConfig: { systemPrompt?: string; speechPrompt?: string; voiceId?: string; tools?: any[] } = {};

    // 100ms of silence (16kHz * 0.1s * 2 bytes/sample = 3200 bytes)
    private readonly SILENCE_FRAME = Buffer.alloc(3200, 0);

    constructor(config: SonicConfig = {}) {
        // Load configuration from environment variables with fallbacks
        this.config = {
            region: config.region || process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1',
            modelId: config.modelId || process.env.NOVA_SONIC_MODEL_ID || 'amazon.nova-2-sonic-v1:0',
            accessKeyId: config.accessKeyId || process.env.NOVA_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: config.secretAccessKey || process.env.NOVA_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
            sessionToken: config.sessionToken || process.env.AWS_SESSION_TOKEN || '',
            bearerToken: config.bearerToken || process.env.AWS_BEARER_TOKEN_BEDROCK || '',
            agentCoreRuntimeArn: config.agentCoreRuntimeArn || process.env.AGENT_CORE_RUNTIME_ARN || '',
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

        this.id = Math.random().toString(36).substring(7);
        this.client = new BedrockRuntimeClient(clientConfig);

        console.log(`[SonicClient:${this.id}] Initialized with model: ${this.config.modelId} in region: ${this.config.region}`);
    }

    setConfig(config: { systemPrompt?: string; speechPrompt?: string; voiceId?: string; tools?: any[] }) {
        this.sessionConfig = { ...this.sessionConfig, ...config };
        console.log(`[SonicClient:${this.id}] Configuration updated:`, JSON.stringify(this.sessionConfig));
    }

    private loadDefaultPrompt(): string {
        try {
            const PROMPTS_DIR = path.join(__dirname, '../prompts');
            return fs.readFileSync(path.join(PROMPTS_DIR, 'core-system_default.txt'), 'utf-8').trim();
        } catch (err) {
            console.error(`[SonicClient:${this.id}] Failed to load default prompt:`, err);
            return "You are a warm, professional, and helpful AI assistant.";
        }
    }

    /**
     * Get current session ID
     */
    public getSessionId(): string | null {
        return this.sessionId;
    }

    /**
     * Get current AWS credentials
     */
    getCredentials() {
        if (this.config.accessKeyId && this.config.secretAccessKey) {
            return {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
                sessionToken: this.config.sessionToken
            };
        }
        return undefined; // Let SDK default chain handle it
    }

    /**
     * Start a bidirectional streaming session with Nova 2 Sonic
     */
    async startSession(onEvent: (event: SonicEvent) => void): Promise<void> {
        if (this.sessionId) {
            throw new Error('Session already active. Call stopSession() first.');
        }

        this.sessionId = crypto.randomUUID();
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
        console.log(`[SonicClient:${this.id}] Input stream generator started`);
        console.log(`[SonicClient:${this.id}] Current Session Config:`, JSON.stringify(this.sessionConfig, null, 2));
        console.log(`[SonicClient:${this.id}] DEBUG TOOLS:`, JSON.stringify(this.sessionConfig.tools));

        const promptName = `prompt-${Date.now()}`;
        this.currentPromptName = promptName;
        this.currentContentName = undefined; // Lazily initialized

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
                    },
                    turnDetectionConfiguration: {
                        endpointingSensitivity: "HIGH"  // Controls when Nova detects end of user speech
                    }
                }
            }
        };
        console.log('[SonicClient] Session Start Payload:', JSON.stringify(sessionStartEvent, null, 2));
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
                        sampleRateHertz: 24000,  // Nova 2 Sonic outputs at 24kHz for better quality
                        sampleSizeBits: 16,
                        channelCount: 1,
                        voiceId: this.sessionConfig.voiceId || "matthew",
                        encoding: "base64",
                        audioType: "SPEECH"
                    },
                    ...(this.sessionConfig.tools && this.sessionConfig.tools.length > 0 ? {
                        toolUseOutputConfiguration: {
                            mediaType: "application/json"
                        },
                        toolConfiguration: {
                            tools: this.sessionConfig.tools
                        }
                    } : {})
                }
            }
        };
        console.log('[SonicClient] Prompt Start Payload (with Tools):', JSON.stringify(promptStartEvent, null, 2));
        console.log('[SonicClient] DEBUG TOOLS:', JSON.stringify(this.sessionConfig.tools, null, 2));

        // CRITICAL DEBUG: Check if tools structure is valid
        if (this.sessionConfig.tools && this.sessionConfig.tools.length > 0) {
            console.log('[SonicClient] TOOL VALIDATION:');
            this.sessionConfig.tools.forEach((tool, index) => {
                console.log(`[SonicClient] Tool ${index}:`, JSON.stringify(tool, null, 2));
                if (!tool.toolSpec) {
                    console.error(`[SonicClient] ERROR: Tool ${index} missing toolSpec!`);
                }
                if (!tool.toolSpec?.name) {
                    console.error(`[SonicClient] ERROR: Tool ${index} missing name!`);
                }
                if (!tool.toolSpec?.inputSchema) {
                    console.error(`[SonicClient] ERROR: Tool ${index} missing inputSchema!`);
                }
            });
        }

        // CRITICAL: Validate JSON before sending
        const promptStartJson = JSON.stringify(promptStartEvent);
        try {
            JSON.parse(promptStartJson); // Validate it's valid JSON
            console.log('[SonicClient] JSON validation passed');
        } catch (e) {
            console.error('[SonicClient] INVALID JSON:', e);
            console.error('[SonicClient] JSON STRING:', promptStartJson);
        }

        yield { chunk: { bytes: Buffer.from(promptStartJson) } };


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
        const systemPromptText = this.sessionConfig.systemPrompt || this.loadDefaultPrompt();
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

        // 6. User Audio Content Start - REMOVED (Lazy initialization)
        // We will start the audio content stream only when we actually have audio to send.

        while (this.isProcessing) {
            // Check for tool results first (priority over text/audio)
            if (this.toolResultQueue.length > 0) {
                const resultData = this.toolResultQueue.shift()!;
                console.log('[SonicClient] Processing tool result:', resultData.toolUseId);
                console.log('[SonicClient] Tool result data:', JSON.stringify(resultData.result));

                // OPTIMIZED APPROACH: Send tool result as system message to Nova Sonic
                const resultText = typeof resultData.result === 'string' ? resultData.result : JSON.stringify(resultData.result);
                console.log(`[SonicClient] Tool result text being sent to Nova Sonic:`, resultText);
                console.log(`[SonicClient] Tool result text length:`, resultText.length);
                console.log(`[SonicClient] Tool result text type:`, typeof resultText);

                // 1. End current Audio Content (if open)
                if (this.currentContentName) {
                    const audioEndEvent = {
                        event: {
                            contentEnd: {
                                promptName: promptName,
                                contentName: this.currentContentName
                            }
                        }
                    };
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(audioEndEvent)) } };
                    this.currentContentName = undefined;
                }

                // 2. Send Tool Result as Text Content
                const textContentName = `tool-result-${Date.now()}`;
                const textStartEvent = {
                    event: {
                        contentStart: {
                            promptName: promptName,
                            contentName: textContentName,
                            type: "TEXT",
                            interactive: true,
                            role: "USER",
                            textInputConfiguration: {
                                mediaType: "text/plain"
                            }
                        }
                    }
                };
                yield { chunk: { bytes: Buffer.from(JSON.stringify(textStartEvent)) } };

                const textInputEvent = {
                    event: {
                        textInput: {
                            promptName: promptName,
                            contentName: textContentName,
                            content: `[SYSTEM] Tool execution completed successfully. Result: ${resultText}`
                        }
                    }
                };
                console.log('[SonicClient] Sending tool result as text input:', textInputEvent.event.textInput.content.substring(0, 100) + '...');
                yield { chunk: { bytes: Buffer.from(JSON.stringify(textInputEvent)) } };

                const textEndEvent = {
                    event: {
                        contentEnd: {
                            promptName: promptName,
                            contentName: textContentName
                        }
                    }
                };
                yield { chunk: { bytes: Buffer.from(JSON.stringify(textEndEvent)) } };

                // 3. Send Silent Audio (Required by Nova Sonic)
                if (!this.currentContentName) {
                    const silenceContentName = `audio-silence-${Date.now()}`;

                    // Start Silence Audio
                    const silenceStartEvent = {
                        event: {
                            contentStart: {
                                promptName: promptName,
                                contentName: silenceContentName,
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
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(silenceStartEvent)) } };

                    // Send Silence Data
                    const silenceInputEvent = {
                        event: {
                            audioInput: {
                                promptName: promptName,
                                contentName: silenceContentName,
                                content: this.SILENCE_FRAME.toString('base64')
                            }
                        }
                    };
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(silenceInputEvent)) } };

                    // End Silence Audio
                    const silenceEndEvent = {
                        event: {
                            contentEnd: {
                                promptName: promptName,
                                contentName: silenceContentName
                            }
                        }
                    };
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(silenceEndEvent)) } };
                    console.log('[SonicClient] Sent silent audio frame after tool result');
                }
            }

            // Check for text input first (priority)
            if (this.textQueue.length > 0) {
                const text = this.textQueue.shift()!;
                console.log('[SonicClient] Processing text input:', text);

                // SIMPLE FIX: Just reset transcript state - let Nova Sonic handle conversation naturally
                // The deduplication system in server.ts will filter out any duplicates
                console.log('[SonicClient] User text input received. Resetting transcript state.');
                this.currentTurnTranscript = '';
                this.isTurnComplete = true;

                // 1. End current Audio Content (if open)
                if (this.currentContentName) {
                    const audioEndEvent = {
                        event: {
                            contentEnd: {
                                promptName: promptName,
                                contentName: this.currentContentName
                            }
                        }
                    };
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(audioEndEvent)) } };
                    this.currentContentName = undefined;
                }

                // 2. Send Text Content
                const textContentName = `text-${Date.now()}`;
                const textStartEvent = {
                    event: {
                        contentStart: {
                            promptName: promptName,
                            contentName: textContentName,
                            type: "TEXT",
                            interactive: true,
                            role: "USER",
                            textInputConfiguration: {
                                mediaType: "text/plain"
                            }
                        }
                    }
                };
                yield { chunk: { bytes: Buffer.from(JSON.stringify(textStartEvent)) } };

                const textInputEvent = {
                    event: {
                        textInput: {
                            promptName: promptName,
                            contentName: textContentName,
                            content: text
                        }
                    }
                };
                yield { chunk: { bytes: Buffer.from(JSON.stringify(textInputEvent)) } };

                const textEndEvent = {
                    event: {
                        contentEnd: {
                            promptName: promptName,
                            contentName: textContentName
                        }
                    }
                };
                yield { chunk: { bytes: Buffer.from(JSON.stringify(textEndEvent)) } };

                // 3. Send Silent Audio (Required by Nova Sonic if no other audio is present)
                if (!this.currentContentName) {
                    const silenceContentName = `audio-silence-${Date.now()}`;

                    // Start Silence Audio
                    const silenceStartEvent = {
                        event: {
                            contentStart: {
                                promptName: promptName,
                                contentName: silenceContentName,
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
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(silenceStartEvent)) } };

                    // Send Silence Data
                    const silenceInputEvent = {
                        event: {
                            audioInput: {
                                promptName: promptName,
                                contentName: silenceContentName,
                                content: this.SILENCE_FRAME.toString('base64')
                            }
                        }
                    };
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(silenceInputEvent)) } };

                    // End Silence Audio
                    const silenceEndEvent = {
                        event: {
                            contentEnd: {
                                promptName: promptName,
                                contentName: silenceContentName
                            }
                        }
                    };
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(silenceEndEvent)) } };
                    console.log('[SonicClient] Sent silent audio frame to satisfy protocol');
                }
            }

            // Wait for audio chunks from the queue
            if (this.inputQueue.length > 0) {
                const audioBuffer = this.inputQueue.shift()!;

                // Start Audio Content if not open
                if (!this.currentContentName) {
                    const newContentName = `audio-${Date.now()}`;
                    this.currentContentName = newContentName;

                    const audioStartEvent = {
                        event: {
                            contentStart: {
                                promptName: promptName,
                                contentName: newContentName,
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
                    yield { chunk: { bytes: Buffer.from(JSON.stringify(audioStartEvent)) } };
                    console.log('[SonicClient] Started audio content:', newContentName);
                }

                // 7. Audio Input
                const audioInputEvent = {
                    event: {
                        audioInput: {
                            promptName: promptName,
                            contentName: this.currentContentName,
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

        if (this.currentPromptName) {
            // 8. User Audio Content End (if open)
            if (this.currentContentName) {
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
            }

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
     * Update AWS Credentials for this session
     */
    updateCredentials(accessKeyId: string, secretAccessKey: string, region: string, agentCoreRuntimeArn?: string) {
        console.log('[SonicClient] Updating AWS credentials for session');

        const clientConfig: any = {
            region: region,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey
            }
        };

        this.client = new BedrockRuntimeClient(clientConfig);
        this.config.region = region;

        // Store Agent Core Runtime ARN if provided
        if (agentCoreRuntimeArn) {
            this.config.agentCoreRuntimeArn = agentCoreRuntimeArn;
            console.log(`[SonicClient] Updated Agent Core Runtime ARN: ${agentCoreRuntimeArn}`);
        }

        console.log(`[SonicClient] Re-initialized client with new credentials in region: ${region}`);
    }

    /**
     * Update Session Configuration
     */
    updateSessionConfig(config: any) {
        this.sessionConfig = { ...this.sessionConfig, ...config };
        console.log(`[SonicClient:${this.id}] Updated session config:`, this.sessionConfig);
        console.log(`[SonicClient:${this.id}] Tools in updated config:`, JSON.stringify(this.sessionConfig.tools, null, 2));
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
     * Send tool result to Nova 2 Sonic
     */
    async sendToolResult(toolUseId: string, result: any, isError: boolean = false): Promise<void> {
        if (!this.sessionId || !this.isProcessing) {
            throw new Error('Session not active.');
        }
        this.toolResultQueue.push({ toolUseId, result, isError });
    }

    /**
     * Send text input to Nova 2 Sonic
     */
    async sendText(text: string): Promise<void> {
        if (!this.sessionId || !this.isProcessing) {
            throw new Error('Session not active.');
        }

        // --- DEBOUNCE: Prevent duplicate text sending (except for filler messages) --
        const fillerPhrases = ["Let me check that for you", "I'm still working on that", "Just a moment more"];
        const isFiller = fillerPhrases.some(phrase => text.includes(phrase));

        if (!isFiller) {
            // HALLUCINATION BLOCKER: Check for model self-interruption JSON
            if (text.includes('"interrupted"') && text.includes('true')) {
                console.warn(`[SonicClient] Ignoring hallucinated interruption signal: "${text}"`);
                return;
            }

            const now = Date.now();
            const lastSent = (this as any)._lastSentText || { text: '', time: 0 };
            if (lastSent.text === text && (now - lastSent.time) < 2000) {
                console.warn(`[SonicClient] Ignoring duplicate text input: "${text}"`);
                return;
            }
            (this as any)._lastSentText = { text, time: now };
        } else {
            console.log(`[SonicClient] Allowing filler message to bypass duplicate detection: "${text}"`);
        }
        // ------------------------------------------------

        // CRITICAL: Reset transcript when user sends new text
        // This ensures the next assistant response starts fresh
        console.log(`[SonicClient] User text input received. Resetting transcript for new response.`);
        this.currentTurnTranscript = '';
        this.isTurnComplete = true; // Mark previous turn as complete

        this.textQueue.push(text);
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
                    const eventType = Object.keys(rawEvent.event || rawEvent)[0];
                    console.log('[SonicClient] Received event type:', eventType);

                    // Special logging for tool-related events
                    if (eventType === 'toolUse' || eventType.includes('tool')) {
                        console.log('[SonicClient] 🔧 TOOL EVENT DETECTED:', JSON.stringify(rawEvent, null, 2));
                    }

                    // Handle different event types
                    const eventData = rawEvent.event || rawEvent;

                    if (eventData.toolUse) {
                        const tu = eventData.toolUse;
                        console.log(`[SonicClient] 🔧 NATIVE TOOL USE DETECTED: ${tu.name} (ID: ${tu.toolUseId})`);
                        console.log(`[SonicClient] Tool Use Data:`, JSON.stringify(tu, null, 2));
                        this.eventCallback?.({
                            type: 'toolUse',
                            data: tu
                        });
                    }

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

                        // Normalize role for comparison (Nova sends uppercase, we use lowercase internally)
                        const normalizedRole = eventData.contentStart.role.toLowerCase();
                        const currentRoleNormalized = this.currentRole.toLowerCase();

                        // Reset transcript if:
                        // 1. Role changes (USER -> ASSISTANT or vice versa)
                        // 2. Previous turn completed (isTurnComplete flag) AND it's a TEXT content start
                        // 3. FIXED: Only reset on actual role changes or completed turns, not every content chunk
                        const roleChanged = normalizedRole !== currentRoleNormalized;
                        // FIXED: Reset on role change OR if previous turn ended OR if we detect a new TEXT block from Assistant that implies a new response structure
                        const shouldReset = roleChanged || (this.isTurnComplete && eventData.contentStart.type === 'TEXT');

                        // Debugging the "I apologize" ghost text
                        if (this.currentTurnTranscript.length > 0 && shouldReset) {
                            console.log(`[SonicClient] Resetting transcript. Prev content (chars: ${this.currentTurnTranscript.length}): "${this.currentTurnTranscript.substring(0, 50)}..."`);
                        }

                        if (shouldReset) {
                            console.log(`[SonicClient] Resetting transcript. Reason: ${roleChanged ? 'Role changed' : 'New turn starting'}. Old role: ${this.currentRole}, New role: ${eventData.contentStart.role}, Type: ${eventData.contentStart.type}`);



                            this.currentTurnTranscript = '';
                            this.isTurnComplete = false;
                        } else if (eventData.contentStart.type === 'TEXT' && normalizedRole === 'assistant') {
                            // If we are NOT resetting, but getting new text, log why
                            console.log(`[SonicClient] EXPLICITLY NOT RESETTING transcript. Appending new TEXT block to existing turn.`);
                        }

                        console.log(`[SonicClient] Content Start: ${eventData.contentStart.type} (${eventData.contentStart.role}) ID: ${contentId} Stage: ${stage}`);
                        this.currentRole = eventData.contentStart.role;

                        this.eventCallback?.({
                            type: 'contentStart',
                            data: {
                                role: this.currentRole === 'USER' ? 'user' : 'assistant',
                                contentId: contentId
                            }
                        });
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

                            // Send transcript event for streaming AND debug purposes
                            // For SPECULATIVE stage, send as streaming (non-final)
                            // This allows real-time text updates in the UI
                            this.eventCallback?.({
                                type: 'transcript',
                                data: {
                                    transcript: this.currentTurnTranscript, // Send FULL accumulated turn text
                                    role: this.currentRole === 'USER' ? 'user' : 'assistant',
                                    isFinal: false,  // Always false here - final comes from END_TURN
                                    isStreaming: true  // Flag for UI to show as streaming
                                },
                            });
                        }
                    }

                    if (eventData.contentEnd) {
                        console.log(`[SonicClient] Content End: ${eventData.contentEnd.promptName} (${eventData.contentEnd.stopReason})`);

                        // Pass event to callback
                        this.eventCallback?.({
                            type: 'contentEnd',
                            data: eventData.contentEnd
                        });

                        // Send final transcript when turn ends
                        if (eventData.contentEnd.stopReason === 'END_TURN' && this.currentTurnTranscript.length > 0) {
                            this.eventCallback?.({
                                type: 'transcript',
                                data: {
                                    transcript: this.currentTurnTranscript,
                                    role: this.currentRole === 'USER' ? 'user' : 'assistant',
                                    isFinal: true,
                                    isStreaming: false
                                },
                            });
                        }

                        // If interrupted, mark the current transcript as cancelled
                        if (eventData.contentEnd.stopReason === 'INTERRUPTED' && this.currentTurnTranscript.length > 0) {
                            this.eventCallback?.({
                                type: 'transcript',
                                data: {
                                    transcript: this.currentTurnTranscript,
                                    role: this.currentRole === 'USER' ? 'user' : 'assistant',
                                    isFinal: false,
                                    isStreaming: false,
                                    isCancelled: true
                                },
                            });
                        }

                        // Mark turn as complete if END_TURN or INTERRUPTED
                        if (eventData.contentEnd.stopReason === 'END_TURN' || eventData.contentEnd.stopReason === 'INTERRUPTED') {
                            this.isTurnComplete = true;
                            // Also reset the transcript immediately for the next turn
                            // This prevents accumulation across multiple assistant responses
                            console.log(`[SonicClient] Turn ended (${eventData.contentEnd.stopReason}). Resetting transcript for next turn.`);
                            this.currentTurnTranscript = '';
                        }

                        if (eventData.contentEnd.stopReason === 'INTERRUPTED') {
                            console.log('[SonicClient] Interruption detected!');
                            this.eventCallback?.({
                                type: 'interruption',
                                data: {}
                            });
                        }
                    }

                    if (eventData.interactionTurnEnd) {
                        console.log('[SonicClient] Interaction Turn End');
                        this.eventCallback?.({
                            type: 'interactionTurnEnd',
                            data: eventData.interactionTurnEnd
                        });
                    }

                    if (eventData.serviceMetrics) {
                        console.log('[SonicClient] Received metrics:', eventData.serviceMetrics);
                        this.eventCallback?.({
                            type: 'metadata', // Reuse metadata type or create new one
                            data: { metrics: eventData.serviceMetrics }
                        });
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
