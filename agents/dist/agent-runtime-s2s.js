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
const axios_1 = __importDefault(require("axios"));
const graph_executor_1 = require("./graph-executor");
const tools_client_1 = require("./tools-client");
const sonic_client_1 = require("./sonic-client");
const workflow_utils_1 = require("./workflow-utils");
const decision_evaluator_1 = require("./decision-evaluator");
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
// Initialize tools client
const toolsClient = new tools_client_1.ToolsClient(LOCAL_TOOLS_URL, AGENTCORE_URL);
// Initialize decision evaluator
const decisionEvaluator = new decision_evaluator_1.DecisionEvaluator(AWS_REGION);
// Load workflow definition
let workflowDef = null;
try {
    if (fs.existsSync(WORKFLOW_FILE)) {
        workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf-8'));
        console.log(`[Agent:${AGENT_ID}] Loaded workflow from ${WORKFLOW_FILE}`);
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
                        systemPrompt = (0, workflow_utils_1.convertWorkflowToText)(workflowDef);
                        console.log(`[Agent:${AGENT_ID}] Injected workflow context (${systemPrompt.length} chars)`);
                        // Update session config with workflow instructions and voice
                        sonicClient.updateSessionConfig({
                            systemPrompt,
                            voiceId: workflowDef.voiceId || 'Matthew'
                        });
                        console.log(`[Agent:${AGENT_ID}] Voice configured: ${workflowDef.voiceId || 'Matthew'}`);
                    }
                    // Store session BEFORE starting Nova (so it's available for incoming messages)
                    activeSessions.set(sessionId, {
                        sessionId,
                        ws,
                        sonicClient,
                        graphExecutor,
                        startTime: Date.now(),
                        messages: [],
                        currentNode: workflowDef?.nodes?.find((n) => n.type === 'start')?.id
                    });
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
                // Log tool usage (Nova Sonic handles the actual execution)
                console.log(`[Agent:${AGENT_ID}] Tool called: ${event.data.toolName || event.data.name}`);
                // Forward to client for debugging
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'tool_use',
                        toolName: event.data.toolName || event.data.name,
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
        const response = await axios_1.default.post(`${GATEWAY_URL}/api/agents/register`, {
            id: AGENT_ID,
            url: `http://${AGENT_HOST}:${AGENT_PORT}`,
            capabilities: workflowDef?.testConfig?.personaId ? [workflowDef.testConfig.personaId] : [],
            port: AGENT_PORT,
            voiceId: workflowDef?.voiceId || 'Matthew',
            metadata: workflowDef?.metadata || {}
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
