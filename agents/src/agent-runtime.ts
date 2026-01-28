import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { GraphExecutor } from './graph-executor';
import { WorkflowDefinition } from './graph-types';
import { ToolsClient } from './tools-client';

// Environment configuration
const AGENT_ID = process.env.AGENT_ID || 'unknown';
const AGENT_PORT = parseInt(process.env.AGENT_PORT || '8081');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:8080';
const LOCAL_TOOLS_URL = process.env.LOCAL_TOOLS_URL || 'http://local-tools:9000';
const AGENTCORE_URL = process.env.AGENTCORE_URL;
const WORKFLOW_FILE = process.env.WORKFLOW_FILE || '/app/workflow.json';

// Initialize tools client
const toolsClient = new ToolsClient(LOCAL_TOOLS_URL, AGENTCORE_URL);

// Load workflow definition
let workflowDef: WorkflowDefinition | null = null;
try {
    if (fs.existsSync(WORKFLOW_FILE)) {
        workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf-8'));
        console.log(`[Agent:${AGENT_ID}] Loaded workflow from ${WORKFLOW_FILE}`);
    } else {
        console.error(`[Agent:${AGENT_ID}] Workflow file not found: ${WORKFLOW_FILE}`);
    }
} catch (error) {
    console.error(`[Agent:${AGENT_ID}] Failed to load workflow:`, error);
}

// Initialize graph executor
let graphExecutor: GraphExecutor | null = null;
if (workflowDef) {
    try {
        graphExecutor = new GraphExecutor(workflowDef);
        console.log(`[Agent:${AGENT_ID}] Graph executor initialized`);
    } catch (error) {
        console.error(`[Agent:${AGENT_ID}] Failed to initialize graph executor:`, error);
    }
}

// Express app
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: graphExecutor ? 'healthy' : 'unhealthy',
        agent: AGENT_ID,
        workflow: workflowDef?.testConfig?.personaId || 'unknown',
        timestamp: Date.now()
    });
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for session handling
const wss = new WebSocketServer({ server, path: '/session' });

// Active sessions
const activeSessions = new Map<string, any>();

wss.on('connection', (ws: WebSocket) => {
    let sessionId: string | null = null;

    console.log(`[Agent:${AGENT_ID}] New WebSocket connection`);

    ws.on('message', async (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());

            // Handle session initialization
            if (message.type === 'session_init') {
                sessionId = message.sessionId;
                if (!sessionId) return;
                activeSessions.set(sessionId, {
                    sessionId,
                    ws,
                    startTime: Date.now(),
                    messages: []
                });
                console.log(`[Agent:${AGENT_ID}] Session initialized: ${sessionId}`);

                // Send acknowledgment
                ws.send(JSON.stringify({
                    type: 'session_ack',
                    sessionId,
                    agent: AGENT_ID
                }));
                return;
            }

            // Handle user input
            if (message.type === 'user_input' && sessionId) {
                const session = activeSessions.get(sessionId);
                if (!session) {
                    console.error(`[Agent:${AGENT_ID}] Session not found: ${sessionId}`);
                    return;
                }

                const userText = message.text || message.transcript;
                console.log(`[Agent:${AGENT_ID}] User input: ${userText}`);

                session.messages.push({
                    role: 'user',
                    content: userText,
                    timestamp: Date.now()
                });

                // Execute workflow
                if (graphExecutor) {
                    try {
                        const initialState: any = {
                            context: {
                                sessionId,
                                userId: 'user',
                                input: userText
                            },
                            messages: [{ role: 'user', content: userText }],
                            currentWorkflowId: AGENT_ID,
                            currentNodeId: 'start'
                        };

                        const events = await graphExecutor.stream(initialState);

                        // Process events
                        for (const event of events) {
                            console.log(`[Agent:${AGENT_ID}] Graph event:`, event);

                            // Send events back to gateway/client
                            ws.send(JSON.stringify({
                                type: 'graph_event',
                                event
                            }));

                            // Check for handoff request in any of the node outputs
                            // LangGraph events are usually { nodeName: { ...state } }
                            const nodeName = Object.keys(event)[0];
                            const stateUpdate = event[nodeName];

                            if (stateUpdate && stateUpdate.handoff) {
                                console.log(`[Agent:${AGENT_ID}] Handoff requested to: ${stateUpdate.handoff}`);
                                ws.send(JSON.stringify({
                                    type: 'handoff_request',
                                    sessionId,
                                    targetAgentId: stateUpdate.handoff,
                                    context: {
                                        lastInput: userText,
                                        extractedEntities: stateUpdate.extractedEntities || {},
                                        history: stateUpdate.messages || [],
                                        // Include any other state pieces needed for handoff
                                    },
                                    reason: `Handoff triggered by node: ${nodeName}`
                                }));

                                // After requesting handoff, we should probably stop processing this session
                                return;
                            }
                        }

                        // Send final response
                        ws.send(JSON.stringify({
                            type: 'assistant_response',
                            text: 'Workflow executed successfully',
                            isFinal: true
                        }));

                    } catch (error: any) {
                        console.error(`[Agent:${AGENT_ID}] Workflow execution error:`, error);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: error.message
                        }));
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'No workflow executor available'
                    }));
                }
            }

        } catch (error) {
            console.error(`[Agent:${AGENT_ID}] Message handling error:`, error);
        }
    });

    ws.on('close', () => {
        if (sessionId) {
            console.log(`[Agent:${AGENT_ID}] Session closed: ${sessionId}`);
            activeSessions.delete(sessionId);
        }
    });

    ws.on('error', (error) => {
        console.error(`[Agent:${AGENT_ID}] WebSocket error:`, error);
    });
});

// Register with gateway on startup
async function registerWithGateway() {
    try {
        const response = await axios.post(`${GATEWAY_URL}/api/agents/register`, {
            id: AGENT_ID,
            url: `http://agent-${AGENT_ID}:${AGENT_PORT}`,
            capabilities: workflowDef?.testConfig?.personaId ? [workflowDef.testConfig.personaId] : [],
            port: AGENT_PORT
        });
        console.log(`[Agent:${AGENT_ID}] Registered with gateway:`, response.data);
    } catch (error: any) {
        console.error(`[Agent:${AGENT_ID}] Failed to register with gateway:`, error.message);
    }
}

// Send heartbeat to gateway
async function sendHeartbeat() {
    try {
        await axios.post(`${GATEWAY_URL}/api/agents/heartbeat`, {
            agentId: AGENT_ID
        });
    } catch (error: any) {
        console.error(`[Agent:${AGENT_ID}] Heartbeat failed:`, error.message);
    }
}

// Start server
async function start() {
    server.listen(AGENT_PORT, '0.0.0.0', async () => {
        console.log(`[Agent:${AGENT_ID}] HTTP server listening on port ${AGENT_PORT}`);
        console.log(`[Agent:${AGENT_ID}] WebSocket endpoint: ws://localhost:${AGENT_PORT}/session`);
        console.log(`[Agent:${AGENT_ID}] Health check: http://localhost:${AGENT_PORT}/health`);

        // Register with gateway
        await registerWithGateway();

        // Start heartbeat (every 15 seconds)
        setInterval(sendHeartbeat, 15000);
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log(`\n[Agent:${AGENT_ID}] Shutting down gracefully...`);

    // Close all sessions
    for (const [sessionId, session] of activeSessions) {
        session.ws.close();
    }

    server.close(() => {
        console.log(`[Agent:${AGENT_ID}] Server closed`);
        process.exit(0);
    });
});

start();
