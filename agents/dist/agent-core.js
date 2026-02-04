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
const axios_1 = __importDefault(require("axios"));
const langfuse_1 = require("langfuse");
/**
 * Agent Core - Voice-agnostic business logic
 */
class AgentCore {
    constructor(config) {
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
            if (memory.graphState.currentNodeId) {
                session.currentNode = memory.graphState.currentNodeId;
                console.log(`[AgentCore:${this.agentId}] Resuming from node: ${memory.graphState.currentNodeId}`);
            }
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
        // This is a placeholder - actual LLM processing would happen here
        // In the real implementation, this would invoke the LangGraph workflow
        // For now, we just return a simple response
        return {
            type: 'text',
            content: 'Message received and processed'
        };
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
        console.log(`[AgentCore:${this.agentId}] Executing tool: ${toolName}`);
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
        }
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
        console.log(`[AgentCore:${this.agentId}] Executing handoff tool: ${toolName}`);
        // Requirement 9.1: Detect handoff tool calls (transfer_to_*, return_to_triage)
        const isReturnHandoff = toolName === 'return_to_triage';
        // Requirement 9.2: Extract handoff context (reason, verified user, user intent)
        const session = this.sessions.get(sessionId);
        if (!session) {
            return {
                success: false,
                result: null,
                error: 'Session not found'
            };
        }
        // Extract target agent from tool name
        const targetAgent = (0, handoff_tools_1.getTargetAgentFromTool)(toolName);
        if (!targetAgent) {
            return {
                success: false,
                result: null,
                error: `Invalid handoff tool: ${toolName}`
            };
        }
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
        }
        // Requirement 9.3: Build handoff request with full LangGraph state
        const handoffRequest = this.requestHandoff(sessionId, targetAgent, handoffContext);
        console.log(`[AgentCore:${this.agentId}] Handoff request built: ${this.agentId} → ${targetAgent}`);
        // Requirement 9.4: Send handoff_request to Gateway (via adapter)
        // Note: The actual sending is delegated to the adapter (Voice Side-Car or Text Adapter)
        // The adapter will call this method and then send the handoff_request via WebSocket
        // Return success with handoff request data
        // The adapter will detect this and forward to Gateway
        return {
            success: true,
            result: {
                message: 'Handoff initiated',
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
        if (idvData && idvData.auth_status === 'VERIFIED') {
            session.verifiedUser = {
                customer_name: idvData.customer_name,
                account: toolInput.accountNumber,
                sortCode: toolInput.sortCode,
                auth_status: idvData.auth_status
            };
            console.log(`[AgentCore:${this.agentId}] Stored verified user: ${idvData.customer_name}`);
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
        if (session.userIntent || session.verifiedUser) {
            contextInjection = '\n### CURRENT SESSION CONTEXT ###\n';
            if (session.userIntent) {
                contextInjection += `\n**User's Original Request:** ${session.userIntent}\n`;
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
                contextInjection += `
**CRITICAL INSTRUCTION FOR TRIAGE:** 
- The customer has already been verified and helped by another agent
- If the "User's Original Request" shows what they wanted (balance, transactions, etc.), acknowledge it was completed
- Ask if they need help with ANYTHING ELSE
- DO NOT repeat the same service they just received
- Be efficient and move to the next task
`;
            }
            else {
                contextInjection += `
**CRITICAL INSTRUCTION:** 
- The customer is already verified and you have their details above
- If the "User's Original Request" mentions what they want (balance, transactions, etc.), ACT ON IT IMMEDIATELY
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

**CRITICAL: YOU MUST CALL A TOOL - DO NOT JUST SAY YOU WILL CONNECT THEM**

**ROUTING RULES:**
- User needs BALANCE, TRANSACTIONS, PAYMENTS → **CALL THE TOOL** 'transfer_to_banking' with reason="User needs banking services"
- User needs IDENTITY VERIFICATION, SECURITY CHECKS → **CALL THE TOOL** 'transfer_to_idv' with reason="User needs identity verification"
- User needs MORTGAGE information → **CALL THE TOOL** 'transfer_to_mortgage' with reason="User wants mortgage information"
- User wants to DISPUTE a transaction → **CALL THE TOOL** 'transfer_to_disputes' with reason="User wants to dispute transaction"
- User reports FRAUD or UNRECOGNIZED TRANSACTIONS → **CALL THE TOOL** 'transfer_to_investigation' with reason="User reports suspicious activity"

**CRITICAL PROCESS:**
1. User states their need
2. You say ONE brief sentence acknowledging
3. **YOU MUST IMMEDIATELY CALL THE APPROPRIATE TRANSFER TOOL**
4. Do NOT continue talking - the tool call will handle the transfer

**DO NOT:**
- Just SAY you will connect them without calling the tool
- Try to help with their actual problem
- Ask for account details
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
     */
    getAllTools() {
        const handoffTools = (0, handoff_tools_1.generateHandoffTools)();
        const bankingTools = (0, banking_tools_1.generateBankingTools)();
        // TODO: Add persona-specific tools filtering
        const allTools = [...handoffTools, ...bankingTools];
        return allTools;
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
