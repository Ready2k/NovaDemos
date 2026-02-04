"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiedRuntime = void 0;
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const http_1 = require("http");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
// Core components
const agent_core_1 = require("./agent-core");
const voice_sidecar_1 = require("./voice-sidecar");
const text_adapter_1 = require("./text-adapter");
// Supporting services
const graph_executor_1 = require("./graph-executor");
const tools_client_1 = require("./tools-client");
const decision_evaluator_1 = require("./decision-evaluator");
const persona_loader_1 = require("./persona-loader");
/**
 * Unified Runtime - Single entry point for all agent modes
 */
class UnifiedRuntime {
    constructor(config) {
        // Core components
        this.agentCore = null;
        this.voiceSideCar = null;
        this.textAdapter = null;
        // Workflow and persona
        this.workflowDef = null;
        this.personaConfig = null;
        this.personaPrompt = '';
        this.graphExecutor = null;
        this.wss = null;
        // Session management
        this.sessions = new Map();
        // Gateway integration
        this.heartbeatInterval = null;
        this.isShuttingDown = false;
        this.config = config;
        // Initialize Express app
        this.app = (0, express_1.default)();
        this.app.use(express_1.default.json());
        // Initialize supporting services
        this.toolsClient = new tools_client_1.ToolsClient(config.localToolsUrl || 'http://local-tools:9000', config.agentCoreUrl);
        this.decisionEvaluator = new decision_evaluator_1.DecisionEvaluator(config.awsConfig?.region || 'us-east-1');
        // Determine base directories (Docker vs local)
        const isDocker = fs.existsSync('/app');
        const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
        this.personaLoader = new persona_loader_1.PersonaLoader(config.personasDir || path.join(BASE_DIR, 'backend/personas'), config.promptsDir || path.join(BASE_DIR, 'backend/prompts'));
        console.log(`[UnifiedRuntime:${config.agentId}] Initialized in ${config.mode} mode`);
    }
    /**
     * Start the runtime
     * Loads configuration, initializes components, and starts server
     */
    async start() {
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
        }
        catch (error) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] ❌ Failed to start: ${error.message}`);
            throw error;
        }
    }
    /**
     * Stop the runtime
     * Gracefully shuts down all components
     */
    async stop() {
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
        }
        catch (error) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Error during shutdown: ${error.message}`);
        }
    }
    /**
     * Load workflow definition and persona configuration
     */
    async loadConfiguration() {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Loading configuration...`);
        // Load workflow definition
        if (!fs.existsSync(this.config.workflowFile)) {
            throw new Error(`Workflow file not found: ${this.config.workflowFile}`);
        }
        try {
            this.workflowDef = JSON.parse(fs.readFileSync(this.config.workflowFile, 'utf-8'));
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Loaded workflow from ${this.config.workflowFile}`);
        }
        catch (error) {
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
            }
            else {
                console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  Failed to load persona: ${personaResult.error}`);
            }
        }
        // Initialize graph executor
        if (this.workflowDef) {
            try {
                this.graphExecutor = new graph_executor_1.GraphExecutor(this.workflowDef);
                console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Graph executor initialized`);
            }
            catch (error) {
                console.error(`[UnifiedRuntime:${this.config.agentId}] Failed to initialize graph executor: ${error.message}`);
            }
        }
    }
    /**
     * Validate configuration based on mode
     */
    validateConfiguration() {
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
    initializeAgentCore() {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Initializing Agent Core...`);
        const agentCoreConfig = {
            agentId: this.config.agentId,
            workflowDef: this.workflowDef,
            personaConfig: this.personaConfig,
            toolsClient: this.toolsClient,
            decisionEvaluator: this.decisionEvaluator,
            graphExecutor: this.graphExecutor,
            localToolsUrl: this.config.localToolsUrl,
            langfuseConfig: {
                publicKey: process.env.LANGFUSE_PUBLIC_KEY,
                secretKey: process.env.LANGFUSE_SECRET_KEY,
                baseUrl: process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
                enabled: process.env.LANGFUSE_ENABLED !== 'false'
            }
        };
        this.agentCore = new agent_core_1.AgentCore(agentCoreConfig);
        // Set persona prompt if available
        if (this.personaPrompt) {
            this.agentCore.setPersonaPrompt(this.personaPrompt);
        }
        console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Agent Core initialized`);
    }
    /**
     * Initialize adapters based on mode
     */
    initializeAdapters() {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Initializing adapters for ${this.config.mode} mode...`);
        if (!this.agentCore) {
            throw new Error('Agent Core must be initialized before adapters');
        }
        // Initialize Voice Side-Car for voice or hybrid mode
        if (this.config.mode === 'voice' || this.config.mode === 'hybrid') {
            const sonicConfig = {
                region: this.config.awsConfig.region,
                accessKeyId: this.config.awsConfig.accessKeyId,
                secretAccessKey: this.config.awsConfig.secretAccessKey,
                sessionToken: this.config.awsConfig?.sessionToken,
                modelId: 'amazon.nova-2-sonic-v1:0'
            };
            const voiceSideCarConfig = {
                agentCore: this.agentCore,
                sonicConfig
            };
            this.voiceSideCar = new voice_sidecar_1.VoiceSideCar(voiceSideCarConfig);
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Voice Side-Car initialized`);
        }
        // Initialize Text Adapter for text or hybrid mode
        if (this.config.mode === 'text' || this.config.mode === 'hybrid') {
            // Text mode also needs SonicClient for LLM invocation
            const sonicConfig = {
                region: this.config.awsConfig.region,
                accessKeyId: this.config.awsConfig.accessKeyId,
                secretAccessKey: this.config.awsConfig.secretAccessKey,
                sessionToken: this.config.awsConfig?.sessionToken,
                modelId: 'amazon.nova-2-sonic-v1:0'
            };
            const textAdapterConfig = {
                agentCore: this.agentCore,
                sonicConfig // Pass SonicConfig for LLM invocation
            };
            this.textAdapter = new text_adapter_1.TextAdapter(textAdapterConfig);
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Text Adapter initialized with SonicClient`);
        }
    }
    /**
     * Start HTTP and WebSocket server
     */
    async startServer() {
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
        this.server = (0, http_1.createServer)(this.app);
        // Create WebSocket server
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        // Handle WebSocket connections
        this.wss.on('connection', (ws) => {
            this.handleConnection(ws);
        });
        // Start listening
        return new Promise((resolve, reject) => {
            this.server.listen(this.config.agentPort, () => {
                console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Server listening on port ${this.config.agentPort}`);
                resolve();
            });
            this.server.on('error', (error) => {
                console.error(`[UnifiedRuntime:${this.config.agentId}] Server error: ${error.message}`);
                reject(error);
            });
        });
    }
    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws) {
        console.log(`[UnifiedRuntime:${this.config.agentId}] New WebSocket connection`);
        let sessionId = null;
        // Handle messages
        ws.on('message', async (data) => {
            try {
                // Determine if this is binary (audio) or text (JSON)
                const isBinary = Buffer.isBuffer(data) && data.length > 0 && data[0] !== 0x7B; // 0x7B is '{'
                if (isBinary) {
                    // Binary data - audio chunk
                    if (sessionId && (this.config.mode === 'voice' || this.config.mode === 'hybrid')) {
                        await this.handleMessage(sessionId, data, true);
                    }
                }
                else {
                    // Text data - JSON message
                    const message = JSON.parse(data.toString());
                    // Debug: Log all incoming messages
                    console.log(`[UnifiedRuntime:${this.config.agentId}] 📨 Received message type: ${message.type}, sessionId=${sessionId}`);
                    // Handle session initialization
                    if (message.type === 'session_init') {
                        const newSessionId = message.sessionId || `session-${Date.now()}`;
                        sessionId = newSessionId;
                        const memory = message.memory || {};
                        await this.initializeSession(newSessionId, ws, memory);
                    }
                    else if (message.type === 'memory_update') {
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
                                        }
                                        else if (message.graphState.account) {
                                            console.log(`[UnifiedRuntime:${this.config.agentId}] ⏳ PARTIAL: Have account ${message.graphState.account}`);
                                        }
                                        else if (message.graphState.sortCode) {
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
                                            }
                                            else {
                                                console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  Cannot update system prompt: voiceSession or sonicClient not found`);
                                            }
                                        }
                                        else {
                                            console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  Cannot update system prompt: voiceSideCar not initialized`);
                                        }
                                        // Update text session if active (for hybrid mode)
                                        if (this.textAdapter) {
                                            // Text adapter will get updated prompt on next message automatically
                                            console.log(`[UnifiedRuntime:${this.config.agentId}] 📝 Text adapter will use updated prompt on next message`);
                                        }
                                    }
                                }
                            }
                            else {
                                console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  Session not found for memory update: ${targetSessionId}`);
                            }
                        }
                        else {
                            console.warn(`[UnifiedRuntime:${this.config.agentId}] ⚠️  No sessionId available for memory_update`);
                        }
                    }
                    else if (sessionId) {
                        await this.handleMessage(sessionId, data, false);
                    }
                }
            }
            catch (error) {
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
        ws.on('error', (error) => {
            console.error(`[UnifiedRuntime:${this.config.agentId}] WebSocket error: ${error.message}`);
            if (sessionId) {
                this.handleDisconnect(sessionId);
            }
        });
    }
    /**
     * Initialize a new session
     */
    async initializeSession(sessionId, ws, memory) {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Initializing session: ${sessionId}`);
        try {
            // Store session
            const session = {
                sessionId,
                ws,
                mode: this.config.mode,
                startTime: Date.now(),
                memory
            };
            this.sessions.set(sessionId, session);
            // Initialize based on mode
            if (this.config.mode === 'voice' && this.voiceSideCar) {
                await this.voiceSideCar.startVoiceSession(sessionId, ws, memory);
            }
            else if (this.config.mode === 'text' && this.textAdapter) {
                await this.textAdapter.startTextSession(sessionId, ws, memory);
            }
            else if (this.config.mode === 'hybrid') {
                // In hybrid mode, start both adapters
                if (this.voiceSideCar) {
                    await this.voiceSideCar.startVoiceSession(sessionId, ws, memory);
                }
                if (this.textAdapter) {
                    await this.textAdapter.startTextSession(sessionId, ws, memory);
                }
            }
            // CRITICAL: Auto-trigger agents with context from memory
            // If this is an IDV agent with account details in memory, send automatic trigger
            // This simulates the user providing their details so the agent can verify immediately
            // IMPORTANT: Only auto-trigger if this is the FIRST attempt (no previous IDV attempts)
            if (this.config.agentId === 'idv' && memory && memory.account && memory.sortCode) {
                const isFirstAttempt = !memory.graphState || !memory.graphState.idvAttempts || memory.graphState.idvAttempts === 0;
                if (isFirstAttempt) {
                    console.log(`[UnifiedRuntime:${this.config.agentId}] 🚀 Auto-triggering IDV agent with account details from memory (first attempt)`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    Account: ${memory.account}, Sort Code: ${memory.sortCode}`);
                    // Send trigger via voice session with explicit account details
                    // This mimics what the user would say, prompting immediate verification
                    const triggerMessage = `I need to verify account ${memory.account} with sort code ${memory.sortCode}`;
                    if (this.voiceSideCar) {
                        setImmediate(() => {
                            this.voiceSideCar.handleTextInput(sessionId, triggerMessage).catch(error => {
                                console.error(`[UnifiedRuntime:${this.config.agentId}] Error sending auto-trigger: ${error.message}`);
                            });
                        });
                    }
                }
                else {
                    console.log(`[UnifiedRuntime:${this.config.agentId}] ⏸️  Skipping auto-trigger (retry attempt ${memory.graphState.idvAttempts})`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    Waiting for user to provide corrected details`);
                }
            }
            // CRITICAL: Auto-trigger banking agent with verified user and intent
            // If this is a banking agent with verified user and intent in memory, send automatic trigger
            if (this.config.agentId === 'banking' && memory) {
                const hasVerifiedUser = memory.verified && memory.userName;
                const hasIntent = memory.userIntent;
                const hasAccountDetails = memory.account && memory.sortCode;
                if (hasVerifiedUser && (hasIntent || hasAccountDetails)) {
                    console.log(`[UnifiedRuntime:${this.config.agentId}] 🚀 Auto-triggering Banking agent with verified user and intent`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    User: ${memory.userName}, Intent: ${hasIntent ? memory.userIntent : 'check balance'}`);
                    console.log(`[UnifiedRuntime:${this.config.agentId}]    Account: ${memory.account}, Sort Code: ${memory.sortCode}`);
                    // Send trigger via voice session with explicit request
                    // This mimics what the user would say, prompting immediate action
                    const intent = memory.userIntent || 'check my balance';
                    const triggerMessage = `I want to ${intent}`;
                    if (this.voiceSideCar) {
                        setImmediate(() => {
                            this.voiceSideCar.handleTextInput(sessionId, triggerMessage).catch(error => {
                                console.error(`[UnifiedRuntime:${this.config.agentId}] Error sending auto-trigger: ${error.message}`);
                            });
                        });
                    }
                }
            }
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Session initialized: ${sessionId}`);
        }
        catch (error) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Failed to initialize session: ${error.message}`);
            // Clean up on error
            this.sessions.delete(sessionId);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to initialize session',
                details: error.message
            }));
        }
    }
    /**
     * Handle incoming message (audio or text)
     */
    async handleMessage(sessionId, data, isBinary) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[UnifiedRuntime:${this.config.agentId}] Message for unknown session: ${sessionId}`);
            return;
        }
        try {
            if (isBinary) {
                // Binary data - audio chunk
                if (this.voiceSideCar) {
                    await this.voiceSideCar.handleAudioChunk(sessionId, data);
                }
            }
            else {
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
                        // Hybrid mode - text input to voice session
                        if (this.voiceSideCar) {
                            await this.voiceSideCar.handleTextInput(sessionId, message.text);
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
                        console.warn(`[UnifiedRuntime:${this.config.agentId}] Unknown message type: ${message.type}`);
                }
            }
        }
        catch (error) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Error handling message: ${error.message}`);
        }
    }
    /**
     * Handle session disconnect
     */
    async handleDisconnect(sessionId) {
        console.log(`[UnifiedRuntime:${this.config.agentId}] Handling disconnect for session: ${sessionId}`);
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }
        try {
            // Stop adapters based on mode
            if (this.config.mode === 'voice' && this.voiceSideCar) {
                await this.voiceSideCar.stopVoiceSession(sessionId);
            }
            else if (this.config.mode === 'text' && this.textAdapter) {
                await this.textAdapter.stopTextSession(sessionId);
            }
            else if (this.config.mode === 'hybrid') {
                if (this.voiceSideCar) {
                    await this.voiceSideCar.stopVoiceSession(sessionId);
                }
                if (this.textAdapter) {
                    await this.textAdapter.stopTextSession(sessionId);
                }
            }
            // Remove session
            this.sessions.delete(sessionId);
            console.log(`[UnifiedRuntime:${this.config.agentId}] ✅ Session disconnected: ${sessionId}`);
        }
        catch (error) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Error during disconnect: ${error.message}`);
            // Force cleanup
            this.sessions.delete(sessionId);
        }
    }
    /**
     * Register with Gateway
     */
    async registerWithGateway() {
        const gatewayUrl = this.config.gatewayUrl || 'http://gateway:8080';
        console.log(`[UnifiedRuntime:${this.config.agentId}] Registering with Gateway: ${gatewayUrl}`);
        try {
            const agentUrl = `ws://agent-${this.config.agentId}:${this.config.agentPort}`;
            const response = await axios_1.default.post(`${gatewayUrl}/api/agents/register`, {
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
        }
        catch (error) {
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
    async sendHeartbeat() {
        const gatewayUrl = this.config.gatewayUrl || 'http://gateway:8080';
        try {
            await axios_1.default.post(`${gatewayUrl}/api/agents/heartbeat`, {
                agentId: this.config.agentId,
                activeSessions: this.sessions.size,
                uptime: process.uptime()
            });
        }
        catch (error) {
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
    startHeartbeat() {
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
    getActiveSessionCount() {
        return this.sessions.size;
    }
    /**
     * Get runtime mode
     */
    getMode() {
        return this.config.mode;
    }
}
exports.UnifiedRuntime = UnifiedRuntime;
// Main entry point
if (require.main === module) {
    // Load configuration from environment
    const MODE = (process.env.MODE || 'voice');
    const AGENT_ID = process.env.AGENT_ID || 'unknown';
    const AGENT_PORT = parseInt(process.env.AGENT_PORT || '8081');
    const WORKFLOW_FILE = process.env.WORKFLOW_FILE || '/app/workflow.json';
    const config = {
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
        agentCoreUrl: process.env.AGENTCORE_URL
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
