"use strict";
/**
 * Agent Core - Voice-Agnostic Business Logic
 *
 * This module contains the core agent business logic that is independent of I/O mechanisms.
 * It handles LangGraph workflow execution, tool calling, state management, handoffs, and
 * session memory without any dependency on SonicClient or WebSocket implementations.
 *
 * The Agent Core can be wrapped with Voice Side-Car or Text Adapter to enable voice or text I/O.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentCore = void 0;
const workflow_utils_1 = require("./workflow-utils");
const handoff_tools_1 = require("./handoff-tools");
const banking_tools_1 = require("./banking-tools");
const gateway_router_1 = require("./gateway-router");
const axios_1 = __importDefault(require("axios"));
const langfuse_1 = require("langfuse");
/**
 * Agent Core - Voice-agnostic business logic
 */
class AgentCore {
    constructor(config) {
        // Gateway routing
        this.gatewayRouter = null;
        // Session storage
        this.sessions = new Map();
        // Persona prompt (loaded from persona config)
        this.personaPrompt = '';
        // Langfuse observability
        this.langfuse = null;
        this.langfuseEnabled = false;
        this.agentId = config.agentId;
        this.workflowDef = config.workflowDef;
        this.personaConfig = config.personaConfig;
        this.toolsClient = config.toolsClient;
        this.decisionEvaluator = config.decisionEvaluator;
        this.graphExecutor = config.graphExecutor;
        this.localToolsUrl = config.localToolsUrl || 'http://local-tools:9000';
        // Initialize Gateway Router if configured
        if (config.gatewayUrl) {
            this.gatewayRouter = new gateway_router_1.GatewayRouter({
                gatewayUrl: config.gatewayUrl,
                agentId: config.agentId,
                timeout: 5000
            });
            console.log(`[AgentCore:${this.agentId}] Gateway Router initialized`);
        }
        // Initialize Langfuse if configured
        if (config.langfuseConfig?.enabled !== false &&
            config.langfuseConfig?.publicKey &&
            config.langfuseConfig?.secretKey) {
            try {
                this.langfuse = new langfuse_1.Langfuse({
                    publicKey: config.langfuseConfig.publicKey,
                    secretKey: config.langfuseConfig.secretKey,
                    baseUrl: config.langfuseConfig.baseUrl || 'https://cloud.langfuse.com'
                });
                this.langfuseEnabled = true;
                console.log(`[AgentCore:${this.agentId}] Langfuse observability enabled`);
            }
            catch (error) {
                console.warn(`[AgentCore:${this.agentId}] Failed to initialize Langfuse: ${error.message}`);
                this.langfuseEnabled = false;
            }
        }
        else {
            console.log(`[AgentCore:${this.agentId}] Langfuse observability disabled`);
        }
        console.log(`[AgentCore:${this.agentId}] Initialized`);
    }
    /**
     * Initialize a new session
     */
    initializeSession(sessionId, memory) {
        console.log(`[AgentCore:${this.agentId}] Initializing session: ${sessionId}`);
        console.log(`[AgentCore:${this.agentId}] Memory received:`, JSON.stringify(memory, null, 2));
        const session = {
            sessionId,
            startTime: Date.now(),
            messages: [],
            currentNode: this.workflowDef?.nodes?.find((n) => n.type === 'start')?.id,
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0
        };
        // Create Langfuse trace for this session (Requirement 11.2)
        if (this.langfuseEnabled && this.langfuse) {
            try {
                session.langfuseTrace = this.langfuse.trace({
                    id: sessionId,
                    name: 'agent-session',
                    sessionId: sessionId,
                    metadata: {
                        agentId: this.agentId,
                        personaId: this.personaConfig?.id,
                        workflowId: this.workflowDef?.id,
                        mode: 'voice-agnostic'
                    },
                    tags: ['agent-core', this.agentId]
                });
                console.log(`[AgentCore:${this.agentId}] Created Langfuse trace for session: ${sessionId}`);
            }
            catch (error) {
                console.warn(`[AgentCore:${this.agentId}] Failed to create Langfuse trace: ${error.message}`);
            }
        }
        // Restore verified user from memory if available
        if (memory && memory.verified) {
            session.verifiedUser = {
                customer_name: memory.userName,
                account: memory.account,
                sortCode: memory.sortCode,
                auth_status: 'VERIFIED'
            };
            console.log(`[AgentCore:${this.agentId}] Restored verified user: ${memory.userName}`);
        }
        // Store user intent from memory
        if (memory && memory.userIntent) {
            session.userIntent = memory.userIntent;
            console.log(`[AgentCore:${this.agentId}] Stored user intent: ${memory.userIntent}`);
        }
        // Hydrate graph state from memory if available
        if (memory && memory.graphState && this.graphExecutor) {
            console.log(`[AgentCore:${this.agentId}] Hydrating graph state from memory`);
            this.graphExecutor.hydrateState(memory.graphState);
            // CRITICAL: Store graphState in session so it's available in system prompt
            session.graphState = memory.graphState;
            if (memory.graphState.currentNodeId) {
                session.currentNode = memory.graphState.currentNodeId;
                console.log(`[AgentCore:${this.agentId}] Resuming from node: ${memory.graphState.currentNodeId}`);
            }
            // Log account details if present
            if (memory.graphState.account || memory.graphState.sortCode) {
                console.log(`[AgentCore:${this.agentId}] Account details from memory: ${memory.graphState.account || 'N/A'}, ${memory.graphState.sortCode || 'N/A'}`);
            }
        }
        // CRITICAL: Also check for account details directly in memory (not just graphState)
        if (memory && (memory.account || memory.sortCode)) {
            if (!session.graphState) {
                session.graphState = {};
            }
            if (memory.account) {
                session.graphState.account = memory.account;
            }
            if (memory.sortCode) {
                session.graphState.sortCode = memory.sortCode;
            }
            console.log(`[AgentCore:${this.agentId}] Stored account details from memory: ${memory.account || 'N/A'}, ${memory.sortCode || 'N/A'}`);
        }
        this.sessions.set(sessionId, session);
        return session;
    }
    /**
     * Get an existing session
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * End a session and clean up
     */
    endSession(sessionId) {
        console.log(`[AgentCore:${this.agentId}] Ending session: ${sessionId}`);
        const session = this.sessions.get(sessionId);
        // Track session end in Langfuse (Requirement 11.2)
        if (session?.langfuseTrace) {
            try {
                const duration = Date.now() - session.startTime;
                session.langfuseTrace.update({
                    output: {
                        sessionDuration: duration,
                        messageCount: session.messages.length,
                        totalTokens: session.totalTokens,
                        inputTokens: session.inputTokens,
                        outputTokens: session.outputTokens
                    },
                    metadata: {
                        endTime: Date.now(),
                        duration,
                        verifiedUser: session.verifiedUser?.customer_name
                    }
                });
                console.log(`[AgentCore:${this.agentId}] Updated Langfuse trace for session end: ${sessionId}`);
            }
            catch (error) {
                console.warn(`[AgentCore:${this.agentId}] Failed to update Langfuse trace: ${error.message}`);
            }
        }
        this.sessions.delete(sessionId);
    }
    /**
     * Process a user message (text input)
     * This is called by adapters when they receive user input
     */
    async processUserMessage(sessionId, message) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return {
                type: 'error',
                content: 'Session not found',
                error: 'Session not found'
            };
        }
        // Track user input in Langfuse (Requirement 11.3)
        if (session.langfuseTrace) {
            try {
                session.langfuseTrace.event({
                    name: 'user-input',
                    input: message,
                    metadata: {
                        timestamp: Date.now(),
                        messageIndex: session.messages.length
                    }
                });
            }
            catch (error) {
                console.warn(`[AgentCore:${this.agentId}] Failed to track user input: ${error.message}`);
            }
        }
        // Store user message
        session.messages.push({
            role: 'user',
            content: message,
            timestamp: Date.now()
        });
        // Generate response using Claude Sonnet
        return await this.generateResponse(sessionId, message);
    }
    /**
     * Generate a response using Claude Sonnet
     * This makes Agent Core voice-agnostic - it can generate responses without Nova Sonic
     *
     * @param sessionId Session identifier
     * @param userMessage User's message
     * @returns Agent response (text, tool_call, handoff, or error)
     */
    async generateResponse(sessionId, userMessage) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return {
                type: 'error',
                content: 'Session not found',
                error: 'Session not found'
            };
        }
        try {
            console.log(`[AgentCore:${this.agentId}] Generating response for: "${userMessage.substring(0, 50)}..."`);
            // Build system prompt with context
            const systemPrompt = this.getSystemPrompt(sessionId);
            // Build conversation history for Claude
            const messages = this.buildClaudeMessages(session);
            // Get available tools
            const tools = this.getAllTools();
            // Detect if this is a situation where we should force tool usage
            // Force tool use when:
            // 1. Triage agent + user asking for account-specific info
            // 2. IDV agent + user provided BOTH account number AND sort code (8 digits + 6 digits)
            // 3. Banking agent + user asking for balance/transactions
            // For IDV: Only force if we have both 8-digit and 6-digit numbers
            const has8Digits = /\b\d{8}\b/.test(userMessage);
            const has6Digits = /\b\d{6}\b/.test(userMessage);
            const hasBothCredentials = has8Digits && has6Digits;
            const shouldForceToolUse = (this.agentId === 'triage' &&
                (userMessage.toLowerCase().includes('balance') ||
                    userMessage.toLowerCase().includes('transaction') ||
                    userMessage.toLowerCase().includes('payment') ||
                    userMessage.toLowerCase().includes('dispute') ||
                    userMessage.toLowerCase().includes('fraud'))) ||
                (this.agentId === 'idv' && hasBothCredentials) || // Only force if BOTH credentials present
                (this.agentId === 'banking' &&
                    (userMessage.toLowerCase().includes('balance') ||
                        userMessage.toLowerCase().includes('transaction')));
            // Call Claude Sonnet via Bedrock Converse API
            const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
            const bedrockClient = new BedrockRuntimeClient({
                region: process.env.AWS_REGION || 'us-east-1'
            });
            const converseParams = {
                modelId: 'us.amazon.nova-2-lite-v1:0',
                messages: messages,
                system: [{ text: systemPrompt }],
                inferenceConfig: {
                    maxTokens: 2048,
                    temperature: 0.7,
                    topP: 0.9
                },
                toolConfig: tools.length > 0 ? {
                    tools: tools.map(tool => ({
                        toolSpec: {
                            ...tool.toolSpec,
                            inputSchema: {
                                json: typeof tool.toolSpec.inputSchema.json === 'string'
                                    ? JSON.parse(tool.toolSpec.inputSchema.json)
                                    : tool.toolSpec.inputSchema.json
                            }
                        }
                    })),
                    // Force tool usage for routing scenarios
                    toolChoice: shouldForceToolUse ? { any: {} } : { auto: {} }
                } : undefined
            };
            const command = new ConverseCommand(converseParams);
            if (shouldForceToolUse) {
                console.log(`[AgentCore:${this.agentId}] 🔧 Forcing tool usage with toolChoice: any`);
            }
            console.log(`[AgentCore:${this.agentId}] Calling Claude Sonnet...`);
            const response = await bedrockClient.send(command);
            // Parse response
            if (response.output?.message) {
                const message = response.output.message;
                // Check for tool use
                if (message.content) {
                    for (const content of message.content) {
                        if (content.toolUse) {
                            console.log(`[AgentCore:${this.agentId}] Claude requested tool: ${content.toolUse.name}`);
                            // Return tool call response
                            return {
                                type: 'tool_call',
                                content: '',
                                toolCalls: [{
                                        toolName: content.toolUse.name,
                                        toolUseId: content.toolUse.toolUseId,
                                        input: content.toolUse.input,
                                        timestamp: Date.now()
                                    }]
                            };
                        }
                        if (content.text) {
                            const responseText = content.text;
                            console.log(`[AgentCore:${this.agentId}] Claude response: "${responseText.substring(0, 100)}..."`);
                            // Store assistant response
                            this.trackAssistantResponse(sessionId, responseText);
                            return {
                                type: 'text',
                                content: responseText
                            };
                        }
                    }
                }
            }
            // Fallback
            return {
                type: 'error',
                content: 'No response from Claude',
                error: 'Empty response'
            };
        }
        catch (error) {
            console.error(`[AgentCore:${this.agentId}] Error generating response:`, error);
            return {
                type: 'error',
                content: 'Failed to generate response',
                error: error.message
            };
        }
    }
    /**
     * Build Claude-compatible message history
     * Converts session messages to Claude's expected format
     */
    buildClaudeMessages(session) {
        const messages = [];
        // Convert session messages to Claude format
        for (const msg of session.messages) {
            // Check if this is a tool use or tool result message
            if (msg.metadata?.type === 'tool_use') {
                // Parse tool use from content
                try {
                    const toolUseData = JSON.parse(msg.content);
                    messages.push({
                        role: 'assistant',
                        content: [{
                                toolUse: {
                                    toolUseId: toolUseData.toolUse.toolUseId,
                                    name: toolUseData.toolUse.name,
                                    input: toolUseData.toolUse.input
                                }
                            }]
                    });
                }
                catch (error) {
                    console.warn(`[AgentCore:${this.agentId}] Failed to parse tool use message:`, error);
                }
            }
            else if (msg.metadata?.type === 'tool_result') {
                // Parse tool result from content
                try {
                    const toolResultData = JSON.parse(msg.content);
                    messages.push({
                        role: 'user',
                        content: [{
                                toolResult: {
                                    toolUseId: toolResultData.toolResult.toolUseId,
                                    content: [{
                                            json: toolResultData.toolResult.content
                                        }],
                                    status: toolResultData.toolResult.status
                                }
                            }]
                    });
                }
                catch (error) {
                    console.warn(`[AgentCore:${this.agentId}] Failed to parse tool result message:`, error);
                }
            }
            else {
                // Regular text message
                messages.push({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: [{ text: msg.content }]
                });
            }
        }
        return messages;
    }
    /**
     * Execute a tool with comprehensive pipeline:
     * 1. Detect tool type (handoff, banking, knowledge base, etc.)
     * 2. Validate tool input against tool schema
     * 3. Route tool to appropriate service (local-tools, AgentCore)
     * 4. Execute tool via ToolsClient
     * 5. Handle tool results and errors
     * 6. Track tool execution in Langfuse (TODO)
     *
     * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.7
     */
    async executeTool(sessionId, toolName, toolInput, toolUseId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return {
                success: false,
                result: null,
                error: 'Session not found'
            };
        }
        // Circuit Breaker: Prevent infinite tool loops
        const MAX_TOOL_CALLS_PER_TOOL = 5; // Max calls for same tool
        const TOOL_CALL_WINDOW_MS = 30000; // 30 second window
        // Initialize tool call tracking if not exists
        if (!session.toolCallCounts) {
            session.toolCallCounts = new Map();
        }
        // Get current count for this tool
        const currentCount = session.toolCallCounts.get(toolName) || 0;
        const now = Date.now();
        // Reset counts if outside the time window
        if (session.lastToolCallTime && (now - session.lastToolCallTime) > TOOL_CALL_WINDOW_MS) {
            console.log(`[AgentCore:${this.agentId}] Resetting tool call counts (window expired)`);
            session.toolCallCounts.clear();
        }
        // Check if we've exceeded the limit
        if (currentCount >= MAX_TOOL_CALLS_PER_TOOL) {
            console.error(`[AgentCore:${this.agentId}] ⚠️  CIRCUIT BREAKER TRIGGERED: Tool ${toolName} called ${currentCount} times in ${TOOL_CALL_WINDOW_MS}ms`);
            return {
                success: false,
                result: null,
                error: `Circuit breaker triggered: Tool ${toolName} has been called too many times (${currentCount}/${MAX_TOOL_CALLS_PER_TOOL}). This usually indicates the tool is returning invalid results. Please check the tool configuration and try again.`
            };
        }
        // Increment count and update timestamp
        session.toolCallCounts.set(toolName, currentCount + 1);
        session.lastToolCallTime = now;
        console.log(`[AgentCore:${this.agentId}] Executing tool: ${toolName} (call ${currentCount + 1}/${MAX_TOOL_CALLS_PER_TOOL})`);
        // CRITICAL: Block Multiple Handoff Calls in Same Turn
        // Prevents agents from calling multiple transfer tools (e.g., transfer_to_idv then transfer_to_banking)
        // This enforces the "one handoff per turn" rule
        if ((0, handoff_tools_1.isHandoffTool)(toolName)) {
            // Check if another handoff tool was already called in this turn
            const handoffToolsCalledThisTurn = Array.from(session.toolCallCounts?.keys() || [])
                .filter(key => (0, handoff_tools_1.isHandoffTool)(key) && key !== toolName);
            if (handoffToolsCalledThisTurn.length > 0) {
                console.error(`[AgentCore:${this.agentId}] ❌ BLOCKED: Multiple handoff calls in same turn`);
                console.error(`[AgentCore:${this.agentId}]    Already called: ${handoffToolsCalledThisTurn.join(', ')}`);
                console.error(`[AgentCore:${this.agentId}]    Attempted: ${toolName}`);
                console.error(`[AgentCore:${this.agentId}]    Rule: Only ONE handoff tool per turn allowed`);
                return {
                    success: false,
                    result: null,
                    error: `Multiple handoff calls blocked: Already called ${handoffToolsCalledThisTurn[0]} in this turn. Only one handoff tool can be called per turn. Please wait for the handoff to complete.`
                };
            }
        }
        // CRITICAL: Duplicate IDV Call Blocking
        // Prevent LLM from calling perform_idv_check multiple times with same parameters
        // This ensures the agent waits for user input between retry attempts
        if (toolName === 'perform_idv_check') {
            // Initialize lastIdvCall tracking if not exists
            if (!session.graphState) {
                session.graphState = {};
            }
            // CRITICAL: Block if user is already verified
            // This prevents Nova Sonic from calling perform_idv_check again after successful verification
            if (session.graphState?.verified && session.graphState?.userName) {
                console.error(`[AgentCore:${this.agentId}] ⚠️  IDV CALL BLOCKED: User already verified as ${session.graphState.userName}`);
                console.error(`[AgentCore:${this.agentId}] Account: ${toolInput.accountNumber}, Sort Code: ${toolInput.sortCode}`);
                return {
                    success: false,
                    result: {
                        content: [{
                                text: JSON.stringify({
                                    auth_status: 'ALREADY_VERIFIED',
                                    customer_name: session.graphState.userName,
                                    message: `User is already verified as ${session.graphState.userName}. Do not call perform_idv_check again. Your job is complete - the system will handle routing.`,
                                    requiresUserInput: false
                                })
                            }]
                    },
                    error: 'User already verified - IDV complete'
                };
            }
            // CRITICAL: Block if verification is in progress
            // This prevents Nova Sonic from calling perform_idv_check twice in rapid succession
            if (session.graphState?.idvInProgress) {
                console.error(`[AgentCore:${this.agentId}] ⚠️  IDV CALL BLOCKED: Verification already in progress`);
                console.error(`[AgentCore:${this.agentId}] Account: ${toolInput.accountNumber}, Sort Code: ${toolInput.sortCode}`);
                return {
                    success: false,
                    result: {
                        content: [{
                                text: JSON.stringify({
                                    auth_status: 'IN_PROGRESS',
                                    message: 'Identity verification is already in progress. Please wait for the result.',
                                    requiresUserInput: false
                                })
                            }]
                    },
                    error: 'IDV already in progress'
                };
            }
            const lastCall = session.graphState.lastIdvCall;
            const DUPLICATE_WINDOW_MS = 5000; // 5 second window
            if (lastCall &&
                lastCall.accountNumber === toolInput.accountNumber &&
                lastCall.sortCode === toolInput.sortCode &&
                (now - lastCall.timestamp) < DUPLICATE_WINDOW_MS) {
                console.error(`[AgentCore:${this.agentId}] ⚠️  DUPLICATE IDV CALL BLOCKED: Same credentials called ${now - lastCall.timestamp}ms ago`);
                console.error(`[AgentCore:${this.agentId}] Account: ${toolInput.accountNumber}, Sort Code: ${toolInput.sortCode}`);
                return {
                    success: false,
                    result: {
                        content: [{
                                text: JSON.stringify({
                                    auth_status: 'BLOCKED',
                                    message: 'Please wait for user to provide corrected details before retrying verification. Do not call perform_idv_check again with the same credentials.',
                                    requiresUserInput: true
                                })
                            }]
                    },
                    error: 'Duplicate IDV call blocked - waiting for user input'
                };
            }
            // Set in-progress flag BEFORE executing
            session.graphState.idvInProgress = true;
            console.log(`[AgentCore:${this.agentId}] 🔒 Set IDV in-progress flag`);
            // Store this call for duplicate detection
            session.graphState.lastIdvCall = {
                accountNumber: toolInput.accountNumber,
                sortCode: toolInput.sortCode,
                timestamp: now
            };
            console.log(`[AgentCore:${this.agentId}] IDV call recorded for duplicate detection`);
        }
        try {
            // Step 1: Detect tool type (Requirement 8.1)
            const toolType = this.detectToolType(toolName);
            console.log(`[AgentCore:${this.agentId}] Tool type detected: ${toolType}`);
            // Step 2: Validate tool input against schema (Requirement 8.2)
            const validationResult = this.validateToolInput(toolName, toolInput, toolType);
            if (!validationResult.valid) {
                console.error(`[AgentCore:${this.agentId}] Tool input validation failed: ${validationResult.error}`);
                return {
                    success: false,
                    result: null,
                    error: `Invalid tool input: ${validationResult.error}`
                };
            }
            // Step 3 & 4: Route and execute tool (Requirements 8.3, 8.4)
            let executionResult;
            switch (toolType) {
                case 'handoff':
                    executionResult = await this.executeHandoffTool(sessionId, toolName, toolInput);
                    break;
                case 'banking':
                    executionResult = await this.executeBankingTool(sessionId, toolName, toolInput);
                    break;
                case 'knowledge_base':
                    executionResult = await this.executeKnowledgeBaseTool(toolName, toolInput);
                    break;
                case 'local':
                    executionResult = await this.executeLocalTool(toolName, toolInput);
                    break;
                default:
                    // Fallback to ToolsClient for unknown tools
                    const clientResult = await this.toolsClient.executeTool(toolName, toolInput);
                    executionResult = {
                        success: clientResult.success,
                        result: clientResult.result || null,
                        error: clientResult.error
                    };
                    break;
            }
            // Step 5: Handle tool results and errors (Requirement 8.5)
            if (!executionResult.success) {
                console.error(`[AgentCore:${this.agentId}] Tool execution failed: ${executionResult.error}`);
            }
            else {
                console.log(`[AgentCore:${this.agentId}] Tool executed successfully: ${toolName}`);
                console.log(`[AgentCore:${this.agentId}] Tool result:`, JSON.stringify(executionResult.result).substring(0, 200));
            }
            // Step 6: Track tool execution in Langfuse (Requirement 8.7, 11.4)
            this.trackToolExecution(sessionId, toolName, toolInput, toolUseId, executionResult);
            return executionResult;
        }
        catch (error) {
            console.error(`[AgentCore:${this.agentId}] Tool execution error:`, error);
            // Step 5: Handle errors gracefully (Requirement 8.5)
            return {
                success: false,
                result: null,
                error: error.message || 'Unknown tool execution error'
            };
        }
    }
    /**
     * Detect tool type from tool name
     * Requirement 8.1: Agent Core must detect tool type from tool calls
     */
    detectToolType(toolName) {
        // Check handoff tools
        if ((0, handoff_tools_1.isHandoffTool)(toolName)) {
            return 'handoff';
        }
        // Check banking tools
        if ((0, banking_tools_1.isBankingTool)(toolName)) {
            return 'banking';
        }
        // Check knowledge base tools
        if (toolName === 'search_knowledge_base' || toolName.includes('knowledge')) {
            return 'knowledge_base';
        }
        // Check if tool exists in local tools
        // For now, assume other tools are local
        return 'local';
    }
    /**
     * Validate tool input against tool schema
     * Requirement 8.2: Agent Core must validate tool input against tool schema
     */
    validateToolInput(toolName, toolInput, toolType) {
        // Basic validation - check if input is an object
        if (typeof toolInput !== 'object' || toolInput === null) {
            return {
                valid: false,
                error: 'Tool input must be an object'
            };
        }
        // Type-specific validation
        switch (toolType) {
            case 'handoff':
                return this.validateHandoffInput(toolName, toolInput);
            case 'banking':
                return this.validateBankingInput(toolName, toolInput);
            case 'knowledge_base':
                return this.validateKnowledgeBaseInput(toolInput);
            default:
                // For other tools, basic validation is sufficient
                return { valid: true };
        }
    }
    /**
     * Validate handoff tool input
     */
    validateHandoffInput(toolName, input) {
        // Log input for debugging
        console.log(`[AgentCore:${this.agentId}] Validating handoff input for ${toolName}:`, JSON.stringify(input).substring(0, 200));
        if (toolName === 'return_to_triage') {
            if (!input.taskCompleted || typeof input.taskCompleted !== 'string') {
                return { valid: false, error: 'taskCompleted is required and must be a string' };
            }
            if (!input.summary || typeof input.summary !== 'string') {
                return { valid: false, error: 'summary is required and must be a string' };
            }
        }
        else {
            // transfer_to_* tools
            // Reason is optional - will fall back to userIntent or default message
            if (input.reason !== undefined && typeof input.reason !== 'string') {
                return { valid: false, error: 'reason must be a string if provided' };
            }
            // Context is also optional
            if (input.context !== undefined && typeof input.context !== 'string') {
                return { valid: false, error: 'context must be a string if provided' };
            }
        }
        console.log(`[AgentCore:${this.agentId}] ✅ Handoff input validation passed`);
        return { valid: true };
    }
    /**
     * Validate banking tool input
     */
    validateBankingInput(toolName, input) {
        switch (toolName) {
            case 'perform_idv_check':
                if (!input.accountNumber || typeof input.accountNumber !== 'string') {
                    return { valid: false, error: 'accountNumber is required and must be a string' };
                }
                if (!input.sortCode || typeof input.sortCode !== 'string') {
                    return { valid: false, error: 'sortCode is required and must be a string' };
                }
                break;
            case 'agentcore_balance':
            case 'get_account_transactions':
                // These tools typically don't require input or have optional parameters
                break;
            default:
                // Other banking tools - basic validation
                break;
        }
        return { valid: true };
    }
    /**
     * Validate knowledge base tool input
     */
    validateKnowledgeBaseInput(input) {
        if (!input.query || typeof input.query !== 'string') {
            return { valid: false, error: 'query is required and must be a string' };
        }
        return { valid: true };
    }
    /**
     * Execute handoff tool
     * Requirement 8.3: Route tool to appropriate service
     * Requirements 9.1, 9.2, 9.3, 9.4, 9.7: Detect handoff, extract context, build request
     */
    async executeHandoffTool(sessionId, toolName, toolInput) {
        console.log(`[AgentCore:${this.agentId}] 🔄 Executing handoff tool: ${toolName}`);
        console.log(`[AgentCore:${this.agentId}] Handoff input:`, JSON.stringify(toolInput).substring(0, 300));
        // Requirement 9.1: Detect handoff tool calls (transfer_to_*, return_to_triage)
        const isReturnHandoff = toolName === 'return_to_triage';
        // Requirement 9.2: Extract handoff context (reason, verified user, user intent)
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`[AgentCore:${this.agentId}] ❌ Session not found for handoff: ${sessionId}`);
            return {
                success: false,
                result: null,
                error: 'Session not found'
            };
        }
        // CRITICAL: Reset IDV attempts when returning to triage with failure
        if (isReturnHandoff && toolInput.taskCompleted === 'verification_failed') {
            console.log(`[AgentCore:${this.agentId}] 🔄 Resetting IDV attempts (returning to triage with failure)`);
            session.idvAttempts = 0;
            session.lastIdvFailure = undefined;
        }
        // Extract target agent from tool name
        const targetAgent = (0, handoff_tools_1.getTargetAgentFromTool)(toolName);
        if (!targetAgent) {
            console.error(`[AgentCore:${this.agentId}] ❌ Invalid handoff tool: ${toolName}`);
            return {
                success: false,
                result: null,
                error: `Invalid handoff tool: ${toolName}`
            };
        }
        console.log(`[AgentCore:${this.agentId}] Target agent: ${targetAgent}`);
        // Build handoff context
        const handoffContext = {
            reason: toolInput.reason || session.userIntent || 'User needs specialist assistance',
            lastUserMessage: session.messages.length > 0
                ? session.messages[session.messages.length - 1].content
                : ''
        };
        // Requirement 9.7: Handle return handoffs with task completion status
        if (isReturnHandoff) {
            handoffContext.isReturn = true;
            handoffContext.taskCompleted = toolInput.taskCompleted || 'task_complete';
            handoffContext.summary = toolInput.summary || 'Task completed successfully';
            console.log(`[AgentCore:${this.agentId}] Return handoff - Task: ${handoffContext.taskCompleted}`);
            // CRITICAL: Mark IDV as failed in handoff context so triage knows not to retry
            if (toolInput.taskCompleted === 'verification_failed' || toolInput.taskCompleted === 'idv_failed') {
                handoffContext.idvFailed = true;
                console.log(`[AgentCore:${this.agentId}] ⚠️  Marking IDV as failed in handoff context`);
            }
        }
        // Requirement 9.3: Build handoff request with full LangGraph state
        const handoffRequest = this.requestHandoff(sessionId, targetAgent, handoffContext);
        console.log(`[AgentCore:${this.agentId}] ✅ Handoff request built: ${this.agentId} → ${targetAgent}`);
        console.log(`[AgentCore:${this.agentId}] Handoff context:`, JSON.stringify(handoffRequest.context).substring(0, 300));
        // Requirement 9.4: Send handoff_request to Gateway (via adapter)
        // Note: The actual sending is delegated to the adapter (Voice Side-Car or Text Adapter)
        // The adapter will call this method and then send the handoff_request via WebSocket
        // Return success with handoff request data
        // The adapter will detect this and forward to Gateway
        return {
            success: true,
            result: {
                message: `Handoff initiated to ${targetAgent}`,
                toolName,
                input: toolInput,
                handoffRequest: handoffRequest
            }
        };
    }
    /**
     * Execute banking tool via local-tools service
     * Requirement 8.3: Route tool to appropriate service (local-tools)
     * Requirement 8.4: Execute tool via ToolsClient
     */
    async executeBankingTool(sessionId, toolName, toolInput) {
        console.log(`[AgentCore:${this.agentId}] Executing banking tool: ${toolName}`);
        try {
            // Call local-tools service
            const response = await axios_1.default.post(`${this.localToolsUrl}/tools/execute`, {
                tool: toolName,
                input: toolInput
            });
            const result = response.data.result;
            // Handle IDV check - store verified user in session
            if (toolName === 'perform_idv_check') {
                this.handleIdvResult(sessionId, result, toolInput);
            }
            return {
                success: true,
                result
            };
        }
        catch (error) {
            console.error(`[AgentCore:${this.agentId}] Banking tool execution failed:`, error);
            return {
                success: false,
                result: null,
                error: error.response?.data?.error || error.message
            };
        }
    }
    /**
     * Handle IDV check result and store verified user in session
     * CRITICAL: Implements "Verified State Gate" pattern
     * After successful verification, automatically triggers handoff to banking agent
     */
    handleIdvResult(sessionId, result, toolInput) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }
        let idvData;
        // Parse result structure from AgentCore
        if (result.content && result.content[0] && result.content[0].text) {
            try {
                idvData = JSON.parse(result.content[0].text);
            }
            catch (e) {
                console.error(`[AgentCore:${this.agentId}] Failed to parse IDV result:`, e);
            }
        }
        else if (result.auth_status) {
            idvData = result;
        }
        // Initialize IDV attempts counter if not exists
        if (session.idvAttempts === undefined) {
            session.idvAttempts = 0;
        }
        // Increment attempt counter
        session.idvAttempts++;
        console.log(`[AgentCore:${this.agentId}] IDV attempt ${session.idvAttempts}/3`);
        if (idvData && idvData.auth_status === 'VERIFIED') {
            session.verifiedUser = {
                customer_name: idvData.customer_name,
                account: toolInput.accountNumber,
                sortCode: toolInput.sortCode,
                auth_status: idvData.auth_status
            };
            // Update graph state with verified flag
            if (!session.graphState) {
                session.graphState = {};
            }
            session.graphState.verified = true;
            session.graphState.customer_name = idvData.customer_name;
            session.graphState.account = toolInput.accountNumber;
            session.graphState.sortCode = toolInput.sortCode;
            // Reset IDV attempts on success
            session.idvAttempts = 0;
            session.lastIdvFailure = undefined;
            console.log(`[AgentCore:${this.agentId}] ✅ Stored verified user: ${idvData.customer_name}`);
            console.log(`[AgentCore:${this.agentId}] ✅ Set verified state flag: true`);
            // CRITICAL: Verified State Gate - Auto-trigger handoff to banking
            // This removes the burden from the IDV agent to decide where to go
            // The system handles routing based on verified state
            if (this.agentId === 'idv') {
                console.log(`[AgentCore:${this.agentId}] 🚀 Verified State Gate: Auto-triggering handoff to banking`);
                // Store pending handoff in session for next response
                session.graphState.pendingHandoff = {
                    targetAgent: 'banking',
                    reason: 'Identity verified successfully',
                    context: {
                        verified: true,
                        userName: idvData.customer_name,
                        account: toolInput.accountNumber,
                        sortCode: toolInput.sortCode
                    }
                };
            }
        }
        else if (idvData && idvData.auth_status === 'FAILED') {
            // Store failure reason
            session.lastIdvFailure = idvData.message || 'Verification failed';
            console.log(`[AgentCore:${this.agentId}] ❌ IDV failed (attempt ${session.idvAttempts}/3): ${session.lastIdvFailure}`);
            // Check if max attempts reached
            if (session.idvAttempts >= 3) {
                console.log(`[AgentCore:${this.agentId}] ⚠️  Max IDV attempts reached (3/3) - should return to triage`);
            }
        }
        // CRITICAL: Clear in-progress flag after processing result
        if (session.graphState) {
            session.graphState.idvInProgress = false;
            console.log(`[AgentCore:${this.agentId}] 🔓 Cleared IDV in-progress flag`);
        }
    }
    /**
     * Execute knowledge base tool
     * Requirement 8.3: Route tool to appropriate service
     */
    async executeKnowledgeBaseTool(toolName, toolInput) {
        console.log(`[AgentCore:${this.agentId}] Executing knowledge base tool: ${toolName}`);
        try {
            // Execute via ToolsClient which will route to appropriate service
            const executionResult = await this.toolsClient.executeTool(toolName, toolInput);
            return {
                success: executionResult.success,
                result: executionResult.result,
                error: executionResult.error
            };
        }
        catch (error) {
            console.error(`[AgentCore:${this.agentId}] Knowledge base tool execution failed:`, error);
            return {
                success: false,
                result: null,
                error: error.message
            };
        }
    }
    /**
     * Execute local tool via ToolsClient
     * Requirement 8.3: Route tool to appropriate service (local-tools)
     * Requirement 8.4: Execute tool via ToolsClient
     */
    async executeLocalTool(toolName, toolInput) {
        console.log(`[AgentCore:${this.agentId}] Executing local tool: ${toolName}`);
        try {
            // Execute via ToolsClient
            const executionResult = await this.toolsClient.executeTool(toolName, toolInput);
            return {
                success: executionResult.success,
                result: executionResult.result,
                error: executionResult.error
            };
        }
        catch (error) {
            console.error(`[AgentCore:${this.agentId}] Local tool execution failed:`, error);
            return {
                success: false,
                result: null,
                error: error.message
            };
        }
    }
    /**
     * Request a handoff to another agent
     * Requirements 9.1, 9.2, 9.3, 9.4, 9.7: Complete handoff detection and routing
     */
    requestHandoff(sessionId, targetAgent, context) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        const targetPersonaId = (0, handoff_tools_1.getPersonaIdForAgent)(targetAgent);
        console.log(`[AgentCore:${this.agentId}] Handoff: ${this.agentId} → ${targetAgent} (${targetPersonaId})`);
        // Requirement 9.2: Extract handoff context (reason, verified user, user intent)
        const handoffContext = {
            fromAgent: this.agentId,
            targetAgent,
            targetPersonaId,
            lastUserMessage: context.lastUserMessage ||
                (session.messages.length > 0 ? session.messages[session.messages.length - 1].content : ''),
            reason: context.reason || session.userIntent || 'User needs specialist assistance'
        };
        // Include user intent if available
        if (session.userIntent) {
            handoffContext.userIntent = session.userIntent;
            console.log(`[AgentCore:${this.agentId}] Including user intent: ${session.userIntent}`);
        }
        // Include verified user data if available (Requirement 9.2)
        if (session.verifiedUser) {
            handoffContext.verified = true;
            handoffContext.userName = session.verifiedUser.customer_name;
            handoffContext.account = session.verifiedUser.account;
            handoffContext.sortCode = session.verifiedUser.sortCode;
            console.log(`[AgentCore:${this.agentId}] Including verified user: ${handoffContext.userName}`);
        }
        // Requirement 9.7: Handle return handoffs with task completion status
        if (context.isReturn) {
            handoffContext.isReturn = true;
            handoffContext.taskCompleted = context.taskCompleted || 'task_complete';
            handoffContext.summary = context.summary || 'Task completed successfully';
            console.log(`[AgentCore:${this.agentId}] Return handoff - Task: ${handoffContext.taskCompleted}`);
            // CRITICAL: Copy IDV failure flag if present
            if (context.idvFailed) {
                handoffContext.idvFailed = true;
                console.log(`[AgentCore:${this.agentId}] Including IDV failure flag in handoff context`);
            }
        }
        // Requirement 9.3: Build handoff request with full LangGraph state
        const graphState = this.graphExecutor?.getCurrentState();
        // Include session state in graph state for complete context
        const fullGraphState = {
            ...graphState,
            sessionId,
            currentNode: session.currentNode,
            messageCount: session.messages.length,
            sessionStartTime: session.startTime
        };
        console.log(`[AgentCore:${this.agentId}] Handoff request built with full context and graph state`);
        return {
            targetAgentId: targetPersonaId,
            context: handoffContext,
            graphState: fullGraphState
        };
    }
    /**
     * Route session to another agent through the gateway
     * This method uses the Gateway Router to pass context between agents
     *
     * @param sessionId Session identifier
     * @param targetAgentId Target agent identifier
     * @param context Context to pass to target agent
     * @returns Success status
     */
    async routeToAgentViaGateway(sessionId, targetAgentId, context) {
        if (!this.gatewayRouter) {
            console.warn(`[AgentCore:${this.agentId}] Gateway Router not initialized, cannot route`);
            return false;
        }
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`[AgentCore:${this.agentId}] Session not found: ${sessionId}`);
            return false;
        }
        // Build context from session state
        const agentContext = {
            lastAgent: this.agentId,
            ...context
        };
        // Include verified user data if available
        if (session.verifiedUser) {
            agentContext.verified = true;
            agentContext.userName = session.verifiedUser.customer_name;
            agentContext.account = session.verifiedUser.account;
            agentContext.sortCode = session.verifiedUser.sortCode;
        }
        // Include user intent if available
        if (session.userIntent) {
            agentContext.userIntent = session.userIntent;
        }
        // Include graph state
        if (session.graphState) {
            agentContext.graphState = session.graphState;
        }
        else if (this.graphExecutor) {
            agentContext.graphState = this.graphExecutor.getCurrentState();
        }
        // Include last user message
        if (session.messages.length > 0) {
            const lastUserMessage = session.messages
                .slice()
                .reverse()
                .find(m => m.role === 'user');
            if (lastUserMessage) {
                agentContext.lastUserMessage = lastUserMessage.content;
            }
        }
        console.log(`[AgentCore:${this.agentId}] Routing session ${sessionId} to ${targetAgentId} via gateway`);
        console.log(`[AgentCore:${this.agentId}] Context keys: ${Object.keys(agentContext).join(', ')}`);
        // Route through gateway
        const routeRequest = {
            sessionId,
            targetAgentId,
            context: agentContext,
            reason: context?.userIntent || 'Agent routing request'
        };
        const response = await this.gatewayRouter.routeToAgent(routeRequest);
        if (response.success) {
            console.log(`[AgentCore:${this.agentId}] ✅ Successfully routed to ${targetAgentId}`);
            return true;
        }
        else {
            console.error(`[AgentCore:${this.agentId}] ❌ Failed to route to ${targetAgentId}: ${response.error}`);
            return false;
        }
    }
    /**
     * Get Gateway Router instance (for direct access if needed)
     */
    getGatewayRouter() {
        return this.gatewayRouter;
    }
    /**
     * Update session memory
     */
    updateSessionMemory(sessionId, memory) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.error(`[AgentCore:${this.agentId}] Session not found: ${sessionId}`);
            return;
        }
        // Update verified user
        if (memory.verified !== undefined) {
            if (memory.verified && memory.userName) {
                session.verifiedUser = {
                    customer_name: memory.userName,
                    account: memory.account,
                    sortCode: memory.sortCode,
                    auth_status: 'VERIFIED'
                };
            }
            else if (!memory.verified) {
                // Clear verified user if verification is false
                session.verifiedUser = undefined;
            }
        }
        // Update user intent
        if (memory.userIntent !== undefined) {
            session.userIntent = memory.userIntent;
        }
        console.log(`[AgentCore:${this.agentId}] Session memory updated`);
    }
    /**
     * Get session memory
     */
    getSessionMemory(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return {};
        }
        const memory = {};
        if (session.verifiedUser) {
            memory.verified = true;
            memory.userName = session.verifiedUser.customer_name;
            memory.account = session.verifiedUser.account;
            memory.sortCode = session.verifiedUser.sortCode;
        }
        else {
            // Explicitly set verified to false if no verified user
            memory.verified = false;
        }
        if (session.userIntent) {
            memory.userIntent = session.userIntent;
        }
        return memory;
    }
    /**
     * Update workflow state based on node transition
     */
    updateWorkflowState(sessionId, nodeId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        const previousNode = session.currentNode;
        session.currentNode = nodeId;
        console.log(`[AgentCore:${this.agentId}] Workflow transition: ${previousNode || 'start'} → ${nodeId}`);
        // Update graph executor state
        if (this.graphExecutor) {
            const result = this.graphExecutor.updateState(nodeId);
            if (result.success) {
                console.log(`[AgentCore:${this.agentId}] Graph state updated: ${result.currentNode}`);
                // Get next possible nodes
                const nextNodes = this.graphExecutor.getNextNodes();
                return {
                    currentNode: nodeId,
                    previousNode,
                    nextNodes,
                    validTransition: result.validTransition,
                    nodeInfo: result.nodeInfo
                };
            }
            else {
                console.error(`[AgentCore:${this.agentId}] Failed to update graph state: ${result.error}`);
            }
        }
        return {
            currentNode: nodeId,
            previousNode,
            nextNodes: [],
            validTransition: false
        };
    }
    /**
     * Generate system prompt with context injection
     */
    getSystemPrompt(sessionId, personaPrompt) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return '';
        }
        let systemPrompt = '';
        // Build context injection
        let contextInjection = '';
        // NOTE: Conversation history is now passed via messages array to Claude
        // No need to duplicate it in the system prompt
        if (session.userIntent || session.verifiedUser || session.graphState) {
            contextInjection += '\n### CURRENT SESSION CONTEXT ###\n';
            if (session.userIntent) {
                contextInjection += `\n**User's Original Request:** ${session.userIntent}\n`;
            }
            // Show account details from memory (even if not yet verified)
            // This allows IDV agent to use them without asking
            if (session.graphState && (session.graphState.account || session.graphState.sortCode)) {
                const hasAccount = !!session.graphState.account;
                const hasSortCode = !!session.graphState.sortCode;
                const hasBoth = hasAccount && hasSortCode;
                contextInjection += `\n**Account Details from User:**\n`;
                if (session.graphState.account) {
                    contextInjection += `**Account Number:** ${session.graphState.account}\n`;
                }
                if (session.graphState.sortCode) {
                    contextInjection += `**Sort Code:** ${session.graphState.sortCode}\n`;
                }
                // Add IDV-specific instruction
                if (this.agentId === 'idv' && !session.verifiedUser) {
                    const attempts = session.idvAttempts || 0;
                    const maxAttempts = 3;
                    const remainingAttempts = maxAttempts - attempts;
                    contextInjection += `\n**CRITICAL INSTRUCTION FOR IDV:**\n`;
                    if (attempts === 0) {
                        // First attempt
                        if (hasBoth) {
                            // Have both - verify immediately
                            contextInjection += `- The user has already provided BOTH account number and sort code above\n`;
                            contextInjection += `- DO NOT ask for them again\n`;
                            contextInjection += `- Call perform_idv_check IMMEDIATELY with these details\n`;
                            contextInjection += `- **CRITICAL: Make ONLY ONE tool call, then WAIT for the result**\n`;
                            contextInjection += `- **DO NOT call perform_idv_check multiple times in a single response**\n`;
                            contextInjection += `- After verification, transfer to banking if the user wants banking services\n\n`;
                        }
                        else if (hasAccount && !hasSortCode) {
                            // Have account, need sort code
                            contextInjection += `- The user has provided their account number: ${session.graphState.account}\n`;
                            contextInjection += `- You still need their 6-digit sort code\n`;
                            contextInjection += `- Say: "Thank you. Now I need your 6-digit sort code."\n`;
                            contextInjection += `- **DO NOT ask for the account number again - you already have it**\n`;
                            contextInjection += `- **WAIT for the user to provide the sort code**\n`;
                            contextInjection += `- Once you have both, call perform_idv_check\n\n`;
                        }
                        else if (!hasAccount && hasSortCode) {
                            // Have sort code, need account
                            contextInjection += `- The user has provided their sort code: ${session.graphState.sortCode}\n`;
                            contextInjection += `- You still need their 8-digit account number\n`;
                            contextInjection += `- Say: "Thank you. Now I need your 8-digit account number."\n`;
                            contextInjection += `- **DO NOT ask for the sort code again - you already have it**\n`;
                            contextInjection += `- **WAIT for the user to provide the account number**\n`;
                            contextInjection += `- Once you have both, call perform_idv_check\n\n`;
                        }
                        else {
                            // Have neither - ask for both
                            contextInjection += `- The user has not provided any account details yet\n`;
                            contextInjection += `- Ask for BOTH their 8-digit account number AND 6-digit sort code\n`;
                            contextInjection += `- Say: "For authentication, please provide your 8-digit account number and 6-digit sort code."\n`;
                            contextInjection += `- **WAIT for the user to provide the details**\n\n`;
                        }
                    }
                    else if (attempts < maxAttempts) {
                        // Retry attempts (1 or 2)
                        contextInjection += `- **VERIFICATION ATTEMPT ${attempts + 1} of ${maxAttempts}**\n`;
                        contextInjection += `- Previous attempt failed: ${session.lastIdvFailure || 'Incorrect details'}\n`;
                        contextInjection += `- You have ${remainingAttempts} attempt(s) remaining\n`;
                        contextInjection += `- **CRITICAL: DO NOT call perform_idv_check again yet**\n`;
                        contextInjection += `- **You MUST ask the user to provide corrected details first**\n`;
                        if (hasBoth) {
                            // Have both but they were wrong - ask for corrections
                            contextInjection += `- The details you have (${session.graphState.account}, ${session.graphState.sortCode}) were INCORRECT\n`;
                            contextInjection += `- Ask the user to CAREFULLY re-enter BOTH their account number and sort code\n`;
                            contextInjection += `- Say: "Those details weren't quite right. Let's try again. Please provide your 8-digit account number and 6-digit sort code."\n`;
                        }
                        else if (hasAccount && !hasSortCode) {
                            // Have account, need sort code
                            contextInjection += `- You have account ${session.graphState.account} but still need the sort code\n`;
                            contextInjection += `- Ask ONLY for the sort code: "I have your account number. Now please provide your 6-digit sort code."\n`;
                        }
                        else if (!hasAccount && hasSortCode) {
                            // Have sort code, need account
                            contextInjection += `- You have sort code ${session.graphState.sortCode} but still need the account number\n`;
                            contextInjection += `- Ask ONLY for the account: "I have your sort code. Now please provide your 8-digit account number."\n`;
                        }
                        else {
                            // Have neither
                            contextInjection += `- Ask for BOTH: "Please provide your 8-digit account number and 6-digit sort code."\n`;
                        }
                        contextInjection += `- Emphasize that they need to provide CORRECT details\n`;
                        contextInjection += `- **WAIT for the user to respond with new details**\n`;
                        contextInjection += `- **DO NOT retry automatically with the same details**\n`;
                        contextInjection += `- Once they provide new details, THEN call perform_idv_check again\n`;
                        contextInjection += `- If this attempt fails and you have no more attempts, you MUST call return_to_triage\n\n`;
                    }
                    else {
                        // Max attempts reached - must return to triage
                        contextInjection += `- **MAX ATTEMPTS REACHED (${maxAttempts}/${maxAttempts})**\n`;
                        contextInjection += `- Verification has failed ${maxAttempts} times\n`;
                        contextInjection += `- You MUST call return_to_triage with:\n`;
                        contextInjection += `  - taskCompleted: "idv_failed"\n`;
                        contextInjection += `  - summary: "Identity verification failed after ${maxAttempts} attempts. User may need to contact support."\n`;
                        contextInjection += `- DO NOT attempt verification again\n`;
                        contextInjection += `- Apologize to the user and explain they'll be transferred back\n\n`;
                    }
                }
            }
            if (session.verifiedUser) {
                contextInjection += `
**Customer Name:** ${session.verifiedUser.customer_name}
**Account ID:** ${session.verifiedUser.account}
**Sort Code:** ${session.verifiedUser.sortCode}
**Verification Status:** VERIFIED
`;
            }
            // Add agent-specific instructions
            if (this.agentId === 'triage') {
                // Check if IDV failed (from graphState)
                const idvFailed = session.graphState?.idvFailed || false;
                if (idvFailed) {
                    contextInjection += `
**CRITICAL INSTRUCTION FOR TRIAGE - IDV FAILURE:** 
- Identity verification has FAILED after multiple attempts
- DO NOT transfer to IDV again - it will fail
- Inform the user that verification failed and they need to contact support
- Ask if there's anything else you can help with that doesn't require verification
- DO NOT attempt to help with banking operations (balance, transactions, etc.)
`;
                }
                else {
                    contextInjection += `
**CRITICAL INSTRUCTION FOR TRIAGE:** 
- The customer has already been verified and helped by another agent
- If the "User's Original Request" shows what they wanted (balance, transactions, etc.), acknowledge it was completed
- Ask if they need help with ANYTHING ELSE
- DO NOT repeat the same service they just received
- Be efficient and move to the next task
`;
                }
            }
            else if (this.agentId === 'idv') {
                // For IDV agent - DO NOT skip verification!
                contextInjection += `
**CRITICAL INSTRUCTION FOR IDV AGENT:** 
- Your ONLY job is to verify the customer's identity
- DO NOT skip verification even if you know what they want
- DO NOT immediately transfer to another agent
- FOLLOW YOUR PERSONA INSTRUCTIONS EXACTLY:
  1. Check if you have account number and sort code in memory
  2. If NOT, ask the user for them
  3. Once you have both, call perform_idv_check
  4. If VERIFIED, transfer to the appropriate agent (banking, mortgage, etc.)
  5. If FAILED, allow retry (max 3 attempts) then return to triage
- The "User's Original Request" tells you WHY they need verification, not what to do instead of verifying
`;
            }
            else if (this.agentId === 'banking') {
                // For banking agent receiving handoff from IDV
                contextInjection += `
**CRITICAL INSTRUCTION FOR BANKING AGENT:** 
- You are receiving this customer from the IDV agent who has ALREADY VERIFIED their identity
- The customer is ALREADY AUTHENTICATED - you are in STATE 4: AUTHENTICATED (Service Mode)
- DO NOT ask for account details again - you have them above
- DO NOT call perform_idv_check - you don't have access to that tool (only IDV agent does)
- DO NOT ask for confirmation - verification is already complete
- SKIP directly to helping with their request
- If the "User's Original Request" mentions what they want (balance, transactions, etc.), ACT ON IT IMMEDIATELY
- Example: If they want balance, say "Let me check your balance" and IMMEDIATELY call agentcore_balance
- Example: If they want transactions, say "Let me get your transactions" and IMMEDIATELY call get_account_transactions
- Be proactive and efficient - the customer has already been verified
`;
            }
            else {
                // For other agents (mortgage, disputes, investigation, etc.)
                contextInjection += `
**CRITICAL INSTRUCTION:** 
- The customer is already verified and you have their details above
- If the "User's Original Request" mentions what they want, ACT ON IT IMMEDIATELY
- Greet them by name and help them with their request
- DO NOT ask "How can I help you?" if you already know what they want
- Be proactive and efficient
`;
            }
        }
        // Build workflow instructions
        let workflowInstructions = '';
        if (this.workflowDef) {
            workflowInstructions = (0, workflow_utils_1.convertWorkflowToText)(this.workflowDef);
        }
        // Add handoff instructions for triage agent
        const handoffInstructions = this.agentId === 'triage' ? `

### AGENT HANDOFF INSTRUCTIONS ###

You are a ROUTING agent. Your ONLY job is to route users to the correct specialist agent BY CALLING THE APPROPRIATE TOOL.

**CRITICAL: YOU CANNOT ACCESS BANKING TOOLS DIRECTLY**

You do NOT have access to:
- agentcore_balance (balance checks)
- perform_idv_check (identity verification)
- get_account_transactions (transaction history)
- Any other banking operations

You ONLY have access to HANDOFF TOOLS:
- transfer_to_banking
- transfer_to_idv
- transfer_to_mortgage
- transfer_to_disputes
- transfer_to_investigation

**CRITICAL: YOU MUST CALL A TOOL - DO NOT JUST SAY YOU WILL CONNECT THEM**

**ROUTING RULES:**
- User needs BALANCE, TRANSACTIONS, PAYMENTS → **FIRST** call 'transfer_to_idv' for verification, THEN banking
- User needs IDENTITY VERIFICATION, SECURITY CHECKS → **CALL THE TOOL** 'transfer_to_idv' with reason="User needs identity verification"
- User needs MORTGAGE information → **CALL THE TOOL** 'transfer_to_mortgage' with reason="User wants mortgage information"
- User wants to DISPUTE a transaction → **CALL THE TOOL** 'transfer_to_disputes' with reason="User wants to dispute transaction"
- User reports FRAUD or UNRECOGNIZED TRANSACTIONS → **CALL THE TOOL** 'transfer_to_investigation' with reason="User reports suspicious activity"

**CRITICAL SECURITY RULE:**
For ANY banking operation (balance, transactions, payments), you MUST transfer to IDV FIRST for identity verification.
NEVER transfer directly to banking without IDV verification first.

**CRITICAL PROCESS:**
1. User states their need
2. You say ONE brief sentence acknowledging
3. **YOU MUST IMMEDIATELY CALL THE APPROPRIATE TRANSFER TOOL**
4. Do NOT continue talking - the tool call will handle the transfer

**DO NOT:**
- Just SAY you will connect them without calling the tool
- Try to help with their actual problem
- Ask for account details (the specialist will do this)
- Engage in extended conversation

**YOU MUST:**
- Call the appropriate transfer_to_* tool
- Include a reason parameter
- Do this IMMEDIATELY after identifying their need

**Example:**
User: "I need to check my balance"
You: "I'll connect you to our banking specialist right away."
**[YOU MUST NOW CALL THE TOOL: transfer_to_banking with reason="User needs balance check"]**

**REMEMBER: Saying you will connect them is NOT enough - you MUST CALL THE TOOL!**

` : '';
        // Combine all parts
        if (personaPrompt || this.personaPrompt) {
            systemPrompt = `${contextInjection}${personaPrompt || this.personaPrompt}${handoffInstructions}\n\n### WORKFLOW INSTRUCTIONS ###\n${workflowInstructions}`;
        }
        else {
            systemPrompt = `${contextInjection}${handoffInstructions}\n\n${workflowInstructions}`;
        }
        return systemPrompt;
    }
    /**
     * Get persona configuration
     */
    getPersonaConfig() {
        return this.personaConfig;
    }
    /**
     * Get workflow definition
     */
    getWorkflowDefinition() {
        return this.workflowDef;
    }
    /**
     * Get all available tools (handoff + banking + persona-specific)
     * Tools are filtered based on agent type to enforce proper handoff flow
     */
    getAllTools() {
        const handoffTools = (0, handoff_tools_1.generateHandoffTools)();
        const bankingTools = (0, banking_tools_1.generateBankingTools)();
        // Agent-specific tool access control
        // This ensures proper separation of concerns and enforces handoff flow
        switch (this.agentId) {
            case 'triage':
                // Triage agent: ONLY handoff tools
                // Cannot call banking tools directly - must hand off to specialists
                console.log(`[AgentCore:${this.agentId}] Tool access: Handoff tools only (${handoffTools.length} tools)`);
                return handoffTools;
            case 'idv':
                // IDV agent: ONLY IDV tools (NO handoff tools)
                // Gateway handles routing after successful verification (Verified State Gate pattern)
                const idvTools = bankingTools.filter(t => t.toolSpec.name === 'perform_idv_check');
                console.log(`[AgentCore:${this.agentId}] Tool access: IDV only (${idvTools.length} tools) - Gateway handles routing`);
                // Return ONLY IDV tools - no handoff tools
                return idvTools;
            case 'banking':
                // Banking agent: Banking tools ONLY (NO handoff tools)
                // After completing task, agent should ask if user needs anything else
                // Gateway will handle routing back to triage if needed
                const bankingOnlyTools = bankingTools.filter(t => t.toolSpec.name === 'agentcore_balance' ||
                    t.toolSpec.name === 'get_account_transactions' ||
                    t.toolSpec.name === 'uk_branch_lookup');
                console.log(`[AgentCore:${this.agentId}] Tool access: Banking only (${bankingOnlyTools.length} tools) - NO handoff tools`);
                return bankingOnlyTools;
            case 'mortgage':
                // Mortgage agent: Mortgage tools + handoff tools
                const mortgageTools = bankingTools.filter(t => t.toolSpec.name === 'calculate_max_loan' ||
                    t.toolSpec.name === 'get_mortgage_rates' ||
                    t.toolSpec.name === 'check_credit_score' ||
                    t.toolSpec.name === 'value_property');
                console.log(`[AgentCore:${this.agentId}] Tool access: Mortgage + Handoff (${mortgageTools.length + handoffTools.length} tools)`);
                return [...handoffTools, ...mortgageTools];
            case 'disputes':
                // Disputes agent: Dispute tools + handoff tools
                const disputeTools = bankingTools.filter(t => t.toolSpec.name === 'create_dispute_case' ||
                    t.toolSpec.name === 'update_dispute_case' ||
                    t.toolSpec.name === 'lookup_merchant_alias');
                console.log(`[AgentCore:${this.agentId}] Tool access: Disputes + Handoff (${disputeTools.length + handoffTools.length} tools)`);
                return [...handoffTools, ...disputeTools];
            case 'investigation':
                // Investigation agent: Investigation tools + handoff tools
                // Can access transaction history for fraud investigation
                const investigationTools = bankingTools.filter(t => t.toolSpec.name === 'get_account_transactions' ||
                    t.toolSpec.name === 'lookup_merchant_alias');
                console.log(`[AgentCore:${this.agentId}] Tool access: Investigation + Handoff (${investigationTools.length + handoffTools.length} tools)`);
                return [...handoffTools, ...investigationTools];
            default:
                // Unknown agent: All tools (fallback for development)
                console.warn(`[AgentCore:${this.agentId}] Unknown agent type - granting all tools`);
                return [...handoffTools, ...bankingTools];
        }
    }
    /**
     * Set persona prompt (called during initialization)
     */
    setPersonaPrompt(prompt) {
        this.personaPrompt = prompt;
    }
    /**
     * Track tool execution in Langfuse
     * Requirement 8.7, 11.4: Track tool invocations and results
     */
    trackToolExecution(sessionId, toolName, toolInput, toolUseId, result) {
        const session = this.sessions.get(sessionId);
        if (!session?.langfuseTrace) {
            return;
        }
        try {
            const startTime = Date.now();
            session.langfuseTrace.span({
                name: 'tool-execution',
                input: {
                    toolName,
                    toolInput,
                    toolUseId
                },
                output: {
                    success: result.success,
                    result: result.result,
                    error: result.error
                },
                metadata: {
                    toolName,
                    toolUseId,
                    timestamp: startTime,
                    success: result.success
                },
                level: result.success ? 'DEFAULT' : 'ERROR'
            });
            console.log(`[AgentCore:${this.agentId}] Tracked tool execution in Langfuse: ${toolName}`);
        }
        catch (error) {
            console.warn(`[AgentCore:${this.agentId}] Failed to track tool execution: ${error.message}`);
        }
    }
    /**
     * Track assistant response in Langfuse
     * Requirement 11.3: Track assistant responses
     */
    trackAssistantResponse(sessionId, response, metadata) {
        const session = this.sessions.get(sessionId);
        if (!session?.langfuseTrace) {
            return;
        }
        try {
            // Track time to first token if not already set
            if (!session.firstTokenTime) {
                session.firstTokenTime = Date.now();
                const timeToFirstToken = session.firstTokenTime - session.startTime;
                session.langfuseTrace.event({
                    name: 'first-token',
                    metadata: {
                        timeToFirstToken,
                        timestamp: session.firstTokenTime
                    }
                });
            }
            // Track assistant response
            session.langfuseTrace.event({
                name: 'assistant-response',
                output: response,
                metadata: {
                    timestamp: Date.now(),
                    messageIndex: session.messages.length,
                    ...metadata
                }
            });
            // Store assistant message
            session.messages.push({
                role: 'assistant',
                content: response,
                timestamp: Date.now(),
                metadata
            });
            console.log(`[AgentCore:${this.agentId}] Tracked assistant response in Langfuse`);
        }
        catch (error) {
            console.warn(`[AgentCore:${this.agentId}] Failed to track assistant response: ${error.message}`);
        }
    }
    /**
     * Track token usage in Langfuse
     * Requirement 11.6: Track token usage
     */
    trackTokenUsage(sessionId, inputTokens, outputTokens) {
        const session = this.sessions.get(sessionId);
        if (!session?.langfuseTrace) {
            return;
        }
        try {
            // Update session token counts
            session.inputTokens = (session.inputTokens || 0) + inputTokens;
            session.outputTokens = (session.outputTokens || 0) + outputTokens;
            session.totalTokens = session.inputTokens + session.outputTokens;
            // Track in Langfuse
            session.langfuseTrace.event({
                name: 'token-usage',
                metadata: {
                    inputTokens,
                    outputTokens,
                    totalTokens: inputTokens + outputTokens,
                    cumulativeInputTokens: session.inputTokens,
                    cumulativeOutputTokens: session.outputTokens,
                    cumulativeTotalTokens: session.totalTokens,
                    timestamp: Date.now()
                }
            });
            console.log(`[AgentCore:${this.agentId}] Tracked token usage: +${inputTokens} input, +${outputTokens} output`);
        }
        catch (error) {
            console.warn(`[AgentCore:${this.agentId}] Failed to track token usage: ${error.message}`);
        }
    }
    /**
     * Track interruption event in Langfuse
     * Requirement 11.7: Track interruptions and errors
     */
    trackInterruption(sessionId, reason) {
        const session = this.sessions.get(sessionId);
        if (!session?.langfuseTrace) {
            return;
        }
        try {
            session.langfuseTrace.event({
                name: 'interruption',
                metadata: {
                    reason: reason || 'User interrupted',
                    timestamp: Date.now()
                },
                level: 'WARNING'
            });
            console.log(`[AgentCore:${this.agentId}] Tracked interruption in Langfuse`);
        }
        catch (error) {
            console.warn(`[AgentCore:${this.agentId}] Failed to track interruption: ${error.message}`);
        }
    }
    /**
     * Track error event in Langfuse
     * Requirement 11.7: Track errors
     */
    trackError(sessionId, error, context) {
        const session = this.sessions.get(sessionId);
        if (!session?.langfuseTrace) {
            return;
        }
        try {
            session.langfuseTrace.event({
                name: 'error',
                metadata: {
                    error,
                    context,
                    timestamp: Date.now()
                },
                level: 'ERROR'
            });
            console.log(`[AgentCore:${this.agentId}] Tracked error in Langfuse: ${error}`);
        }
        catch (error) {
            console.warn(`[AgentCore:${this.agentId}] Failed to track error: ${error.message}`);
        }
    }
    /**
     * Get Langfuse trace for a session (for external use)
     */
    getLangfuseTrace(sessionId) {
        const session = this.sessions.get(sessionId);
        return session?.langfuseTrace;
    }
}
exports.AgentCore = AgentCore;
