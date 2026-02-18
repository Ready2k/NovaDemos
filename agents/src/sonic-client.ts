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
import { Langfuse, LangfuseTraceClient, LangfuseGenerationClient } from 'langfuse';

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
    type: 'audio' | 'transcript' | 'metadata' | 'error' | 'interruption' | 'usageEvent' | 'toolUse' | 'contentEnd' | 'interactionTurnEnd' | 'contentStart' | 'workflow_update' | 'session_start';
    data?: any;
    [key: string]: any;
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
    private contentStages: Map<string, string> = new Map(); // Track generation stage by ID
    private contentNameStages: Map<string, string> = new Map(); // Track generation stage by Name
    private activeContentNames: Set<string> = new Set(); // Track active content blocks from the model
    private pendingSystemPromptUpdate: string | null = null; // Store pending system prompt update for injection
    private currentTurnTranscript: string = ''; // Accumulate text for the current turn
    private currentTurnId: string | null = null; // Stable ID for the current assistant turn
    private isTurnComplete: boolean = false; // Track if the previous turn ended
    private lastUserTranscript: string = ''; // Track last user input for context
    private isInterrupted: boolean = false; // Track if the current turn has been interrupted locally
    private suppressedContentName: string | null = null; // Track name of content being suppressed (e.g. speculative audio)

    // Auto-Nudge State
    private hasCommittedToTool: boolean = false;
    private hasCalledTool: boolean = false;

    // Deduplication: Nova Sonic emits speculative + final toolUse events for the same tool.
    // IMPORTANT: Nova Sonic requires a result for EVERY toolUse it emits, even speculative ones.
    // Strategy: execute only the first toolUse per tool name, but when the result arrives,
    // also send it back for any pending duplicate toolUseIds.
    private dispatchedToolUseIds: Set<string> = new Set();
    private dispatchedToolNames: Set<string> = new Set(); // Track by name within a turn
    private pendingDuplicateToolUseIds: Map<string, string[]> = new Map(); // toolName -> [duplicate toolUseIds]

    // Langfuse Tracing
    private langfuse: Langfuse;
    private trace: LangfuseTraceClient | null = null;
    private currentGeneration: LangfuseGenerationClient | null = null;
    private inputStream: AsyncGenerator<any> | null = null;
    private outputStream: AsyncIterable<any> | null = null;

    // Usage & Cost Tracking
    private sessionTotalTokens: number = 0;
    private sessionInputTokens: number = 0;
    private sessionOutputTokens: number = 0;

    // Latency Tracking
    private currentGenerationStartTime: Date | null = null;
    private firstTokenTime: Date | null = null;
    private isProcessing: boolean = false;
    private inputQueue: Buffer[] = [];
    private textQueue: string[] = [];
    private toolResultQueue: any[] = [];
    private systemPromptQueue: string[] = [];
    // private streamController: any = null;
    private sessionConfig: { systemPrompt?: string; speechPrompt?: string; voiceId?: string; tools?: any[] } = {};

    // Lifecycle Synchronization
    private inputStreamFinished: Promise<void> | null = null;
    private resolveInputStreamFinished: (() => void) | null = null;

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

        // Initialize Langfuse
        this.langfuse = new Langfuse({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            secretKey: process.env.LANGFUSE_SECRET_KEY,
            baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com'
        });

        console.log(`[SonicClient:${this.id}] Initialized with model: ${this.config.modelId} in region: ${this.config.region}`);
    }

    setConfig(config: { systemPrompt?: string; speechPrompt?: string; voiceId?: string; tools?: any[] }) {
        this.sessionConfig = { ...this.sessionConfig, ...config };
        console.log(`[SonicClient:${this.id}] Configuration updated:`, JSON.stringify(this.sessionConfig));
    }

    /**
     * Update system prompt for an active session
     * This sends a configuration update to the active Sonic session
     */
    updateSystemPrompt(systemPrompt: string): void {
        if (!this.sessionId) {
            console.warn(`[SonicClient:${this.id}] Cannot update system prompt: No active session (sessionId=${this.sessionId})`);
            return;
        }

        // Update config
        this.sessionConfig.systemPrompt = systemPrompt;

        // Queue for live stream update
        this.systemPromptQueue.push(systemPrompt);

        // Send configuration update to active session
        // Nova Sonic will use the new system prompt for subsequent turns
        console.log(`[SonicClient:${this.id}] 🔄 System prompt update queued for active session (length: ${systemPrompt.length} chars)`);
        console.log(`[SonicClient:${this.id}] Updated prompt preview: ${systemPrompt.substring(0, 200)}...`);

        // Note: The updated prompt will be used on the next interaction
        // Nova Sonic accepts system text blocks throughout the session
    }

    private loadDefaultPrompt(): string {
        try {
            // Determine if running in Docker or locally
            const isDocker = fs.existsSync('/app');
            const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
            const PROMPTS_DIR = path.join(BASE_DIR, 'backend/prompts');

            return fs.readFileSync(path.join(PROMPTS_DIR, 'core-system_default.txt'), 'utf-8').trim();
        } catch (err) {
            console.error(`[SonicClient:${this.id}] Failed to load default prompt:`, err);
            return "You are a warm, professional, and helpful AI assistant.";
        }
    }

    private loadDialectDetectionPrompt(): string {
        try {
            // Determine if running in Docker or locally
            const isDocker = fs.existsSync('/app');
            const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
            const PROMPTS_DIR = path.join(BASE_DIR, 'backend/prompts');

            const dialectPrompt = fs.readFileSync(path.join(PROMPTS_DIR, 'hidden-dialect_detection.txt'), 'utf-8').trim();
            console.log(`[SonicClient:${this.id}] Loaded dialect detection prompt from ${PROMPTS_DIR}`);
            return dialectPrompt;
        } catch (err) {
            console.warn(`[SonicClient:${this.id}] Failed to load dialect detection prompt:`, err);
            return ""; // Return empty string if not found
        }
    }

    /**
     * Get current session ID
     */
    public getSessionId(): string | null {
        return this.sessionId;
    }

    /**
     * Get current Session Config
     */
    public getSessionConfig() {
        return this.sessionConfig;
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
    async startSession(onEvent: (event: SonicEvent) => void, externalSessionId?: string): Promise<void> {
        // Validation: Check for credentials
        if ((!this.config.accessKeyId || !this.config.secretAccessKey) && !this.config.bearerToken) {
            console.warn('[SonicClient] Start session aborted: Missing AWS Credentials.');
            throw new Error('AWS Credentials not configured. Please configure them in the Settings UI.');
        }

        if (this.sessionId) {
            throw new Error('Session already active. Call stopSession() first.');
        }

        this.sessionId = externalSessionId || crypto.randomUUID();
        this.eventCallback = onEvent;
        this.isProcessing = true;

        console.log(`[SonicClient] Starting session: ${this.sessionId}`);

        // Start Langfuse Trace
        try {
            this.trace = this.langfuse.trace({
                id: this.sessionId,
                name: "voice-session",
                sessionId: this.sessionId,
                metadata: {
                    modelId: this.config.modelId,
                    region: this.config.region,
                    environment: process.env.NODE_ENV || 'development'
                },
                input: {
                    type: "session-start",
                    config: this.sessionConfig, // Include system prompt, tools, etc.
                    timestamp: new Date()
                },
                tags: ["voice", "nova-sonic"]
            });
            console.log(`[SonicClient] ✓ Langfuse trace created for session: ${this.sessionId}`);

            // Notify client of Trace ID for feedback
            if (this.eventCallback) {
                console.log(`[SonicClient] Sending TraceID event: ${this.sessionId}`);
                this.eventCallback({
                    type: 'metadata',
                    data: { traceId: this.sessionId }
                });

                // Emit explicit session_start for frontend-v2
                this.eventCallback({
                    type: 'session_start',
                    data: { sessionId: this.sessionId }
                });
            } else {
                console.warn('[SonicClient] No eventCallback set, cannot send TraceID');
            }

        } catch (e) {
            console.error("[SonicClient] Failed to start Langfuse trace:", e);
        }

        try {
            // Initialize lifecycle promise
            this.inputStreamFinished = new Promise<void>((resolve) => {
                this.resolveInputStreamFinished = resolve;
            });

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
    private async * createInputStream(): AsyncGenerator<any> {
        console.log(`[SonicClient:${this.id}] Input stream generator started`);
        console.log(`[SonicClient:${this.id}] Current Session Config:`, JSON.stringify(this.sessionConfig, null, 2));
        console.log(`[SonicClient:${this.id}] DEBUG TOOLS:`, JSON.stringify(this.sessionConfig.tools));

        const promptName = `prompt-${Date.now()}`;
        this.currentPromptName = promptName;
        this.currentContentName = undefined; // Lazily initialized

        const voiceId = this.sessionConfig.voiceId || "matthew";
        console.log(`[SonicClient] FINAL VOICE ID: ${voiceId}`);

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
                        // LOW sensitivity = longer wait before ending turn (better for slow/deliberate speech)
                        // HIGH sensitivity = shorter wait (better for fast natural speech)
                        // For banking credentials, use LOW to avoid cutting off digit sequences
                        endpointingSensitivity: "LOW"
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
                            tools: this.sessionConfig.tools,
                            ...(this.config.agentCoreRuntimeArn ? {
                                agentCoreRuntimeArn: this.config.agentCoreRuntimeArn
                            } : {})
                        }
                    } : {})
                }
            }
        };
        console.log('[SonicClient] Prompt Start Payload (with Tools):', JSON.stringify(promptStartEvent, null, 2));
        console.log('[SonicClient] DEBUG TOOLS:', JSON.stringify(this.sessionConfig.tools, null, 2));
        console.log('[SonicClient] AgentCore ARN:', this.config.agentCoreRuntimeArn || 'NOT SET');

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
        const baseSystemPrompt = this.sessionConfig.systemPrompt || this.loadDefaultPrompt();
        const dialectDetectionPrompt = this.loadDialectDetectionPrompt();

        // Inject dialect detection instructions (hidden from user)
        const systemPromptText = dialectDetectionPrompt
            ? `${baseSystemPrompt}\n\n${dialectDetectionPrompt}`
            : baseSystemPrompt;

        console.log('[SonicClient] Using System Prompt with dialect detection:', systemPromptText.substring(0, 100) + '...');
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

        // 6. User Audio Content Start - RESTORED (Eager initialization)
        // Nova Sonic seems to REQUIRE an audio content block to be open immediately
        const audioContentName = `audio-${Date.now()}`;
        this.currentContentName = audioContentName;

        const audioStartEvent = {
            event: {
                contentStart: {
                    promptName: promptName,
                    contentName: audioContentName,
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
        console.log('[SonicClient] Started audio content (Eager):', audioContentName);

        // CRITICAL FIX: Prime the audio stream with silence to avoid "no content data received" error
        const initialSilenceEvent = {
            event: {
                audioInput: {
                    promptName: promptName,
                    contentName: audioContentName,
                    content: this.SILENCE_FRAME.toString('base64')
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(initialSilenceEvent)) } };
        console.log('[SonicClient] Primed audio content with silence');

        while (this.isProcessing) {
            // Check for system prompt updates - drain the queue but DON'T send them as turns yet
            // They will be prepended to the next USER turn (text input or tool result)
            if (this.systemPromptQueue.length > 0) {
                this.pendingSystemPromptUpdate = this.systemPromptQueue.shift()!;
                console.log(`[SonicClient] Captured pending system prompt update (${this.pendingSystemPromptUpdate.length} chars)`);
            }

            // Check for tool results first (priority over text/audio)
            if (this.toolResultQueue.length > 0) {
                // CRITICAL FIX: Group all pending results to avoid rapid content switching
                // sequences (Audio -> Text -> Audio -> Text -> Audio) which crashes Nova Sonic.
                const resultsToProcess = [...this.toolResultQueue];
                this.toolResultQueue = [];

                console.log(`[SonicClient] Processing ${resultsToProcess.length} tool results in a single batch`);

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
                    // Small delay to ensure state transition
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                // 2. Start SINGLE Text Content for the batch
                const textContentName = `tool-results-${Date.now()}`;
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

                // 3. Build combined content for all results
                let combinedInjectedContent = "[SYSTEM] Tool results received:\n\n";

                // INTEGRATED FIX: Prepend any pending system prompt update to the tool results
                // This ensures the model sees the updated context (like IDV status) 
                // at the EXACT same time it sees the tool results.
                if (this.pendingSystemPromptUpdate) {
                    combinedInjectedContent = `[SYSTEM_UPDATE]\nYour current instructions and context have been updated:\n\n${this.pendingSystemPromptUpdate}\n\n[SYSTEM] Tool results received:\n\n`;
                    console.log(`[SonicClient] Prepending pending system prompt update to tool result batch`);
                    this.pendingSystemPromptUpdate = null;
                }

                for (const resultData of resultsToProcess) {
                    // Unwrap AgentCore result format if present
                    let unwrappedResult = resultData.result;
                    if (unwrappedResult?.content && Array.isArray(unwrappedResult.content) && unwrappedResult.content[0]?.text) {
                        try {
                            // Try to parse the inner JSON text
                            unwrappedResult = JSON.parse(unwrappedResult.content[0].text);
                        } catch (e) {
                            unwrappedResult = unwrappedResult.content[0].text;
                        }
                    }

                    const resultString = typeof unwrappedResult === 'string'
                        ? unwrappedResult
                        : JSON.stringify(unwrappedResult);

                    combinedInjectedContent += `Tool ID: ${resultData.toolUseId}\nResult: ${resultString}\n\n`;
                }

                combinedInjectedContent += "[INSTRUCTION] The above tools have finished execution. User has NOT spoken yet. Proceed with the workflow based on ONLY these results immediately.";

                const textInputEvent = {
                    event: {
                        textInput: {
                            promptName: promptName,
                            contentName: textContentName,
                            content: combinedInjectedContent
                        }
                    }
                };

                console.log('[SonicClient] Sending batch tool results as TEXT input');
                yield { chunk: { bytes: Buffer.from(JSON.stringify(textInputEvent)) } };

                // 4. End Text Content
                const textEnd = {
                    event: {
                        contentEnd: {
                            promptName: promptName,
                            contentName: textContentName
                        }
                    }
                };
                yield { chunk: { bytes: Buffer.from(JSON.stringify(textEnd)) } };
                console.log('[SonicClient] Batch tool result sequence completed');

                // 5. Re-establish Audio Content (Eager)
                const silenceContentName = `audio-silence-tool-${Date.now()}`;
                this.currentContentName = silenceContentName;

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
                console.log('[SonicClient] Primed silence after batch tool result:', silenceContentName);
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

                // Clear tool deduplication for real user turns only.
                // System injections (Auto-Nudge) must not clear this — they fire mid-turn.
                const isSystemInjectionText = text.includes('[SYSTEM_INJECTION]');
                if (!isSystemInjectionText) {
                    this.dispatchedToolUseIds.clear();
                    this.pendingDuplicateToolUseIds.clear();
                    this.dispatchedToolNames.clear();
                }

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

                let contentToSubmit = text;

                // INTEGRATED FIX: Prepend any pending system prompt update to the text input
                if (this.pendingSystemPromptUpdate) {
                    contentToSubmit = `[SYSTEM_UPDATE]\nYour instructions have been updated:\n\n${this.pendingSystemPromptUpdate}\n\n[USER INPUT]:\n${text}`;
                    console.log(`[SonicClient] Prepending pending system prompt update to user text input`);
                    this.pendingSystemPromptUpdate = null;
                }

                const textInputEvent = {
                    event: {
                        textInput: {
                            promptName: promptName,
                            contentName: textContentName,
                            content: contentToSubmit
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

                // Check for end-of-audio signal (null)
                if (audioBuffer === null) {
                    console.log('[SonicClient] Received end-of-audio signal');

                    // End the current audio content if open
                    if (this.currentContentName) {
                        const contentEndEvent = {
                            event: {
                                contentEnd: {
                                    promptName: promptName,
                                    contentName: this.currentContentName
                                }
                            }
                        };
                        yield { chunk: { bytes: Buffer.from(JSON.stringify(contentEndEvent)) } };
                        console.log('[SonicClient] Sent UserAudioContentEndEvent');
                        this.currentContentName = undefined;
                    }

                    // Continue processing (don't break) - wait for Nova's response
                    await new Promise(resolve => setTimeout(resolve, 50));
                    continue;
                }

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
                await new Promise(resolve => setTimeout(resolve, 50)); // Buffer safety
            }

            // 9. PromptEnd
            const promptEndEvent = {
                event: {
                    promptEnd: {
                        promptName: this.currentPromptName
                    }
                }
            };
            yield { chunk: { bytes: Buffer.from(JSON.stringify(promptEndEvent)) } };
            console.log('[SonicClient] Sent PromptEndEvent');
            await new Promise(resolve => setTimeout(resolve, 50)); // Buffer safety

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

        // Signal completion
        if (this.resolveInputStreamFinished) {
            this.resolveInputStreamFinished();
        }
    }

    /**
     * Update AWS Credentials for this session
     */
    updateCredentials(accessKeyId: string, secretAccessKey: string, region: string, agentCoreRuntimeArn?: string, modelId?: string) {
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
        this.config.accessKeyId = accessKeyId;
        this.config.secretAccessKey = secretAccessKey;

        // Store Agent Core Runtime ARN if provided
        if (agentCoreRuntimeArn) {
            this.config.agentCoreRuntimeArn = agentCoreRuntimeArn;
            console.log(`[SonicClient] Updated Agent Core Runtime ARN: ${agentCoreRuntimeArn}`);
        }

        // Store Model ID if provided
        if (modelId) {
            this.config.modelId = modelId;
            console.log(`[SonicClient] Updated Nova Sonic Model ID: ${modelId}`);
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

        // Add to input queue for the async generator
        this.inputQueue.push(chunk.buffer);

        // IMMEDIATE INTERRUPTION LOGIC
        // If the user speaks while the assistant is speaking, we want to cut off playback immediately.
        // We use a simple energy-based VAD here because we can't wait for the cloud VAD.

        // Only check for interruption if:
        // 1. Assistant is currently the active role
        // 2. We haven't already triggered an interruption for this turn
        // 3. There is active content (assistant is actually generating/speaking)
        if (this.currentRole === 'ASSISTANT' && !this.isInterrupted && this.activeContentNames.size > 0) {
            const buffer = chunk.buffer;
            let hasSpeech = false;
            const THRESHOLD = 500; // Sensitivity threshold for 16-bit audio

            // Check for speech energy
            for (let i = 0; i < buffer.length; i += 2) {
                if (i + 1 < buffer.length) {
                    const sample = buffer.readInt16LE(i);
                    if (Math.abs(sample) > THRESHOLD) {
                        hasSpeech = true;
                        break;
                    }
                }
            }

            if (hasSpeech) {
                console.log('[SonicClient] 🛑 Local VAD detected user speech during Assistant turn. Triggering IMMEDIATE interruption.');

                this.isInterrupted = true;

                // Emit interruption event immediately to stop client playback
                this.eventCallback?.({
                    type: 'interruption',
                    data: { reason: 'local_vad' }
                });


                // Optional: Clear active content locally since we are interrupting
                // this.activeContentNames.clear(); 
                // (Decided not to clear locally yet, let the model catch up, but we stop forwarding audio)
            }
        }

        // Log every 50 chunks to avoid spam
        if (this.inputQueue.length % 50 === 0) {
            console.log(`[SonicClient] Queue size: ${this.inputQueue.length}`);
        }
    }

    /**
     * End audio input stream (user finished speaking)
     * This signals Nova Sonic to process and respond, but keeps the session open
     */
    async endAudioInput(): Promise<void> {
        if (!this.sessionId) {
            console.warn('[SonicClient] Cannot end audio input: No active session');
            return;
        }

        console.log('[SonicClient] Ending audio input stream (user finished speaking)');

        // Signal end of input by pushing null to the queue
        // The input stream generator will handle sending the proper end events
        this.inputQueue.push(null as any);
    }

    /**
     * Send tool result to Nova 2 Sonic
     */
    async sendToolResult(toolUseId: string, result: any, isError: boolean = false): Promise<void> {
        if (!this.sessionId || !this.isProcessing) {
            console.warn(`[SonicClient] ⚠️ Cannot send tool result: Session not active or processing stopped. (ID: ${this.sessionId})`);
            return;
        }
        // Queue the primary result
        this.toolResultQueue.push({ toolUseId, result, isError });

        // CRITICAL: Nova Sonic requires a result for every toolUse it emits, including
        // speculative duplicates. Find the tool name for this toolUseId and replay the
        // result for any pending duplicate IDs.
        for (const [toolName, dupeIds] of this.pendingDuplicateToolUseIds.entries()) {
            if (dupeIds.length > 0 && this.dispatchedToolUseIds.has(toolUseId)) {
                // This result is for a tool we tracked duplicates for
                for (const dupeId of dupeIds) {
                    console.log(`[SonicClient] 🔁 Replaying result for duplicate toolUseId: ${dupeId} (tool: ${toolName})`);
                    this.toolResultQueue.push({ toolUseId: dupeId, result, isError });
                }
                this.pendingDuplicateToolUseIds.delete(toolName);
                break;
            }
        }
    }

    /**
     * Send text input to Nova 2 Sonic
     */
    async sendText(text: string, skipTranscript: boolean = false): Promise<void> {
        if (!this.sessionId || !this.isProcessing) {
            console.warn(`[SonicClient] ⚠️ Cannot send text input: Session not active or processing stopped. (ID: ${this.sessionId})`);
            return;
        }

        // --- DEBOUNCE: Prevent duplicate text sending (except for filler messages) --
        const fillerPhrases = ["Let me check that for you", "I'm still working on that", "Just a moment more"];
        const isFiller = fillerPhrases.some(phrase => text.includes(phrase));

        // Check for System Injection bypass
        const isSystemInjection = text.includes("[SYSTEM_INJECTION]");

        // AUTO-SKIP: Always skip transcript for internal system injections
        if (isSystemInjection) {
            skipTranscript = true;
        }

        if (!isFiller && !isSystemInjection) {
            // HALLUCINATION BLOCKER: Check for model self-interruption JSON
            if (text.includes('"interrupted"') && text.includes('true')) {
                console.warn(`[SonicClient] Ignoring hallucinated interruption signal: "${text}"`);
                return;
            }

            // CRITICAL FIX: Only block rapid duplicates (< 500ms) to prevent accidental double-clicks
            // Users should be able to intentionally send the same message multiple times
            const now = Date.now();
            const lastSent = (this as any)._lastSentText || { text: '', time: 0 };
            if (lastSent.text === text && (now - lastSent.time) < 500) {
                console.warn(`[SonicClient] Ignoring rapid duplicate text input (< 500ms): "${text}" -- for session ${this.sessionId}`);
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

        // Clear tool deduplication for the new agent turn.
        // IMPORTANT: Do NOT clear for system injections (e.g. Auto-Nudge) — those are internal
        // nudges mid-turn, not real user messages. Clearing here would allow Nova Sonic's
        // speculative second toolUse event to bypass deduplication and crash the stream.
        if (!isSystemInjection) {
            this.dispatchedToolUseIds.clear();
            this.pendingDuplicateToolUseIds.clear();
            this.dispatchedToolNames.clear();
        }

        // Emit transcript event for manual UI messages (if not skipped)
        if (!skipTranscript && text.length > 0) {
            console.log(`[SonicClient] ECHOING USER TRANSCRIPT: "${text}"`);

            // Use a stable ID for the turn
            const stableId = `user-${Date.now()}`;

            this.eventCallback?.({
                type: 'transcript',
                data: {
                    id: stableId,
                    role: 'user',
                    text: text,
                    isFinal: true,
                    timestamp: Date.now()
                }
            });
        }

        this.textQueue.push(text);
        this.lastUserTranscript = text;

        // Langfuse: Track User Input
        if (this.trace) {
            const userGen = this.trace.generation({
                name: "user-input",
                model: this.config.modelId,
                startTime: new Date()
            });
            // End immediately with input/output
            userGen.end({
                input: text,
                output: text  // Echo the input as output for user-input tracking
            });
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

                        // CRITICAL FIX: If we've already seen this EXACT toolUseId, ignore it.
                        // Nova Sonic sometimes delivers the same toolUse event multiple times.
                        if (this.dispatchedToolUseIds.has(tu.toolUseId)) {
                            console.log(`[SonicClient] ⚠️  Ignoring already dispatched toolUseId: ${tu.toolUseId} (tool: ${tu.toolName})`);
                            continue;
                        }

                        console.log(`[SonicClient] 🔧 NATIVE TOOL USE DETECTED: ${tu.toolName} (ID: ${tu.toolUseId})`);
                        console.log(`[SonicClient] Tool Use Data:`, JSON.stringify(tu, null, 2));

                        // DEDUPLICATION: Nova Sonic emits speculative + final toolUse events.
                        // Both have different toolUseIds but represent the same logical call.
                        // CRITICAL: Nova Sonic requires a result for EVERY toolUse it emits.
                        // So we suppress double-execution but track the duplicate IDs so we
                        // can send the result back for them when the first result arrives.
                        if (this.dispatchedToolNames.has(tu.toolName)) {
                            console.log(`[SonicClient] ⚠️  DUPLICATE toolUse queued (no re-execute): ${tu.toolName} (ID: ${tu.toolUseId})`);
                            // Track this duplicate ID — we'll replay the result for it
                            const dupes = this.pendingDuplicateToolUseIds.get(tu.toolName) || [];
                            dupes.push(tu.toolUseId);
                            this.pendingDuplicateToolUseIds.set(tu.toolName, dupes);
                        } else {
                            this.dispatchedToolNames.add(tu.toolName);
                            this.dispatchedToolUseIds.add(tu.toolUseId);

                            // Langfuse: Track tool invocation as a span
                            if (this.trace) {
                                const toolSpan = this.trace.span({
                                    name: `tool-${tu.toolName}`,
                                    input: tu.content,
                                    startTime: new Date(),
                                    metadata: {
                                        toolUseId: tu.toolUseId,
                                        toolName: tu.toolName
                                    }
                                });

                                // End immediately since we don't track tool results separately yet
                                toolSpan.end({
                                    output: "Tool invoked"
                                });

                                console.log(`[SonicClient] Langfuse: Tracked tool invocation for ${tu.toolName}`);
                            }

                            this.hasCalledTool = true; // Mark tool as called for Auto-Nudge logic

                            this.eventCallback?.({
                                type: 'toolUse',
                                data: tu
                            });
                        }
                    }

                    if (eventData.contentStart) {
                        const contentId = eventData.contentStart.contentId;
                        const contentName = eventData.contentStart.contentName;


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
                        if (eventData.contentStart.contentName) {
                            this.contentNameStages.set(eventData.contentStart.contentName, stage);
                        }

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

                        // Langfuse: Capture user transcript BEFORE reset when switching from USER to ASSISTANT
                        if (this.trace && roleChanged && currentRoleNormalized === 'user' && normalizedRole === 'assistant' && this.currentTurnTranscript.length > 0) {
                            this.lastUserTranscript = this.currentTurnTranscript;
                            console.log(`[SonicClient] ✓ Captured user transcript BEFORE reset: "${this.lastUserTranscript.substring(0, 50)}..."`);
                        }

                        // Debugging the "I apologize" ghost text
                        if (this.currentTurnTranscript.length > 0 && shouldReset) {
                            console.log(`[SonicClient] Resetting transcript. Prev content (chars: ${this.currentTurnTranscript.length}): "${this.currentTurnTranscript.substring(0, 50)}..."`);
                        }

                        if (shouldReset) {
                            console.log(`[SonicClient] Resetting transcript. Reason: ${roleChanged ? 'Role changed' : 'New turn starting'}. Old role: ${this.currentRole}, New role: ${eventData.contentStart.role}, Type: ${eventData.contentStart.type}`);


                            this.currentTurnId = `assistant-${Date.now()}`; // Generate a new ID for the assistant's turn
                            this.currentTurnTranscript = '';
                            this.isTurnComplete = false;
                            this.isInterrupted = false; // Reset interruption state for new turn
                            this.suppressedContentName = null; // Reset suppression state

                            // Reset Auto-Nudge State
                            this.hasCommittedToTool = false;
                            this.hasCalledTool = false;
                            this.activeContentNames.clear(); // Clear tracking for new turn

                            // Reset tool deduplication ONLY when a genuine new user turn starts.
                            // Nova Sonic's speculative execution cycles through TOOL→ASSISTANT→TOOL
                            // within a single agent turn. Clearing on every role change would let the
                            // second (final) tool call through. Only clear when:
                            //   - Role switches TO user (real new input)
                            //   - A completed turn's TEXT block starts (isTurnComplete path)
                            const isNewUserTurn = normalizedRole === 'user' ||
                                (this.isTurnComplete && eventData.contentStart.type === 'TEXT');
                            if (isNewUserTurn) {
                                this.dispatchedToolUseIds.clear();
                                this.pendingDuplicateToolUseIds.clear();
                                this.dispatchedToolNames.clear();
                                console.log(`[SonicClient] 🔄 Tool deduplication state cleared (new user turn)`);
                            }
                        } else if (eventData.contentStart.type === 'TEXT' && normalizedRole === 'assistant') {
                            // If we are NOT resetting, but getting new text, log why
                            console.log(`[SonicClient] EXPLICITLY NOT RESETTING transcript. Appending new TEXT block to existing turn.`);
                        }

                        console.log(`[SonicClient] Content Start: ${eventData.contentStart.type} (${eventData.contentStart.role}) ID: ${contentId} Stage: ${stage}`);
                        this.currentRole = eventData.contentStart.role;

                        // SPECULATIVE AUDIO SUPPRESSION
                        // If the model sends audio for a SPECULATIVE block, we suppress it to avoid
                        // "ghost" prompts that get interrupted by the FINAL block seconds later.
                        if (eventData.contentStart.type === 'AUDIO' && stage === 'SPECULATIVE') {
                            console.log(`[SonicClient] 🤫 Suppressing SPECULATIVE audio content: ${eventData.contentStart.contentName}`);
                            this.suppressedContentName = eventData.contentStart.contentName;
                            // Do NOT add to activeContentNames
                            // Do NOT emit contentStart
                            continue;
                        } else if (this.suppressedContentName === eventData.contentStart.contentName) {
                            // If we see a non-speculative version of the SAME content name (unlikely but safe)
                            this.suppressedContentName = null;
                        }

                        // Track active content blocks (moved after suppression check)
                        if (contentName) {
                            this.activeContentNames.add(contentName);
                        }

                        this.eventCallback?.({
                            type: 'contentStart',
                            data: {
                                role: this.currentRole === 'USER' ? 'user' : 'assistant',
                                contentId: contentId
                            }
                        });

                        // Langfuse: Capture user transcript when switching from USER to ASSISTANT
                        // This must happen BEFORE we create the assistant generation
                        console.log(`[SonicClient] Langfuse check: trace=${!!this.trace}, roleChanged=${roleChanged}, currentRole=${currentRoleNormalized}, newRole=${normalizedRole}, transcriptLen=${this.currentTurnTranscript.length}`);

                        if (this.trace && roleChanged && currentRoleNormalized === 'user' && normalizedRole === 'assistant') {
                            // User just finished speaking, capture their transcript
                            if (this.currentTurnTranscript.length > 0) {
                                this.lastUserTranscript = this.currentTurnTranscript;
                                console.log(`[SonicClient] ✓ Captured user transcript on role change: "${this.lastUserTranscript.substring(0, 50)}..."`);
                            } else {
                                console.log(`[SonicClient] ✗ Role changed to ASSISTANT but currentTurnTranscript is empty!`);
                            }
                        }

                        // Langfuse: Start Assistant Generation on Content Start
                        // Only start if we don't already have an active generation for this turn
                        // AND only for SPECULATIVE content (not FINAL re-renders)
                        if (this.trace && this.currentRole === 'ASSISTANT' && !this.currentGeneration) {
                            const stage = this.contentStages.get(eventData.contentStart.contentId) || 'UNKNOWN';

                            // Only create generation for SPECULATIVE content or if stage is unknown
                            // This prevents creating duplicate generations for FINAL re-renders
                            if (stage === 'SPECULATIVE' || stage === 'UNKNOWN') {
                                console.log(`[SonicClient] Creating assistant generation (stage: ${stage}) with input: "${(this.lastUserTranscript || "[No user input captured]").substring(0, 50)}..."`);

                                // Track start time for latency metrics
                                this.currentGenerationStartTime = new Date();
                                this.firstTokenTime = null; // Reset for this generation

                                this.currentGeneration = this.trace.generation({
                                    name: "assistant-response",
                                    model: this.config.modelId,
                                    input: this.lastUserTranscript || "[No user input captured]",
                                    startTime: this.currentGenerationStartTime,
                                    metadata: {
                                        stage: stage,
                                        contentId: eventData.contentStart.contentId
                                    }
                                });
                            } else {
                                console.log(`[SonicClient] Skipping generation creation for ${stage} content (already have active generation)`);
                            }
                        }
                    }




                    if (eventData.audioOutput) {
                        // Suppress audio if locally interrupted
                        if (this.isInterrupted) {
                            // console.log('[SonicClient] Suppressing audio output due to local interruption');
                            continue;
                        }

                        const content = eventData.audioOutput.content;
                        if (content.length > 0) {
                            console.log(`[SonicClient] Emitting audio event: ${content.length} base64 chars`);
                            this.eventCallback?.({
                                type: 'audio',
                                data: { audio: Buffer.from(content, 'base64') }
                            });
                        }
                    }

                    if (eventData.textOutput) {
                        // const content = eventData.textOutput.content;
                        const contentId = eventData.textOutput.contentId;
                        const stage = this.contentStages.get(contentId) || 'UNKNOWN';

                        // CRITICAL: Check for [STEP: step_id] tags
                        let cleanContent = eventData.textOutput.content;
                        const stepMatch = cleanContent.match(/\[STEP:\s*([a-zA-Z0-9_\-]+)\]/);
                        if (stepMatch) {
                            const stepId = stepMatch[1];
                            console.log(`[SonicClient] DETECTED WORKFLOW STEP: ${stepId}`);

                            // Emit workflow event
                            this.eventCallback?.({
                                type: 'workflow_update',
                                data: { currentStep: stepId }
                            });

                            // Remove the tag from the displayed text
                            cleanContent = cleanContent.replace(/\[STEP:\s*[a-zA-Z0-9_\-]+\]/g, '').trim();
                        }

                        // CLEANING: Remove [DIALECT: ...] tags
                        cleanContent = cleanContent.replace(/\[DIALECT:[^\]]+\]/g, '').trim();

                        // CLEANING: Remove SENTIMENT tags
                        cleanContent = cleanContent.replace(/[\[\]]?SENTIMENT:\s*-?\d+(\.\d+)?[\]\[]?/gi, '').trim();

                        // CLEANING: Remove JSON artifacts (e.g. { "interrupted": true })
                        if (cleanContent.match(/^\s*\{\s*"interrupted"\s*:\s*true\s*\}\s*$/)) {
                            console.log('[SonicClient] Removing leaked interruption JSON artifact');
                            cleanContent = "";
                        }

                        // CLEANING: Remove Hallucinated "System" headers
                        cleanContent = cleanContent.replace(/^System:/i, '').trim();

                        // If text is only the tag or now empty, don't append
                        if (cleanContent.length === 0) cleanContent = "";

                        // DEDUPING: Check if we are appending a duplicate phrase (common with streaming deltas occasionally)
                        // Simple check: if the new content is exactly the tail of the existing transcript
                        if (cleanContent && this.currentTurnTranscript.endsWith(cleanContent)) {
                            console.log(`[SonicClient] Skipping duplicate content chunk: "${cleanContent}"`);
                            cleanContent = "";
                        }

                        if (cleanContent && cleanContent.length > 0) {
                            const content = cleanContent;
                            // Track first token time for latency metrics
                            if (!this.firstTokenTime && this.currentGenerationStartTime && this.currentRole === 'ASSISTANT') {
                                this.firstTokenTime = new Date();
                                const ttft = this.firstTokenTime.getTime() - this.currentGenerationStartTime.getTime();
                                console.log(`[SonicClient] Time to first token: ${ttft}ms`);
                            }

                            // Accumulate text for the current turn
                            this.currentTurnTranscript += cleanContent;

                            // FINAL CLEANING: Apply cleaning to the FULL transcript to catch split tags
                            // Remove [DIALECT] tags
                            this.currentTurnTranscript = this.currentTurnTranscript.replace(/\[DIALECT:[^\]]+\]/g, '').trim();

                            // Remove JSON artifacts
                            this.currentTurnTranscript = this.currentTurnTranscript.replace(/\{"interrupted":true\}/g, '').trim();

                            // Remove system hallucinations at start
                            this.currentTurnTranscript = this.currentTurnTranscript.replace(/^System:\s*/i, '').trim();

                            // Remove [STEP] tags that might have slipped through
                            this.currentTurnTranscript = this.currentTurnTranscript.replace(/\[STEP:\s*[a-zA-Z0-9_\-]+\]/g, '').trim();

                            console.log(`[SonicClient] Received text (ID: ${contentId}, Stage: ${stage}): "${content}" -> Turn Total: "${this.currentTurnTranscript.substring(0, 50)}..."`);

                            // Send transcript event for streaming AND debug purposes
                            // For SPECULATIVE stage, send as streaming (non-final)
                            // This allows real-time text updates in the UI
                            this.eventCallback?.({
                                type: 'transcript',
                                data: {
                                    id: this.currentTurnId || `assistant-${Date.now()}`,
                                    role: this.currentRole === 'USER' ? 'user' : 'assistant',
                                    text: this.currentTurnTranscript, // Send FULL accumulated turn text
                                    isFinal: false,  // Always false here - final comes from END_TURN
                                    isStreaming: true,  // Flag for UI to show as streaming
                                    stage: stage // Pass stage (e.g. SPECULATIVE)
                                }
                            });

                            // AUTO-NUDGE DETECTION: Check for commitment phrases
                            if (!this.hasCommittedToTool && this.currentRole === 'ASSISTANT') {
                                // IMPROVED: Use strict regex patterns to avoid false positives (e.g. "I can help with checking...")
                                const commitmentPatterns = [
                                    // 1. Future explicit action: "I'll check", "Let me verify", "I will search"
                                    /\b(I'll|I will|let me|allow me to|gonna|going to|let's|lets)\s+(check|verify|look up|access|search|pull up|get|find|retrieve|fetch|connect|transfer|handoff|put you through)\b/i,

                                    // 2. Present continuous with "I am": "I'm checking", "I am verifying"
                                    /\b(I'm|I am)\s+(checking|verifying|accessing|searching|pulling up|looking up|retrieving|fetching|connecting|transferring|handing off)\b/i,

                                    // 3. Start of sentence/Clause active action: "Checking your...", "Sure, verifying details..."
                                    /(?:^|[.!?]\s+|(?:\b(?:Ok|Okay|Sure|Alright|Right|Yes|No|Thanks|Thank you)\s*[,.]\s*))(Checking|Verifying|Accessing|Searching|Looking up|Pulling up|Retrieving|Fetching|Connecting|Transferring|Handing off)\b/i,

                                    // 4. Wait phrases: "Just a moment", "Bear with me"
                                    /\b(just a moment|bear with me|one moment|hold on)\b/i
                                ];

                                if (commitmentPatterns.some(pattern => pattern.test(this.currentTurnTranscript))) {
                                    this.hasCommittedToTool = true;
                                    console.log(`[SonicClient] Auto-Nudge: Detected commitment phrase. Watching for tool call...`);
                                }
                            }
                        }
                    }

                    if (eventData.contentEnd) {
                        const contentName = eventData.contentEnd.contentName;
                        console.log(`[SonicClient] Content End: ${eventData.contentEnd.promptName} (${eventData.contentEnd.stopReason}) Content: ${contentName}`);

                        // Handle suppressed content end
                        if (contentName && contentName === this.suppressedContentName) {
                            console.log(`[SonicClient] 🤫 Suppressing contentEnd for SPECULATIVE audio: ${contentName}`);
                            this.suppressedContentName = null;
                            continue;
                        }

                        // Remove from active blocks
                        if (contentName) {
                            this.activeContentNames.delete(contentName);
                        }


                        // Pass event to callback
                        this.eventCallback?.({
                            type: 'contentEnd',
                            data: eventData.contentEnd
                        });

                        // AUTO-NUDGE EXECUTION
                        // If model stopped speaking (END_TURN) and promised a tool but didn't call it
                        if (eventData.contentEnd.stopReason === 'END_TURN' &&
                            this.currentRole === 'ASSISTANT' &&
                            this.hasCommittedToTool &&
                            !this.hasCalledTool) {

                            // CRITICAL FIX: Do not nudge on SPECULATIVE turns.
                            // Speculative turns are just previews. If we nudge now, we interrupt the model
                            // before it can send the FINAL version of the text and the AUDIO.
                            const stage = this.contentNameStages.get(eventData.contentEnd.contentName) || 'FINAL';
                            if (stage === 'SPECULATIVE') {
                                console.log(`[SonicClient] Model ended speculative turn (${eventData.contentEnd.stopReason}). Waiting for FINAL version before nudging.`);
                                return;
                            }

                            // CRITICAL FIX: Do not nudge if other assistant content blocks (like AUDIO) are still active.
                            // This prevents cutting off the speech playback.
                            if (this.activeContentNames.size > 0 && this.currentRole === 'ASSISTANT') {
                                console.log(`[SonicClient] Delaying Auto-Nudge: ${this.activeContentNames.size} block(s) still active (${Array.from(this.activeContentNames).join(', ')}).`);
                                return;
                            }


                            console.warn(`[SonicClient] ⚠️ Auto-Nudge Triggered: Model promised action but stopped without tool call (${stage} turn).`);
                            this.hasCommittedToTool = false; // Prevent double trigger

                            // Programmatic Prompt Injection (Only if session is still active)
                            if (this.sessionId && this.isProcessing) {
                                console.log('[SonicClient] Injecting Auto-Nudge hint...');
                                this.sendText("[SYSTEM_INJECTION]: You said you would perform an action. CALL THE TOOL NOW. Do not speak, just call the tool.");
                            } else {
                                console.warn('[SonicClient] Skipping Auto-Nudge injection - Session is inactive');
                            }
                        }

                        // Send final transcript when turn ends
                        if ((eventData.contentEnd.stopReason === 'END_TURN' || (this.currentRole === 'USER' && eventData.contentEnd.stopReason === 'PARTIAL_TURN')) && this.currentTurnTranscript.length > 0) {
                            // Determine stage from content name if possible
                            const stage = this.contentNameStages.get(eventData.contentEnd.contentName) || 'FINAL';

                            this.eventCallback?.({
                                type: 'transcript',
                                data: {
                                    id: this.currentTurnId || `assistant-${Date.now()}`,
                                    role: this.currentRole === 'USER' ? 'user' : 'assistant',
                                    text: this.currentTurnTranscript,
                                    isFinal: true,
                                    isStreaming: false,
                                    stage: stage
                                }
                            });

                            // Capture USER transcript for Langfuse
                            if (this.currentRole === 'USER') {
                                this.lastUserTranscript = this.currentTurnTranscript;
                                console.log(`[SonicClient] Captured user voice transcript for Langfuse: "${this.lastUserTranscript.substring(0, 50)}..."`);

                                // Langfuse: Track User Voice Input as a generation
                                if (this.trace) {
                                    const userGen = this.trace.generation({
                                        name: "user-input",
                                        model: this.config.modelId,
                                        startTime: new Date()
                                    });
                                    userGen.end({
                                        input: this.lastUserTranscript,
                                        output: this.lastUserTranscript  // Echo for tracking
                                    });
                                }
                            }

                            // Langfuse: End Assistant Generation
                            if (this.currentGeneration && this.currentRole === 'ASSISTANT') {
                                const endTime = new Date();
                                const metadata: any = {};

                                // Add latency metrics
                                if (this.currentGenerationStartTime) {
                                    const totalDuration = endTime.getTime() - this.currentGenerationStartTime.getTime();
                                    metadata.latency_ms = totalDuration;

                                    if (this.firstTokenTime) {
                                        const ttft = this.firstTokenTime.getTime() - this.currentGenerationStartTime.getTime();
                                        metadata.time_to_first_token_ms = ttft;

                                        // Score: Latency (lower is better, normalize to some scale or just track raw)
                                        // For now, we'll just track it as a score for visibility
                                        this.trace?.score({
                                            name: "latency-score",
                                            value: ttft < 1000 ? 1 : (ttft < 3000 ? 0.7 : 0.3),
                                            comment: `TTFT: ${ttft}ms`
                                        });
                                    }
                                }

                                // Score: Success/Accuracy (1 for successful turn completion)
                                this.trace?.score({
                                    name: "turn-success",
                                    value: 1,
                                    comment: "Turn completed successfully"
                                });

                                this.currentGeneration.end({
                                    output: this.currentTurnTranscript,
                                    completionStartTime: endTime,
                                    metadata: {
                                        ...metadata, // Include latency metrics
                                        stage: stage // OVERWRITE 'SPECULATIVE' with 'FINAL' (or whatever stage we ended on)
                                    }
                                });
                                this.currentGeneration = null;
                                this.currentGenerationStartTime = null;
                                this.firstTokenTime = null;

                                // FIX: Clear transcript after ending generation to prevent duplication/concatenation
                                // in subsequent generations (e.g. if tool use triggers multiple gens per turn)
                                this.currentTurnTranscript = '';
                            }
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

                            // Langfuse: Track interruption as an event
                            if (this.trace) {
                                this.trace.event({
                                    name: "interruption",
                                    metadata: {
                                        role: this.currentRole,
                                        transcriptLength: this.currentTurnTranscript.length,
                                        partialTranscript: this.currentTurnTranscript.substring(0, 100)
                                    },
                                    level: "WARNING"
                                });

                                // Score: Turn Impact
                                this.trace.score({
                                    name: "turn-success",
                                    value: 0,
                                    comment: "Interrupted by user"
                                });
                            }

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

                        // Track token usage for Langfuse
                        if (eventData.usageEvent.details?.total) {
                            const total = eventData.usageEvent.details.total;
                            const inputTokens = (total.input?.speechTokens || 0) + (total.input?.textTokens || 0);
                            const outputTokens = (total.output?.speechTokens || 0) + (total.output?.textTokens || 0);

                            this.sessionInputTokens = inputTokens;
                            this.sessionOutputTokens = outputTokens;
                            this.sessionTotalTokens = inputTokens + outputTokens;

                            // Update current generation with usage if it exists
                            if (this.currentGeneration) {
                                this.currentGeneration.update({
                                    usage: {
                                        input: inputTokens,
                                        output: outputTokens,
                                        total: this.sessionTotalTokens
                                    }
                                });
                            }
                        }

                        this.eventCallback?.({
                            type: 'usageEvent',
                            data: eventData.usageEvent
                        });
                    }
                }
            }
        } catch (error: any) {
            console.error('[SonicClient] CRITICAL ERROR processing output stream:', error);
            if (error instanceof Error) {
                console.error('[SonicClient] Stack:', error.stack);
            }
            this.eventCallback?.({
                type: 'error',
                data: {
                    message: 'Stream processing error',
                    error: {
                        message: error.message || String(error),
                        name: error.name,
                        stack: error.stack
                    }
                },
            });
            console.log('[SonicClient] Output event processing ended');
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

        // Langfuse: Finalize Trace Output
        if (this.trace) {
            this.trace.update({
                output: {
                    type: "session-end",
                    status: "completed",
                    transcriptLength: this.recentOutputs.length, // or some other metric
                    tokenUsage: {
                        input: this.sessionInputTokens,
                        output: this.sessionOutputTokens,
                        total: this.sessionTotalTokens
                    }
                }
            });
            console.log(`[SonicClient] ✓ Finalized Langfuse trace output`);
        }

        // Wait for generator to finish yielding final events (SessionEnd)
        if (this.inputStreamFinished) {
            console.log('[SonicClient] Waiting for input stream to finish...');
            const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));
            await Promise.race([this.inputStreamFinished, timeoutPromise]);
            console.log('[SonicClient] Input stream finished (or timed out)');
        }

        // Clear input queue
        this.inputQueue = [];

        // Give streams extra time to flush buffers to network
        // INCREASED TIMEOUT: AWS SDK buffering can be aggressive
        await new Promise(resolve => setTimeout(resolve, 2000));

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

    public getSessionInputTokens(): number {
        return this.sessionInputTokens;
    }

    public getSessionOutputTokens(): number {
        return this.sessionOutputTokens;
    }

    public getSessionTotalTokens(): number {
        return this.sessionTotalTokens;
    }


}
