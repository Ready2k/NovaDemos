"use strict";
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
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const http_1 = require("http");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const graph_executor_1 = require("./graph-executor");
const tools_client_1 = require("./tools-client");
const sonic_client_1 = require("./sonic-client");
const workflow_utils_1 = require("./workflow-utils");
const decision_evaluator_1 = require("./decision-evaluator");
const persona_loader_1 = require("./persona-loader");
const handoff_tools_1 = require("./handoff-tools");
const banking_tools_1 = require("./banking-tools");
// Environment configuration
const AGENT_ID = process.env.AGENT_ID || 'unknown';
const AGENT_PORT = parseInt(process.env.AGENT_PORT || '8081');
const AGENT_HOST = process.env.AGENT_HOST || `agent-${process.env.AGENT_ID || 'unknown'}`;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:8080';
const LOCAL_TOOLS_URL = process.env.LOCAL_TOOLS_URL || 'http://local-tools:9000';
const AGENTCORE_URL = process.env.AGENTCORE_URL;
const WORKFLOW_FILE = process.env.WORKFLOW_FILE || '/app/workflow.json';
// AWS Configuration for Nova Sonic
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
// Determine base directories (Docker vs local)
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const PERSONAS_DIR = path.join(BASE_DIR, 'backend/personas');
const PROMPTS_DIR = path.join(BASE_DIR, 'backend/prompts');
// Initialize persona loader
const personaLoader = new persona_loader_1.PersonaLoader(PERSONAS_DIR, PROMPTS_DIR);
console.log(`[Agent:${AGENT_ID}] PersonaLoader initialized`);
console.log(`[Agent:${AGENT_ID}] Personas dir: ${PERSONAS_DIR}`);
console.log(`[Agent:${AGENT_ID}] Prompts dir: ${PROMPTS_DIR}`);
// Initialize tools client
const toolsClient = new tools_client_1.ToolsClient(LOCAL_TOOLS_URL, AGENTCORE_URL);
// Initialize decision evaluator
const decisionEvaluator = new decision_evaluator_1.DecisionEvaluator(AWS_REGION);
// Load workflow definition
let workflowDef = null;
let personaConfig = null;
let personaPrompt = '';
try {
    if (fs.existsSync(WORKFLOW_FILE)) {
        workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf-8'));
        console.log(`[Agent:${AGENT_ID}] Loaded workflow from ${WORKFLOW_FILE}`);
        // Load persona configuration if specified
        if (workflowDef && workflowDef.personaId) {
            console.log(`[Agent:${AGENT_ID}] Loading persona: ${workflowDef.personaId}`);
            const personaResult = personaLoader.loadPersona(workflowDef.personaId);
            if (personaResult.success && personaResult.persona) {
                personaConfig = personaResult.persona;
                personaPrompt = personaResult.systemPrompt || '';
                console.log(`[Agent:${AGENT_ID}] ✅ Persona loaded: ${personaConfig.name}`);
                console.log(`[Agent:${AGENT_ID}]    Voice: ${personaConfig.voiceId}`);
                console.log(`[Agent:${AGENT_ID}]    Allowed tools: ${personaConfig.allowedTools.length}`);
                console.log(`[Agent:${AGENT_ID}]    Prompt length: ${personaPrompt.length} chars`);
                // Override workflow voice with persona voice if not set
                if (!workflowDef.voiceId && personaConfig.voiceId) {
                    workflowDef.voiceId = personaConfig.voiceId;
                }
            }
            else {
                console.warn(`[Agent:${AGENT_ID}] ⚠️  Failed to load persona: ${personaResult.error}`);
            }
        }
        else {
            console.warn(`[Agent:${AGENT_ID}] ⚠️  No personaId specified in workflow`);
        }
    }
    else {
        console.error(`[Agent:${AGENT_ID}] Workflow file not found: ${WORKFLOW_FILE}`);
    }
}
catch (error) {
    console.error(`[Agent:${AGENT_ID}] Failed to load workflow:`, error);
}
// Initialize graph executor
let graphExecutor = null;
if (workflowDef) {
    try {
        graphExecutor = new graph_executor_1.GraphExecutor(workflowDef);
        console.log(`[Agent:${AGENT_ID}] Graph executor initialized`);
    }
    catch (error) {
        console.error(`[Agent:${AGENT_ID}] Failed to initialize graph executor:`, error);
    }
}
// Express app
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Health check
app.get('/health', (req, res) => {
    res.json({
        status: graphExecutor ? 'healthy' : 'unhealthy',
        agent: AGENT_ID,
        workflow: workflowDef?.testConfig?.personaId || 'unknown',
        s2s: 'enabled',
        timestamp: Date.now()
    });
});
// Create HTTP server
const server = (0, http_1.createServer)(app);
// WebSocket server for session handling
const wss = new ws_1.WebSocketServer({ server, path: '/session' });
// Active sessions
const activeSessions = new Map();
wss.on('connection', (ws) => {
    let sessionId = null;
    console.log(`[Agent:${AGENT_ID}] New WebSocket connection`);
    ws.on('message', async (data, isBinary) => {
        try {
            // Try to parse as JSON first
            if (!isBinary) {
                const message = JSON.parse(data.toString());
                // Handle session initialization
                if (message.type === 'session_init') {
                    sessionId = message.sessionId;
                    if (!sessionId)
                        return;
                    console.log(`[Agent:${AGENT_ID}] Initializing session: ${sessionId}`);
                    // Initialize SonicClient (like SonicService does)
                    const sonicClient = new sonic_client_1.SonicClient({
                        region: AWS_REGION,
                        accessKeyId: AWS_ACCESS_KEY_ID,
                        secretAccessKey: AWS_SECRET_ACCESS_KEY
                    });
                    // WORKFLOW CONTEXT INJECTION
                    // Convert workflow to text instructions and inject into system prompt
                    let systemPrompt = '';
                    if (workflowDef) {
                        const workflowInstructions = (0, workflow_utils_1.convertWorkflowToText)(workflowDef);
                        // Add handoff instructions for triage agent
                        const handoffInstructions = AGENT_ID === 'triage' ? `

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
                        // Add context injection if we have session memory (userIntent or verified user)
                        let contextInjection = '';
                        if (message.memory && (message.memory.userIntent || message.memory.verified) && AGENT_ID !== 'triage') {
                            contextInjection = `

### CURRENT SESSION CONTEXT ###
`;
                            if (message.memory.userIntent) {
                                contextInjection += `
**User's Original Request:** ${message.memory.userIntent}
`;
                            }
                            if (message.memory.verified) {
                                contextInjection += `
**Customer Name:** ${message.memory.userName}
**Account Number:** ${message.memory.account}
**Sort Code:** ${message.memory.sortCode}
**Verification Status:** VERIFIED
`;
                            }
                            contextInjection += `
**CRITICAL INSTRUCTION:** 
- The customer is already verified and you have their details above
- If the "User's Original Request" mentions what they want (balance, transactions, etc.), ACT ON IT IMMEDIATELY
- Greet them by name and help them with their request
- DO NOT ask "How can I help you?" if you already know what they want
- Be proactive and efficient

`;
                            console.log(`[Agent:${AGENT_ID}] ✅ Injecting session context into system prompt`);
                            console.log(`[Agent:${AGENT_ID}]    Context length: ${contextInjection.length} chars`);
                            if (message.memory.userIntent) {
                                console.log(`[Agent:${AGENT_ID}]    📋 User Intent: "${message.memory.userIntent}"`);
                            }
                            if (message.memory.verified) {
                                console.log(`[Agent:${AGENT_ID}]    ✅ Verified User: ${message.memory.userName}`);
                                console.log(`[Agent:${AGENT_ID}]    💳 Account: ${message.memory.account}`);
                            }
                        }
                        else {
                            console.log(`[Agent:${AGENT_ID}] ℹ️  No session context to inject`);
                            if (message.memory) {
                                console.log(`[Agent:${AGENT_ID}]    Memory keys: ${Object.keys(message.memory).join(', ')}`);
                            }
                        }
                        // Combine context + persona prompt + handoff + workflow
                        // CRITICAL: Context must come FIRST so persona prompt can reference it
                        if (personaPrompt) {
                            systemPrompt = `${contextInjection}${personaPrompt}${handoffInstructions}\n\n### WORKFLOW INSTRUCTIONS ###\n${workflowInstructions}`;
                            console.log(`[Agent:${AGENT_ID}] Combined context (${contextInjection.length} chars) + persona prompt (${personaPrompt.length} chars) + handoff (${handoffInstructions.length} chars) + workflow (${workflowInstructions.length} chars)`);
                        }
                        else {
                            systemPrompt = `${contextInjection}${handoffInstructions}\n\n${workflowInstructions}`;
                            console.log(`[Agent:${AGENT_ID}] Using context + handoff + workflow instructions (${contextInjection.length + handoffInstructions.length + workflowInstructions.length} chars)`);
                        }
                        // Generate handoff tools (available to all agents)
                        const handoffTools = (0, handoff_tools_1.generateHandoffTools)();
                        console.log(`[Agent:${AGENT_ID}] Generated ${handoffTools.length} handoff tools`);
                        // Generate banking tools (for banking-related agents)
                        const bankingTools = (0, banking_tools_1.generateBankingTools)();
                        console.log(`[Agent:${AGENT_ID}] Generated ${bankingTools.length} banking tools`);
                        // Combine all tools
                        const allTools = [...handoffTools, ...bankingTools];
                        // Configure session with workflow instructions, voice, and tools
                        sonicClient.setConfig({
                            systemPrompt,
                            voiceId: workflowDef.voiceId || 'matthew',
                            tools: allTools
                        });
                        console.log(`[Agent:${AGENT_ID}] Voice configured: ${workflowDef.voiceId || 'matthew'}`);
                        console.log(`[Agent:${AGENT_ID}] Total tools configured: ${allTools.length}`);
                        console.log(`[Agent:${AGENT_ID}] Handoff tools: ${handoffTools.map(t => t.toolSpec.name).join(', ')}`);
                        console.log(`[Agent:${AGENT_ID}] Banking tools: ${bankingTools.map(t => t.toolSpec.name).join(', ')}`);
                    }
                    // Store session BEFORE starting Nova (so it's available for incoming messages)
                    const newSession = {
                        sessionId,
                        ws,
                        sonicClient,
                        graphExecutor,
                        startTime: Date.now(),
                        messages: [],
                        currentNode: workflowDef?.nodes?.find((n) => n.type === 'start')?.id
                    };
                    // Restore verified user from session memory if available
                    if (message.memory && message.memory.verified) {
                        newSession.verifiedUser = {
                            customer_name: message.memory.userName,
                            account: message.memory.account,
                            sortCode: message.memory.sortCode,
                            auth_status: 'VERIFIED'
                        };
                        console.log(`[Agent:${AGENT_ID}] ✅ Restored verified user from memory: ${message.memory.userName}`);
                    }
                    // Store userIntent in session so it can be passed through handoffs
                    if (message.memory && message.memory.userIntent) {
                        newSession.userIntent = message.memory.userIntent;
                        console.log(`[Agent:${AGENT_ID}] ✅ Stored userIntent in session: ${message.memory.userIntent}`);
                    }
                    activeSessions.set(sessionId, newSession);
                    // Send acknowledgment BEFORE starting Nova (to avoid race condition)
                    console.log(`[Agent:${AGENT_ID}] Sending 'connected' message to gateway`);
                    ws.send(JSON.stringify({
                        type: 'connected',
                        sessionId,
                        agent: AGENT_ID,
                        s2s: 'active',
                        workflow: workflowDef?.testConfig?.personaId || 'unknown'
                    }));
                    console.log(`[Agent:${AGENT_ID}] 'connected' message sent`);
                    // Start Nova Sonic S2S session
                    await sonicClient.startSession((event) => handleSonicEvent(event, sessionId, ws), sessionId);
                    console.log(`[Agent:${AGENT_ID}] Nova Sonic S2S session started for ${sessionId}`);
                    // DON'T inject context as a message - Nova Sonic will speak it!
                    // Context is already in the system prompt via contextInjection
                    // Just log that we have context available
                    if (message.memory && (message.memory.userIntent || message.memory.verified)) {
                        console.log(`[Agent:${AGENT_ID}] Session context available:`);
                        if (message.memory.userIntent) {
                            console.log(`[Agent:${AGENT_ID}]   - User Intent: ${message.memory.userIntent}`);
                        }
                        if (message.memory.verified) {
                            console.log(`[Agent:${AGENT_ID}]   - Verified User: ${message.memory.userName}`);
                            console.log(`[Agent:${AGENT_ID}]   - Account: ${message.memory.account}`);
                        }
                    }
                    return;
                }
                // Handle text input (for testing)
                if (message.type === 'user_input' && sessionId) {
                    const session = activeSessions.get(sessionId);
                    if (!session) {
                        console.error(`[Agent:${AGENT_ID}] Session not found: ${sessionId}`);
                        return;
                    }
                    const userText = message.text || message.transcript;
                    console.log(`[Agent:${AGENT_ID}] Text input: ${userText}`);
                    // Echo the user's message back as a transcript so frontend can display it
                    if (ws.readyState === ws_1.WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'transcript',
                            role: 'user',
                            text: userText, // Changed from 'transcript' to 'text' to match frontend interface
                            isFinal: true,
                            timestamp: Date.now()
                        }));
                    }
                    // Send to Nova Sonic
                    await session.sonicClient.sendText(userText);
                    return;
                }
                // Handle session config updates
                if (message.type === 'session_config' && sessionId) {
                    const session = activeSessions.get(sessionId);
                    if (!session)
                        return;
                    // Update Nova Sonic config (system prompt, tools, etc.)
                    if (message.config.systemPrompt) {
                        session.sonicClient.updateSessionConfig({
                            systemPrompt: message.config.systemPrompt
                        });
                    }
                    console.log(`[Agent:${AGENT_ID}] Session config updated`);
                    return;
                }
                // Handle end of speech signal
                if (message.type === 'end_of_speech') {
                    console.log(`[Agent:${AGENT_ID}] End of speech signal received`);
                    const session = activeSessions.get(sessionId);
                    if (session) {
                        // End the audio input stream (but keep session open for response)
                        await session.sonicClient.endAudioInput();
                    }
                    return;
                }
            }
            // Handle binary audio data
            if (isBinary && sessionId) {
                const session = activeSessions.get(sessionId);
                if (!session) {
                    console.error(`[Agent:${AGENT_ID}] Session not found for audio: ${sessionId}`);
                    return;
                }
                const audioBuffer = Buffer.from(data);
                // Validate PCM audio (must be even length)
                if (audioBuffer.length % 2 !== 0) {
                    console.warn(`[Agent:${AGENT_ID}] Invalid PCM audio length: ${audioBuffer.length}`);
                    return;
                }
                // Forward audio to Nova Sonic
                await session.sonicClient.sendAudioChunk({
                    buffer: audioBuffer,
                    timestamp: Date.now()
                });
            }
        }
        catch (error) {
            console.error(`[Agent:${AGENT_ID}] Message handling error:`, error);
            // Try to send error to client
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message
                }));
            }
        }
    });
    ws.on('close', async () => {
        // DON'T close the session immediately - give Nova time to respond
        console.log(`[Agent:${AGENT_ID}] WebSocket closed for session: ${sessionId}`);
        // Delay session cleanup to allow Nova to finish responding
        setTimeout(async () => {
            if (sessionId) {
                console.log(`[Agent:${AGENT_ID}] Session cleanup: ${sessionId}`);
                const session = activeSessions.get(sessionId);
                if (session) {
                    // Stop Nova Sonic session
                    await session.sonicClient.stopSession();
                    activeSessions.delete(sessionId);
                }
            }
        }, 30000); // 30 second grace period
    });
    ws.on('error', (error) => {
        console.error(`[Agent:${AGENT_ID}] WebSocket error:`, error);
    });
});
/**
 * Handle events from Nova Sonic S2S session
 */
async function handleSonicEvent(event, sessionId, ws) {
    const session = activeSessions.get(sessionId);
    if (!session)
        return;
    try {
        switch (event.type) {
            case 'audio':
                // Forward audio back to gateway/client
                if (event.data.audio) {
                    let audioBuffer = Buffer.isBuffer(event.data.audio)
                        ? event.data.audio
                        : Buffer.from(event.data.audio);
                    // Ensure even byte length for Int16Array (16-bit PCM = 2 bytes per sample)
                    if (audioBuffer.length % 2 !== 0) {
                        console.warn(`[Agent:${AGENT_ID}] Padding odd-sized audio chunk: ${audioBuffer.length} -> ${audioBuffer.length + 1} bytes`);
                        const padded = Buffer.alloc(audioBuffer.length + 1);
                        audioBuffer.copy(padded);
                        padded[audioBuffer.length] = 0; // Pad with zero
                        audioBuffer = padded;
                    }
                    if (ws.readyState === ws_1.WebSocket.OPEN) {
                        ws.send(audioBuffer);
                    }
                }
                break;
            case 'transcript':
                // Forward transcript to client
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'transcript',
                        role: event.data.role || 'assistant',
                        text: event.data.transcript,
                        isFinal: event.data.isFinal
                    }));
                }
                // Store in session
                session.messages.push({
                    role: event.data.role || 'assistant',
                    content: event.data.transcript,
                    timestamp: Date.now()
                });
                // WORKFLOW STATE SYNCHRONIZATION
                // Parse [STEP: node_id] tags to update graph state
                if (event.data.transcript && event.data.transcript.includes('[STEP:')) {
                    const stepMatch = event.data.transcript.match(/\[STEP:\s*([^\]]+)\]/);
                    if (stepMatch) {
                        const nodeId = stepMatch[1].trim();
                        const previousNode = session.currentNode;
                        session.currentNode = nodeId;
                        console.log(`[Agent:${AGENT_ID}] Workflow transition: ${previousNode || 'start'} -> ${nodeId}`);
                        // Update graph executor state
                        if (session.graphExecutor) {
                            try {
                                const result = session.graphExecutor.updateState(nodeId);
                                if (result.success) {
                                    console.log(`[Agent:${AGENT_ID}] ✅ Graph state updated: ${result.currentNode}`);
                                    console.log(`[Agent:${AGENT_ID}]    Node type: ${result.nodeInfo?.type}`);
                                    console.log(`[Agent:${AGENT_ID}]    Valid transition: ${result.validTransition}`);
                                    if (!result.validTransition) {
                                        console.warn(`[Agent:${AGENT_ID}] ⚠️  ${result.error}`);
                                    }
                                    // Get next possible nodes
                                    const nextNodes = session.graphExecutor.getNextNodes();
                                    console.log(`[Agent:${AGENT_ID}]    Next nodes: ${nextNodes.map(n => n.id).join(', ')}`);
                                    // DECISION NODE AUTOMATION
                                    // If current node is a decision node, automatically evaluate it
                                    if (result.nodeInfo?.type === 'decision' && nextNodes.length > 1) {
                                        console.log(`[Agent:${AGENT_ID}] 🤔 Decision node detected, evaluating...`);
                                        // Get edges from this decision node
                                        const workflowDef = session.graphExecutor.getWorkflowDefinition();
                                        const edges = workflowDef.edges.filter(e => e.from === nodeId);
                                        // Evaluate decision using LLM
                                        const decision = await decisionEvaluator.evaluateDecision(result.nodeInfo, edges, session.graphExecutor.getCurrentState());
                                        if (decision.success) {
                                            console.log(`[Agent:${AGENT_ID}] ✅ Decision made: ${decision.chosenPath}`);
                                            console.log(`[Agent:${AGENT_ID}]    Reasoning: ${decision.reasoning}`);
                                            // Find the target node for this path
                                            const chosenEdge = edges.find(e => e.label === decision.chosenPath ||
                                                e.to === decision.chosenPath);
                                            if (chosenEdge) {
                                                const targetNodeId = chosenEdge.to;
                                                console.log(`[Agent:${AGENT_ID}]    Next step: ${targetNodeId}`);
                                                // Send decision result to Nova Sonic as context
                                                const decisionContext = `[SYSTEM] Decision made: ${decision.chosenPath}. Proceeding to ${targetNodeId}.`;
                                                await session.sonicClient.sendText(decisionContext);
                                                // Send decision update to client
                                                if (ws.readyState === ws_1.WebSocket.OPEN) {
                                                    ws.send(JSON.stringify({
                                                        type: 'decision_made',
                                                        decisionNode: nodeId,
                                                        chosenPath: decision.chosenPath,
                                                        targetNode: targetNodeId,
                                                        confidence: decision.confidence,
                                                        reasoning: decision.reasoning,
                                                        timestamp: Date.now()
                                                    }));
                                                }
                                            }
                                        }
                                        else {
                                            console.error(`[Agent:${AGENT_ID}] ❌ Decision evaluation failed: ${decision.error}`);
                                        }
                                    }
                                }
                                else {
                                    console.error(`[Agent:${AGENT_ID}] ❌ Failed to update graph state: ${result.error}`);
                                }
                            }
                            catch (error) {
                                console.error(`[Agent:${AGENT_ID}] Failed to update graph state:`, error);
                            }
                        }
                        // Send workflow update to client with enhanced info
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            const currentNode = session.graphExecutor?.getCurrentNode();
                            const nextNodes = session.graphExecutor?.getNextNodes() || [];
                            ws.send(JSON.stringify({
                                type: 'workflow_update',
                                currentStep: nodeId,
                                previousStep: previousNode,
                                nodeType: currentNode?.type,
                                nodeLabel: currentNode?.label,
                                nextSteps: nextNodes.map(n => ({
                                    id: n.id,
                                    label: n.label,
                                    type: n.type
                                })),
                                timestamp: Date.now()
                            }));
                        }
                    }
                }
                break;
            case 'toolUse':
                // Intercept handoff tool calls
                const toolName = event.data.toolName || event.data.name;
                console.log(`[Agent:${AGENT_ID}] Tool called: ${toolName}`);
                // Check if this is a handoff tool
                if ((0, handoff_tools_1.isHandoffTool)(toolName)) {
                    const targetAgent = (0, handoff_tools_1.getTargetAgentFromTool)(toolName);
                    if (targetAgent) {
                        const targetPersonaId = (0, handoff_tools_1.getPersonaIdForAgent)(targetAgent);
                        console.log(`[Agent:${AGENT_ID}] 🔄 HANDOFF TRIGGERED: ${AGENT_ID} → ${targetAgent} (${targetPersonaId})`);
                        // Extract handoff context from tool input
                        // Nova Sonic sends tool input in event.data.content as JSON string
                        let toolInput = {};
                        if (event.data.content) {
                            try {
                                toolInput = JSON.parse(event.data.content);
                                console.log(`[Agent:${AGENT_ID}] Parsed tool input from content:`, toolInput);
                            }
                            catch (e) {
                                console.error(`[Agent:${AGENT_ID}] Failed to parse tool content:`, e);
                            }
                        }
                        else if (event.data.input) {
                            toolInput = event.data.input;
                            console.log(`[Agent:${AGENT_ID}] Using tool input directly:`, toolInput);
                        }
                        // Build handoff context
                        const handoffContext = {
                            fromAgent: AGENT_ID,
                            lastUserMessage: toolInput.context || ''
                        };
                        // Handle return_to_triage specially
                        if (toolName === 'return_to_triage') {
                            handoffContext.taskCompleted = toolInput.taskCompleted || 'task_complete';
                            handoffContext.summary = toolInput.summary || 'Task completed successfully';
                            handoffContext.isReturn = true;
                            console.log(`[Agent:${AGENT_ID}] Returning to Triage - Task: ${handoffContext.taskCompleted}`);
                            console.log(`[Agent:${AGENT_ID}] Summary: ${handoffContext.summary}`);
                        }
                        else {
                            // Use reason from tool input, or fall back to stored userIntent from session
                            handoffContext.reason = toolInput.reason || toolInput.context || 'User needs specialist assistance';
                            // If we have stored userIntent in session, pass it along
                            if (!toolInput.reason && session.userIntent) {
                                handoffContext.reason = session.userIntent;
                                console.log(`[Agent:${AGENT_ID}] Using stored userIntent for handoff: ${session.userIntent}`);
                            }
                            console.log(`[Agent:${AGENT_ID}] Handoff reason: ${handoffContext.reason}`);
                        }
                        // CRITICAL: Include verified user data from session memory
                        // This ensures Banking agent receives customer name and account details
                        if (session.verifiedUser) {
                            handoffContext.verified = true;
                            handoffContext.userName = session.verifiedUser.customer_name;
                            handoffContext.account = session.verifiedUser.account;
                            handoffContext.sortCode = session.verifiedUser.sortCode;
                            console.log(`[Agent:${AGENT_ID}] Including verified user in handoff: ${handoffContext.userName}`);
                        }
                        // Send handoff request to gateway
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'handoff_request',
                                targetAgentId: targetPersonaId,
                                context: handoffContext
                            }));
                            console.log(`[Agent:${AGENT_ID}] Handoff request sent to gateway`);
                        }
                        // Return success to Nova Sonic (tool executed successfully)
                        // Nova Sonic will continue processing, but gateway will handle the actual handoff
                        break;
                    }
                }
                // Check if this is a banking tool
                if ((0, banking_tools_1.isBankingTool)(toolName)) {
                    console.log(`[Agent:${AGENT_ID}] 💰 BANKING TOOL: ${toolName}`);
                    // Parse tool input
                    const toolInput = event.data.content ? JSON.parse(event.data.content) : event.data.input || {};
                    console.log(`[Agent:${AGENT_ID}] Tool input:`, toolInput);
                    try {
                        // Call local-tools service
                        console.log(`[Agent:${AGENT_ID}] Calling local-tools service: ${LOCAL_TOOLS_URL}`);
                        const response = await axios_1.default.post(`${LOCAL_TOOLS_URL}/tools/execute`, {
                            tool: toolName,
                            input: toolInput
                        });
                        const result = response.data.result;
                        console.log(`[Agent:${AGENT_ID}] Tool result from local-tools:`, result);
                        // CRITICAL: Store IDV verification result in session memory
                        // AgentCore returns results wrapped in content array with text field
                        if (toolName === 'perform_idv_check') {
                            let idvData;
                            // Parse the result structure from AgentCore
                            if (result.content && result.content[0] && result.content[0].text) {
                                try {
                                    idvData = JSON.parse(result.content[0].text);
                                }
                                catch (e) {
                                    console.error(`[Agent:${AGENT_ID}] Failed to parse IDV result:`, e);
                                }
                            }
                            else if (result.auth_status) {
                                // Fallback: direct structure
                                idvData = result;
                            }
                            if (idvData && idvData.auth_status === 'VERIFIED') {
                                session.verifiedUser = {
                                    customer_name: idvData.customer_name,
                                    account: toolInput.accountNumber,
                                    sortCode: toolInput.sortCode,
                                    auth_status: idvData.auth_status
                                };
                                console.log(`[Agent:${AGENT_ID}] ✅ Stored verified user in session: ${idvData.customer_name}`);
                                // Also notify gateway to update session memory
                                if (ws.readyState === ws_1.WebSocket.OPEN) {
                                    ws.send(JSON.stringify({
                                        type: 'update_memory',
                                        memory: {
                                            verified: true,
                                            userName: idvData.customer_name,
                                            account: toolInput.accountNumber,
                                            sortCode: toolInput.sortCode
                                        }
                                    }));
                                    console.log(`[Agent:${AGENT_ID}] ✅ Sent update_memory to gateway`);
                                }
                            }
                            else {
                                console.log(`[Agent:${AGENT_ID}] IDV check failed or not verified`);
                            }
                        }
                        // Send result back to Nova Sonic
                        await session.sonicClient.sendToolResult(event.data.toolUseId, result, false);
                        // Forward tool result to client for debugging
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'tool_result',
                                toolName: toolName,
                                toolUseId: event.data.toolUseId,
                                result: result,
                                executionMode: 'local-tools'
                            }));
                        }
                        break;
                    }
                    catch (error) {
                        console.error(`[Agent:${AGENT_ID}] Banking tool error:`, error);
                        await session.sonicClient.sendToolResult(event.data.toolUseId, { error: error.message }, true);
                        break;
                    }
                }
                // Forward non-handoff tool usage to client for debugging
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'tool_use',
                        toolName: toolName,
                        toolUseId: event.data.toolUseId
                    }));
                }
                break;
            case 'metadata':
                // Forward metadata to client
                if (ws.readyState === ws_1.WebSocket.OPEN && event.data) {
                    ws.send(JSON.stringify({
                        type: 'metadata',
                        data: event.data
                    }));
                }
                break;
            case 'error':
                console.error(`[Agent:${AGENT_ID}] Nova Sonic error:`, event.data);
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Nova Sonic error',
                        details: event.data
                    }));
                }
                break;
            case 'interruption':
                // Forward interruption signal
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'interruption'
                    }));
                }
                break;
            case 'usageEvent':
                // Forward usage metrics
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'usage',
                        data: event.data
                    }));
                }
                break;
            default:
                console.log(`[Agent:${AGENT_ID}] Unhandled event type: ${event.type}`);
        }
    }
    catch (error) {
        console.error(`[Agent:${AGENT_ID}] Error handling Sonic event:`, error);
    }
}
// Register with gateway on startup
async function registerWithGateway() {
    try {
        const capabilities = workflowDef?.testConfig?.personaId
            ? [workflowDef.testConfig.personaId]
            : (workflowDef?.personaId ? [workflowDef.personaId] : []);
        const voiceId = personaConfig?.voiceId || workflowDef?.voiceId || 'matthew';
        const metadata = personaConfig?.metadata || workflowDef?.metadata || {};
        const response = await axios_1.default.post(`${GATEWAY_URL}/api/agents/register`, {
            id: AGENT_ID,
            url: `http://${AGENT_HOST}:${AGENT_PORT}`,
            capabilities,
            port: AGENT_PORT,
            voiceId,
            metadata: {
                ...metadata,
                personaId: personaConfig?.id,
                personaName: personaConfig?.name,
                allowedTools: personaConfig?.allowedTools || []
            }
        });
        console.log(`[Agent:${AGENT_ID}] Registered with gateway:`, response.data);
    }
    catch (error) {
        console.error(`[Agent:${AGENT_ID}] Failed to register with gateway:`, error.message);
    }
}
// Send heartbeat to gateway
async function sendHeartbeat() {
    try {
        await axios_1.default.post(`${GATEWAY_URL}/api/agents/heartbeat`, {
            agentId: AGENT_ID
        });
    }
    catch (error) {
        console.error(`[Agent:${AGENT_ID}] Heartbeat failed:`, error.message);
    }
}
// Start server
async function start() {
    // Validate AWS credentials
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        console.error(`[Agent:${AGENT_ID}] ERROR: AWS credentials not configured!`);
        console.error(`[Agent:${AGENT_ID}] Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables`);
        process.exit(1);
    }
    server.listen(AGENT_PORT, '0.0.0.0', async () => {
        console.log(`[Agent:${AGENT_ID}] HTTP server listening on port ${AGENT_PORT}`);
        console.log(`[Agent:${AGENT_ID}] WebSocket endpoint: ws://localhost:${AGENT_PORT}/session`);
        console.log(`[Agent:${AGENT_ID}] Health check: http://localhost:${AGENT_PORT}/health`);
        console.log(`[Agent:${AGENT_ID}] S2S Mode: ENABLED (Nova Sonic)`);
        console.log(`[Agent:${AGENT_ID}] AWS Region: ${AWS_REGION}`);
        // Register with gateway
        await registerWithGateway();
        // Start heartbeat (every 15 seconds)
        setInterval(sendHeartbeat, 15000);
    });
}
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(`\n[Agent:${AGENT_ID}] Shutting down gracefully...`);
    // Close all sessions
    for (const [sessionId, session] of activeSessions) {
        await session.sonicClient.stopSession();
        session.ws.close();
    }
    server.close(() => {
        console.log(`[Agent:${AGENT_ID}] Server closed`);
        process.exit(0);
    });
});
start();
