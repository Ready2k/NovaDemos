/**
 * Unified Agent Runtime - Voice-Agnostic Architecture
 * 
 * This runtime supports three modes via MODE environment variable:
 * - 'voice': Voice-only mode using Voice Side-Car
 * - 'text': Text-only mode using Text Adapter
 * - 'hybrid': Both voice and text simultaneously
 * 
 * The runtime loads workflow definitions, persona configurations, and initializes
 * the appropriate adapters based on the mode. It handles WebSocket connections,
 * Gateway registration, and graceful shutdown.
 */

import 'dotenv/config';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Core components
import { AgentCore, AgentCoreConfig } from './agent-core';
import { VoiceSideCar, VoiceSideCarConfig } from './voice-sidecar';
import { TextAdapter, TextAdapterConfig } from './text-adapter';

// Supporting services
import { GraphExecutor } from './graph-executor';
import { WorkflowDefinition } from './graph-types';
import { ToolsClient } from './tools-client';
import { DecisionEvaluator } from './decision-evaluator';
import { PersonaLoader } from './persona-loader';
import { PersonaConfig } from './persona-types';
import { SonicConfig } from './sonic-client';

// Logging configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error
const DEBUG = LOG_LEVEL === 'debug';
const AUTO_TRIGGER_ENABLED = process.env.AUTO_TRIGGER_ENABLED !== 'false';

// Circuit breaker configuration
const MAX_SESSION_ERRORS = parseInt(process.env.MAX_SESSION_ERRORS || '5');
const ERROR_WINDOW_MS = parseInt(process.env.ERROR_WINDOW_MS || '10000');

/**
 * Runtime mode types
 */
export type RuntimeMode = 'voice' | 'text' | 'hybrid';

/**
 * Configuration for Unified Runtime
 */
export interface UnifiedRuntimeConfig {
    mode: RuntimeMode;
    agentId: string;
    agentPort: number;
    workflowFile: string;
    awsConfig?: {
        region: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        sessionToken?: string;
    };
    gatewayUrl?: string;
    localToolsUrl?: string;
    agentCoreUrl?: string;
    personasDir?: string;
    promptsDir?: string;
}

/**
 * Session state for unified runtime
 */
interface RuntimeSession {
    sessionId: string;
    ws: WebSocket;
    mode: 'voice' | 'text' | 'hybrid';
    startTime: number;
    memory?: any;
    traceId?: string;
    autoTriggered?: boolean; // Track if auto-trigger already fired
    errorCount?: number;     // Track errors for circuit breaker
    lastError?: number;      // Timestamp of last error
}

/**
 * Unified Runtime - Single entry point for all agent modes
 */
export class UnifiedRuntime {
    private config: UnifiedRuntimeConfig;

    // Core components
    private agentCore: AgentCore | null = null;
    private voiceSideCar: VoiceSideCar | null = null;
    private textAdapter: TextAdapter | null = null;

    // Supporting services
    private toolsClient: ToolsClient;
    private decisionEvaluator: DecisionEvaluator;
    private personaLoader: PersonaLoader;

    // Workflow and persona
    private workflowDef: WorkflowDefinition | null = null;
    private personaConfig: PersonaConfig | null = null;
    private personaPrompt: string = '';
    private graphExecutor: GraphExecutor | null = null;

    // Server infrastructure
    private app: express.Application;
    private server: any;
    private wss: WebSocketServer | null = null;

    // Session management
    private sessions: Map<string, RuntimeSession> = new Map();

    // Gateway integration
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private isShuttingDown: boolean = false;

    constructor(config: UnifiedRuntimeConfig) {
        this.config = config;

        // Initialize Express app
        this.app = express();
        this.app.use(express.json());

        // Initialize supporting services
        this.toolsClient = new ToolsClient(
            config.localToolsUrl || 'http://local-tools:9000',
            config.agentCoreUrl
        );

        this.decisionEvaluator = new DecisionEvaluator(
            config.awsConfig?.region || 'us-east-1'
        );

        // Determine base directories (Docker vs local)
        const isDocker = fs.existsSync('/app');
        const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');

        this.personaLoader = new PersonaLoader(
            config.personasDir || path.join(BASE_DIR, 'backend/personas'),
            config.promptsDir || path.join(BASE_DIR, 'backend/prompts')
        );

        console.log(`[UnifiedRuntime:${config.agentId}] Initialized in ${config.mode} mode`);
    }

    /**
     * Start the runtime
     * Loads configuration, initializes components, and starts server
     */
    public async start(): Promise<void> {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Starting...`);

        try {
            // Step 1: Load workflow and persona configuration
            await this.loadConfiguration();

            // Step 2: Validate configuration based on mode
            this.validateConfiguration();

            // Step 3: Initialize Agent Core
            this.initializeAgentCore();

            // Step 4: Initialize adapters based on mode
            this.initializeAdapters();

            // Step 5: Start HTTP and WebSocket server
            await this.startServer();

            // Step 6: Register with Gateway
            await this.registerWithGateway();

            // Step 7: Start heartbeat
            this.startHeartbeat();

            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Started successfully on port ${this.config.agentPort}`);

        } catch (error: any) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] ❌ Failed to start: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop the runtime
     * Gracefully shuts down all components
     */
    public async stop(): Promise<void> {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Stopping...`);

        this.isShuttingDown = true;

        try {
            // Stop heartbeat
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }

            // Close all active sessions
            for (const [sessionId, session] of this.sessions.entries()) {
                await this.handleDisconnect(sessionId);
            }

            // Close WebSocket server
            if (this.wss) {
                this.wss.close();
            }

            // Close HTTP server
            if (this.server) {
                this.server.close();
            }

            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Stopped successfully`);

        } catch (error: any) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Error during shutdown: ${error.message}`);
        }
    }

    /**
     * Load workflow definition and persona configuration
     */
    private async loadConfiguration(): Promise<void> {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Loading configuration...`);

        // Load workflow definition
        if (!fs.existsSync(this.config.workflowFile)) {
            throw new Error(`Workflow file not found: ${this.config.workflowFile}`);
        }

        try {
            this.workflowDef = JSON.parse(fs.readFileSync(this.config.workflowFile, 'utf-8'));
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Loaded workflow from ${this.config.workflowFile}`);
        } catch (error: any) {
            throw new Error(`Failed to parse workflow file: ${error.message}`);
        }

        // Load persona configuration if specified
        if (this.workflowDef && this.workflowDef.personaId) {
            console.log(`[UnifiedRuntime:${this.config.agentId}] Loading persona: ${this.workflowDef.personaId}`);

            const personaResult = this.personaLoader.loadPersona(this.workflowDef.personaId);

            if (personaResult.success && personaResult.persona) {
                this.personaConfig = personaResult.persona;
                this.personaPrompt = personaResult.systemPrompt || '';

                console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Persona loaded: ${this.personaConfig.name}`);
                console.log(`[UnifiedRuntime:${this.config.agentId}]    Voice: ${this.personaConfig.voiceId}`);
                console.log(`[UnifiedRuntime:${this.config.agentId}]    Allowed tools: ${this.personaConfig.allowedTools.length}`);
                console.log(`[UnifiedRuntime:${this.config.agentId}]    Prompt length: ${this.personaPrompt.length} chars`);

                // Override workflow voice with persona voice if not set
                if (!this.workflowDef.voiceId && this.personaConfig.voiceId) {
                    this.workflowDef.voiceId = this.personaConfig.voiceId;
                }
            } else {
                console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  Failed to load persona: ${personaResult.error}`);
            }
        }

        // Initialize graph executor
        if (this.workflowDef) {
            try {
                this.graphExecutor = new GraphExecutor(this.workflowDef);
                console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Graph executor initialized`);
            } catch (error: any) {
                console.error(`[UnifiedRuntime:${this.config.agentId}] Failed to initialize graph executor: ${error.message}`);
            }
        }
    }

    /**
     * Validate configuration based on mode
     */
    private validateConfiguration(): void {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Validating configuration for ${this.config.mode} mode...`);

        // Voice mode requires AWS credentials
        if (this.config.mode === 'voice' || this.config.mode === 'hybrid') {
            if (!this.config.awsConfig?.accessKeyId || !this.config.awsConfig?.secretAccessKey) {
                throw new Error('Voice mode requires AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)');
            }
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ AWS credentials validated`);
        }

        // All modes require workflow definition
        if (!this.workflowDef) {
            throw new Error('Workflow definition is required');
        }

        console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Configuration validated`);
    }

    /**
     * Initialize Agent Core
     */
    private initializeAgentCore(): void {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Initializing Agent Core...`);

        const agentCoreConfig: AgentCoreConfig = {
            agentId: this.config.agentId,
            workflowDef: this.workflowDef,
            personaConfig: this.personaConfig,
            toolsClient: this.toolsClient,
            decisionEvaluator: this.decisionEvaluator,
            graphExecutor: this.graphExecutor,
            localToolsUrl: this.config.localToolsUrl,
            gatewayUrl: this.config.gatewayUrl,
            langfuseConfig: {
                publicKey: process.env.LANGFUSE_PUBLIC_KEY,
                secretKey: process.env.LANGFUSE_SECRET_KEY,
                baseUrl: process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
                enabled: process.env.LANGFUSE_ENABLED !== 'false'
            }
        };

        this.agentCore = new AgentCore(agentCoreConfig);

        // Set persona prompt if available
        if (this.personaPrompt) {
            this.agentCore.setPersonaPrompt(this.personaPrompt);
        }

        console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Agent Core initialized`);
    }

    /**
     * Initialize adapters based on mode
     */
    private initializeAdapters(): void {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Initializing adapters for ${this.config.mode} mode...`);

        if (!this.agentCore) {
            throw new Error('Agent Core must be initialized before adapters');
        }

        // Initialize Voice Side-Car for voice or hybrid mode
        if (this.config.mode === 'voice' || this.config.mode === 'hybrid') {
            const sonicConfig: SonicConfig = {
                region: this.config.awsConfig!.region,
                accessKeyId: this.config.awsConfig!.accessKeyId!,
                secretAccessKey: this.config.awsConfig!.secretAccessKey!,
                sessionToken: this.config.awsConfig?.sessionToken,
                modelId: 'amazon.nova-2-sonic-v1:0'
            };

            const voiceSideCarConfig: VoiceSideCarConfig = {
                agentCore: this.agentCore,
                sonicConfig
            };

            this.voiceSideCar = new VoiceSideCar(voiceSideCarConfig);
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Voice Side-Car initialized`);

            if (this.config.mode === 'hybrid') {
                console.log(`[UnifiedRuntime:${this.config.agentId}] ℹ️  Hybrid mode: Voice adapter handles both voice and text input`);
            }
        }

        // Initialize Text Adapter ONLY for text-only mode
        // In hybrid mode, voice adapter handles text input via handleTextInput()
        if (this.config.mode === 'text') {
            // VOICE-AGNOSTIC: Text mode uses Agent Core directly (Claude Sonnet)
            // No Nova Sonic needed - Agent Core generates responses independently
            const textAdapterConfig: TextAdapterConfig = {
                agentCore: this.agentCore
            };

            this.textAdapter = new TextAdapter(textAdapterConfig);
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Text Adapter initialized (Voice-Agnostic Mode)`);
        }
    }

    /**
     * Start HTTP and WebSocket server
     */
    private async startServer(): Promise<void> {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Starting server on port ${this.config.agentPort}...`);

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                agentId: this.config.agentId,
                mode: this.config.mode,
                activeSessions: this.sessions.size,
                uptime: process.uptime()
            });
        });

        // Create HTTP server
        this.server = createServer(this.app);

        // Create WebSocket server
        this.wss = new WebSocketServer({ server: this.server });

        // Handle WebSocket connections
        this.wss.on('connection', (ws: WebSocket) => {
            this.handleConnection(ws);
        });

        // Start listening
        return new Promise((resolve, reject) => {
            this.server.listen(this.config.agentPort, () => {
                console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Server listening on port ${this.config.agentPort}`);
                resolve();
            });

            this.server.on('error', (error: any) => {
                console.error(`[UnifiedRuntime:${this.config.agentId}] Server error: ${error.message}`);
                reject(error);
            });
        });
    }

    /**
     * Handle new WebSocket connection
     */
    public handleConnection(ws: WebSocket): void {
        if (DEBUG) {
            console.log(`[UnifiedRuntime:${this.config.agentId}] New WebSocket connection`);
        }

        let sessionId: string | null = null;

        // Handle messages
        ws.on('message', async (data: Buffer, isBinary: boolean) => {
            try {
                // Determine if this is binary (audio) or text (JSON)
                // Use the protocol flag if available, fallback to manual check
                const isActuallyBinary = isBinary || (data.length > 0 && data[0] !== 0x7B);

                if (isActuallyBinary) {
                    // Binary data - audio chunk (don't log in production)
                    if (DEBUG && sessionId) {
                        console.log(`[UnifiedRuntime:${this.config.agentId}] 🎤 Audio chunk: ${data.length} bytes`);
                    }

                    if (sessionId && (this.config.mode === 'voice' || this.config.mode === 'hybrid')) {
                        await this.handleMessage(sessionId, data, true);
                    }
                } else {
                    // Text data - JSON message
                    let message;
                    let isJson = false;
                    try {
                        const dataStr = data.toString();
                        if (dataStr.trim().startsWith('{')) {
                            message = JSON.parse(dataStr);
                            isJson = message && typeof message === 'object' && message.type;
                        }
                    } catch (parseError: any) {
                        // If it looked like JSON but failed to parse, it might be audio
                        // or just malformed text. We'll try to treat it as audio if we're in voice mode.
                        if (sessionId && (this.config.mode === 'voice' || this.config.mode === 'hybrid')) {
                            console.warn(`[UnifiedRuntime:${this.config.agentId}] Message started with { but not valid JSON, treating as raw data`);
                            await this.handleMessage(sessionId, data, true);
                            return;
                        }

                        console.error(`[UnifiedRuntime:${this.config.agentId}] Failed to parse JSON message: ${parseError.message}`);
                        console.error(`[UnifiedRuntime:${this.config.agentId}] Raw data (first 100 chars): ${data.toString().substring(0, 100)}`);

                        // Only send error if we're certain it's supposed to be text
                        if (sessionId) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Invalid JSON message format',
                                details: parseError.message
                            }));
                        }
                        return;
                    }

                    if (!isJson) {
                        // Fallback: if not JSON, but not binary, treat as audio if in voice mode
                        if (sessionId && (this.config.mode === 'voice' || this.config.mode === 'hybrid')) {
                            await this.handleMessage(sessionId, data, true);
                            return;
                        }
                        return;
                    }

                    // Only log important message types in production
                    if (DEBUG || ['session_init', 'error', 'handoff', 'memory_update'].includes(message.type)) {
                        console.log(`[UnifiedRuntime:${this.config.agentId}] 📨 Received message type: ${message.type}, sessionId=${sessionId}`);
                    }

                    // Handle session initialization
                    if (message.type === 'session_init') {
                        const newSessionId = message.sessionId || `session-${Date.now()}`;
                        sessionId = newSessionId;
                        const memory = message.memory || {};
                        const traceId = message.traceId; // Extract traceId from session_init message

                        await this.initializeSession(newSessionId, ws, memory, traceId); // Pass traceId
                    } else if (message.type === 'memory_update') {
                        // Handle memory updates from gateway (e.g., when credentials are extracted)
                        const targetSessionId = sessionId || message.sessionId;

                        if (targetSessionId) {
                            console.log(`[UnifiedRuntime:${this.config.agentId}] Received memory update for session: ${targetSessionId}`);
                            const session = this.sessions.get(targetSessionId);
                            if (session) {
                                // Update session memory
                                session.memory = message.memory || {};

                                // Update AgentCore session with new graphState
                                if (this.agentCore && message.graphState) {
                                    const agentSession = this.agentCore.getSession(targetSessionId);
                                    if (agentSession) {
                                        agentSession.graphState = message.graphState;
                                        console.log(`[UnifiedRuntime:${this.config.agentId}] Updated AgentCore graphState with credentials`);

                                        // Log what credentials we now have
                                        if (message.graphState.account && message.graphState.sortCode) {
                                            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ COMPLETE CREDENTIALS: Account ${message.graphState.account}, Sort Code ${message.graphState.sortCode}`);
                                        } else if (message.graphState.account) {
                                            console.log(`[UnifiedRuntime:${this.config.agentId}] ⏳ PARTIAL: Have account ${message.graphState.account}`);
                                        } else if (message.graphState.sortCode) {
                                            console.log(`[UnifiedRuntime:${this.config.agentId}] ⏳ PARTIAL: Have sort code ${message.graphState.sortCode}`);
                                        }

                                        // CRITICAL: Update SonicClient system prompt with new credentials
                                        // This ensures the LLM sees the updated context on the next message
                                        const updatedSystemPrompt = this.agentCore.getSystemPrompt(targetSessionId);

                                        // Update voice session if active
                                        if (this.voiceSideCar) {
                                            const voiceSession = this.voiceSideCar.getSession(targetSessionId);
                                            console.log(`[UnifiedRuntime:${this.config.agentId}] 🔍 Voice session lookup: found=${!!voiceSession}, hasSonicClient=${!!voiceSession?.sonicClient}`);

                                            if (voiceSession?.sonicClient) {
                                                voiceSession.sonicClient.updateSystemPrompt(updatedSystemPrompt);
                                                console.log(`[UnifiedRuntime:${this.config.agentId}] 🔄 Updated SonicClient system prompt with credentials`);
                                            } else {
                                                console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  Cannot update system prompt: voiceSession or sonicClient not found`);
                                            }
                                        } else {
                                            console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  Cannot update system prompt: voiceSideCar not initialized`);
                                        }

                                        // Update text session if active (for hybrid mode)
                                        if (this.textAdapter) {
                                            // Text adapter will get updated prompt on next message automatically
                                            console.log(`[UnifiedRuntime:${this.config.agentId}] 📝 Text adapter will use updated prompt on next message`);
                                        }
                                    }
                                }
                            } else {
                                console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  Session not found for memory update: ${targetSessionId}`);
                            }
                        } else {
                            console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  No sessionId available for memory_update`);
                        }
                    } else if (sessionId) {
                        // CRITICAL: Await message processing to ensure it completes
                        // before handling any subsequent messages or disconnect
                        await this.handleMessage(sessionId, data, false);
                    }
                }
            } catch (error: any) {
                console.error(`[UnifiedRuntime:${this.config.agentId}] Error handling message: ${error.message}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Error processing message',
                    details: error.message
                }));
            }
        });

        // Handle disconnection
        ws.on('close', async () => {
            if (sessionId) {
                await this.handleDisconnect(sessionId);
            }
        });

        // Handle errors
        ws.on('error', (error: any) => {
            console.error(`[UnifiedRuntime:${this.config.agentId}] WebSocket error: ${error.message}`);
            if (sessionId) {
                this.handleDisconnect(sessionId);
            }
        });
    }

    /**
     * Initialize a new session
     */
    private async initializeSession(sessionId: string, ws: WebSocket, memory?: any, traceId?: string): Promise<void> {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Initializing session: ${sessionId}`);

        try {
            // If session already exists, ensure complete cleanup
            if (this.sessions.has(sessionId)) {
                console.warn(`[UnifiedRuntime:${this.config.agentId}] Session ${sessionId} already exists. Performing full cleanup...`);

                // Wait for cleanup to complete
                await this.handleDisconnect(sessionId);

                // Add small delay to ensure cleanup is complete
                await new Promise(resolve => setTimeout(resolve, 100));

                // Verify session is gone
                if (this.sessions.has(sessionId)) {
                    throw new Error(`Failed to cleanup existing session: ${sessionId}`);
                }
            }

            // Store session
            const session: RuntimeSession = {
                sessionId,
                ws,
                mode: this.config.mode,
                startTime: Date.now(),
                memory,
                traceId,
                autoTriggered: false, // Initialize auto-trigger flag
                errorCount: 0,        // Initialize error count
                lastError: 0          // Initialize last error timestamp
            };
            this.sessions.set(sessionId, session);

            // Initialize based on mode
            if (this.config.mode === 'voice' && this.voiceSideCar) {
                await this.voiceSideCar.startVoiceSession(sessionId, ws, memory);
            } else if (this.config.mode === 'text' && this.textAdapter) {
                await this.textAdapter.startTextSession(sessionId, ws, memory);
            } else if (this.config.mode === 'hybrid') {
                // FIXED: In hybrid mode, ONLY start voice adapter
                // Voice adapter handles both voice and text input via handleTextInput()
                // Starting both adapters causes duplicate messages
                if (this.voiceSideCar) {
                    await this.voiceSideCar.startVoiceSession(sessionId, ws, memory);
                }
                // DO NOT start text adapter in hybrid mode - it causes duplication
            }

            // IMPROVED: Auto-trigger with guards
            if (AUTO_TRIGGER_ENABLED && !session.autoTriggered) {
                // CRITICAL: Auto-trigger IDV agent
                if (this.config.agentId === 'idv') {
                    session.autoTriggered = true; // Mark as triggered

                    // Check if credentials were pre-provided
                    const hasProvidedCredentials = memory?.providedAccount && memory?.providedSortCode;

                    if (hasProvidedCredentials) {
                        console.log(`[UnifiedRuntime:${this.config.agentId}] 🚀 Auto-triggering IDV with provided credentials`);
                        console.log(`[UnifiedRuntime:${this.config.agentId}]    Account: ${memory.providedAccount}, Sort Code: ${memory.providedSortCode}`);

                        // Trigger with credentials so agent verifies immediately
                        const triggerMessage = `${memory.providedAccount} ${memory.providedSortCode}`;

                        // Support both text and voice modes
                        if (this.voiceSideCar) {
                            setTimeout(() => {
                                this.voiceSideCar!.handleTextInput(sessionId, triggerMessage, true).catch(error => {
                                    console.error(`[UnifiedRuntime:${this.config.agentId}] Error sending auto-trigger: ${error.message}`);
                                });
                            }, 1500);
                        } else if (this.textAdapter) {
                            setTimeout(() => {
                                this.textAdapter!.handleUserInput(sessionId, triggerMessage).catch(error => {
                                    console.error(`[UnifiedRuntime:${this.config.agentId}] Error sending auto-trigger: ${error.message}`);
                                });
                            }, 1500);
                        }
                    } else {
                        console.log(`[UnifiedRuntime:${this.config.agentId}] 🚀 Auto-triggering IDV agent greeting`);

                        // Simple greeting trigger - let the agent's prompt handle the rest
                        const triggerMessage = '[System: User has been transferred to you for identity verification. Please greet them and ask for their credentials.]';

                        // Support both text and voice modes
                        if (this.voiceSideCar) {
                            setTimeout(() => {
                                this.voiceSideCar!.handleTextInput(sessionId, triggerMessage, true).catch(error => {
                                    console.error(`[UnifiedRuntime:${this.config.agentId}] Error sending auto-trigger: ${error.message}`);
                                });
                            }, 1500);
                        } else if (this.textAdapter) {
                            setTimeout(() => {
                                this.textAdapter!.handleUserInput(sessionId, triggerMessage).catch(error => {
                                    console.error(`[UnifiedRuntime:${this.config.agentId}] Error sending auto-trigger: ${error.message}`);
                                });
                            }, 1500);
                        }
                    }
                }

                // CRITICAL: Auto-trigger banking agent with verified user
                // ALWAYS trigger, even if credentials are missing - the agent can ask for them
                if (this.config.agentId === 'banking' && memory) {
                    console.log(`[UnifiedRuntime:${this.config.agentId}] 🔍 Checking banking auto-trigger conditions:`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    memory.verified: ${memory.verified}`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    memory.userName: ${memory.userName}`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    memory.account: ${memory.account}`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    memory.sortCode: ${memory.sortCode}`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    memory.userIntent: ${memory.userIntent}`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    session.autoTriggered: ${session.autoTriggered}`);

                    const hasVerifiedUser = memory.verified && memory.userName;
                    const hasIntent = memory.userIntent;
                    const hasAccountDetails = memory.account && memory.sortCode;

                    // CHANGED: Trigger if verified user exists, regardless of credentials
                    // The banking agent prompt will check for missing credentials and ask for them
                    if (hasVerifiedUser) {
                        console.log(`[UnifiedRuntime:${this.config.agentId}] 🚀 Auto-triggering Banking agent (first time only)`);
                        console.log(`[UnifiedRuntime:${this.config.agentId}]    User: ${memory.userName}, Intent: ${hasIntent ? memory.userIntent : 'check balance'}`);
                        console.log(`[UnifiedRuntime:${this.config.agentId}]    Account: ${memory.account || 'MISSING'}, Sort Code: ${memory.sortCode || 'MISSING'}`);

                        session.autoTriggered = true; // Mark as triggered

                        // Build trigger message based on what we have
                        let triggerMessage: string;
                        if (hasIntent && hasAccountDetails) {
                            // We have everything - proceed with intent
                            triggerMessage = `I want to ${memory.userIntent}`;
                        } else if (hasIntent && !hasAccountDetails) {
                            // We have intent but missing credentials - ask for them
                            triggerMessage = `[SYSTEM: User wants to ${memory.userIntent} but credentials are missing. Ask for account number and sort code.]`;
                        } else if (!hasIntent && hasAccountDetails) {
                            // We have credentials but no intent - ask what they want
                            triggerMessage = `[SYSTEM: User has provided credentials. Ask how you can help them.]`;
                        } else {
                            // Missing both - ask for everything
                            triggerMessage = `[SYSTEM: User is verified but missing credentials and intent. Greet them and ask for account details.]`;
                        }

                        // Use appropriate adapter based on mode
                        const adapter = this.voiceSideCar || this.textAdapter;

                        if (adapter) {
                            // CRITICAL: Increased delay to ensure session is fully initialized
                            setTimeout(() => {
                                console.log(`[UnifiedRuntime:${this.config.agentId}] 🎯 Sending auto-trigger message: "${triggerMessage}"`);

                                if (this.voiceSideCar) {
                                    this.voiceSideCar.handleTextInput(sessionId, triggerMessage, true).catch(error => {
                                        console.error(`[UnifiedRuntime:${this.config.agentId}] ❌ Error sending auto-trigger: ${error.message}`);
                                    });
                                } else if (this.textAdapter) {
                                    this.textAdapter.handleUserInput(sessionId, triggerMessage).catch(error => {
                                        console.error(`[UnifiedRuntime:${this.config.agentId}] ❌ Error sending auto-trigger: ${error.message}`);
                                    });
                                }
                            }, 2000); // Increased to 2 seconds for safety
                        } else {
                            console.error(`[UnifiedRuntime:${this.config.agentId}] ❌ No adapter available for auto-trigger`);
                        }
                    } else {
                        console.log(`[UnifiedRuntime:${this.config.agentId}] ⏸️  Banking agent NOT auto-triggered: User not verified (verified=${memory.verified}, userName=${memory.userName})`);
                    }
                }
            } else if (!AUTO_TRIGGER_ENABLED && DEBUG) {
                console.log(`[UnifiedRuntime:${this.config.agentId}] ⏸️  Auto-trigger disabled via environment variable`);
            }

            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Session initialized: ${sessionId}`);

        } catch (error: any) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Failed to initialize session: ${error.message}`);

            // Clean up on error
            this.sessions.delete(sessionId);

            // Close WebSocket if still open
            if (ws.readyState === ws.OPEN) {
                ws.close(1011, 'Session initialization failed');
            }

            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to initialize session',
                details: error.message,
                fatal: true
            }));

            throw error;
        }
    }

    /**
     * Handle incoming message (audio or text)
     */
    public async handleMessage(sessionId: string, data: Buffer, isBinary: boolean): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[UnifiedRuntime:${this.config.agentId}] Message for unknown session: ${sessionId}`);
            return;
        }

        // Circuit breaker: Check error rate
        if (session.errorCount && session.errorCount >= MAX_SESSION_ERRORS) {
            const timeSinceLastError = Date.now() - (session.lastError || 0);

            if (timeSinceLastError < ERROR_WINDOW_MS) {
                console.error(`[UnifiedRuntime:${this.config.agentId}] 🔴 Circuit breaker: Too many errors (${session.errorCount}) for session ${sessionId}`);

                // Send error to client before closing
                if (session.ws.readyState === session.ws.OPEN) {
                    session.ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Session terminated due to repeated errors',
                        errorCount: session.errorCount,
                        fatal: true
                    }));
                }

                // Close session
                await this.handleDisconnect(sessionId);

                return;
            } else {
                // Reset error count after window expires
                session.errorCount = 0;
                if (DEBUG) {
                    console.log(`[UnifiedRuntime:${this.config.agentId}] Circuit breaker reset for session ${sessionId}`);
                }
            }
        }

        try {
            if (isBinary) {
                // Binary data - audio chunk
                if (this.voiceSideCar) {
                    await this.voiceSideCar.handleAudioChunk(sessionId, data);
                }
            } else {
                // Text data - JSON message
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case 'user_input':
                        // Text input
                        if (this.textAdapter) {
                            await this.textAdapter.handleUserInput(sessionId, message.text);
                        }
                        break;

                    case 'text_input':
                        // Text input - works for both text mode and hybrid mode
                        if (this.voiceSideCar) {
                            if (DEBUG) {
                                console.log(`[UnifiedRuntime:${this.config.agentId}] 📥 Processing text_input (voice/hybrid): "${message.text.substring(0, 20)}..." (skipTranscript=${!!message.skipTranscript})`);
                            }
                            await this.voiceSideCar.handleTextInput(sessionId, message.text, message.skipTranscript || false);
                        } else if (this.textAdapter) {
                            if (DEBUG) {
                                console.log(`[UnifiedRuntime:${this.config.agentId}] 📥 Processing text_input (text mode): "${message.text.substring(0, 20)}..."`);
                            }
                            await this.textAdapter.handleUserInput(sessionId, message.text);
                        }
                        break;

                    case 'end_audio':
                        // End audio input stream
                        if (this.voiceSideCar) {
                            await this.voiceSideCar.endAudioInput(sessionId);
                        }
                        break;

                    case 'update_config':
                        // Update session configuration
                        if (this.voiceSideCar) {
                            this.voiceSideCar.updateSessionConfig(sessionId, message.config);
                        }
                        break;

                    default:
                        if (DEBUG) {
                            console.warn(`[UnifiedRuntime:${this.config.agentId}] Unknown message type: ${message.type}`);
                        }
                }
            }
        } catch (error: any) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Error handling message: ${error.message}`);

            // Track error for circuit breaker
            session.errorCount = (session.errorCount || 0) + 1;
            session.lastError = Date.now();

            // Send error to client
            if (session.ws.readyState === session.ws.OPEN) {
                session.ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Error processing message',
                    details: error.message,
                    errorCount: session.errorCount
                }));
            }
        }
    }

    /**
     * Handle session disconnect
     */
    public async handleDisconnect(sessionId: string): Promise<void> {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Handling disconnect for session: ${sessionId}`);

        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        try {
            // Stop adapters based on mode
            if (this.config.mode === 'voice' && this.voiceSideCar) {
                await this.voiceSideCar.stopVoiceSession(sessionId);
            } else if (this.config.mode === 'text' && this.textAdapter) {
                await this.textAdapter.stopTextSession(sessionId);
            } else if (this.config.mode === 'hybrid') {
                // FIXED: In hybrid mode, only voice adapter was started
                if (this.voiceSideCar) {
                    await this.voiceSideCar.stopVoiceSession(sessionId);
                }
                // DO NOT stop text adapter - it was never started
            }

            // Remove session
            this.sessions.delete(sessionId);

            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Session disconnected: ${sessionId}`);

        } catch (error: any) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Error during disconnect: ${error.message}`);

            // Force cleanup
            this.sessions.delete(sessionId);
        }
    }

    /**
     * Register with Gateway
     */
    public async registerWithGateway(): Promise<void> {
        const gatewayUrl = this.config.gatewayUrl || 'http://gateway:8080';

        console.log(`[UnifiedRuntime:${this.config.agentId}] Registering with Gateway: ${gatewayUrl}`);

        try {
            // Determine agent URL based on gateway URL
            // If gateway is localhost, use localhost for agent too (local mode)
            // Otherwise use Docker hostname (Docker mode)
            const isLocalMode = gatewayUrl.includes('localhost') || gatewayUrl.includes('127.0.0.1');
            const agentUrl = isLocalMode
                ? `ws://localhost:${this.config.agentPort}`
                : `ws://agent-${this.config.agentId}:${this.config.agentPort}`;

            const response = await axios.post(`${gatewayUrl}/api/agents/register`, {
                id: this.config.agentId,
                url: agentUrl,
                port: this.config.agentPort,
                capabilities: {
                    voice: this.config.mode === 'voice' || this.config.mode === 'hybrid',
                    text: this.config.mode === 'text' || this.config.mode === 'hybrid',
                    mode: this.config.mode,
                    personaId: this.personaConfig?.id || this.config.agentId,
                    tools: this.agentCore?.getAllTools().map(t => t.toolSpec.name) || []
                }
            });

            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Registered with Gateway`);

        } catch (error: any) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Failed to register with Gateway: ${error.message}`);
            if (error.response) {
                console.error(`[UnifiedRuntime:${this.config.agentId}] Response status: ${error.response.status}`);
                console.error(`[UnifiedRuntime:${this.config.agentId}] Response data:`, error.response.data);
            }
            // Don't throw - allow agent to run without Gateway
        }
    }

    /**
     * Send heartbeat to Gateway
     */
    public async sendHeartbeat(): Promise<void> {
        const gatewayUrl = this.config.gatewayUrl || 'http://gateway:8080';

        try {
            await axios.post(`${gatewayUrl}/api/agents/heartbeat`, {
                agentId: this.config.agentId,
                activeSessions: this.sessions.size,
                uptime: process.uptime()
            });
        } catch (error: any) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Heartbeat failed: ${error.message}`);
            if (error.response) {
                console.error(`[UnifiedRuntime:${this.config.agentId}] Heartbeat response status: ${error.response.status}`);
                console.error(`[UnifiedRuntime:${this.config.agentId}] Heartbeat response data:`, error.response.data);
            }
        }
    }

    /**
     * Start heartbeat interval
     */
    private startHeartbeat(): void {
        // Send heartbeat every 15 seconds
        this.heartbeatInterval = setInterval(() => {
            if (!this.isShuttingDown) {
                this.sendHeartbeat();
            }
        }, 15000);

        console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Heartbeat started`);
    }

    /**
     * Get active session count
     */
    public getActiveSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Get runtime mode
     */
    public getMode(): RuntimeMode {
        return this.config.mode;
    }
}

// Main entry point
if (require.main === module) {
    // Load configuration from environment
    const MODE = (process.env.MODE || 'voice') as RuntimeMode;
    const AGENT_ID = process.env.AGENT_ID || 'unknown';
    const AGENT_PORT = parseInt(process.env.AGENT_PORT || '8081');
    const WORKFLOW_FILE = process.env.WORKFLOW_FILE || '/app/workflow.json';

    const config: UnifiedRuntimeConfig = {
        mode: MODE,
        agentId: AGENT_ID,
        agentPort: AGENT_PORT,
        workflowFile: WORKFLOW_FILE,
        awsConfig: {
            region: process.env.AWS_REGION || 'us-east-1',
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        },
        gatewayUrl: process.env.GATEWAY_URL || 'http://gateway:8080',
        localToolsUrl: process.env.LOCAL_TOOLS_URL || 'http://local-tools:9000',
        agentCoreUrl: process.env.AGENTCORE_GATEWAY_URL  // Fixed: was AGENTCORE_URL
    };

    // Create and start runtime
    const runtime = new UnifiedRuntime(config);

    runtime.start().catch((error) => {
        console.error(`[UnifiedRuntime:${AGENT_ID}] Fatal error:`, error);
        process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
        console.log(`[UnifiedRuntime:${AGENT_ID}] Received SIGTERM, shutting down gracefully...`);
        await runtime.stop();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log(`[UnifiedRuntime:${AGENT_ID}] Received SIGINT, shutting down gracefully...`);
        await runtime.stop();
        process.exit(0);
    });
}
