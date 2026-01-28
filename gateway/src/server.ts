import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import cors from 'cors';
import { Langfuse } from 'langfuse';
import { AgentRegistry } from './agent-registry';
import { SessionRouter } from './session-router';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '8080');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// --- DATA PATHS ---
const WORKFLOWS_DIR = path.join(process.cwd(), 'workflows');
const TOOLS_DIR = path.join(process.cwd(), 'tools');
const HISTORY_DIR = path.join(process.cwd(), 'history');
const PROMPTS_DIR = path.join(process.cwd(), 'prompts');

// Ensure directories exist
[WORKFLOWS_DIR, TOOLS_DIR, HISTORY_DIR, PROMPTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Helper for JSON File I/O
const readJsonFile = (filePath: string, defaultVal: any = []) => {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (e) {
        console.error(`[Gateway] Failed to read ${filePath}:`, e);
    }
    return defaultVal;
};

// Initialize services
const registry = new AgentRegistry(REDIS_URL);
const router = new SessionRouter(REDIS_URL, registry);
const langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST || "https://cloud.langfuse.com"
});

// Express app for health checks and management APIs
const app = express();
app.use(cors());
app.use(express.json());

// Stub endpoints for remaining ones
app.get('/api/tests', (req: Request, res: Response) => res.json([]));
app.get('/api/presets', (req: Request, res: Response) => res.json([]));
app.get('/api/knowledge-bases', (req: Request, res: Response) => res.json([]));

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
    const agents = await registry.getAllAgents();
    res.json({
        status: 'healthy',
        service: 'gateway',
        agents: agents.length,
        timestamp: Date.now()
    });
});

// Agent registration endpoint (called by agents on startup)
app.post('/api/agents/register', async (req: Request, res: Response) => {
    try {
        const { id, url, capabilities, port } = req.body;
        await registry.registerAgent({
            id,
            url,
            status: 'healthy',
            capabilities: capabilities || [],
            lastHeartbeat: Date.now(),
            port
        });
        res.json({ success: true, message: `Agent ${id} registered` });
    } catch (error: any) {
        console.error('[Gateway] Agent registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Agent heartbeat endpoint
app.post('/api/agents/heartbeat', async (req: Request, res: Response) => {
    try {
        const { agentId } = req.body;
        await registry.updateHeartbeat(agentId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API endpoints for frontend compatibility
// These are stub implementations - in production, these would be backed by a database

// Voices endpoint
app.get('/api/voices', (req: Request, res: Response) => {
    res.json([
        { id: 'nova-sonic', name: 'Nova Sonic (AWS)', language: 'en-US' },
        { id: 'Matthew', name: 'Matthew (US Male)', language: 'en-US' },
        { id: 'Ruth', name: 'Ruth (US Female)', language: 'en-US' },
        { id: 'Stephen', name: 'Stephen (US Male)', language: 'en-US' },
        { id: 'Amy', name: 'Amy (GB Female)', language: 'en-GB' }
    ]);
});

// History endpoint
app.get('/api/history', (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(HISTORY_DIR)
            .filter(f => f.endsWith('.json') && f.startsWith('session_'));

        const historyList = files.map(f => {
            try {
                const content = readJsonFile(path.join(HISTORY_DIR, f));
                const firstUserMsg = content.transcript?.find((m: any) => m.role === 'user');
                const summary = firstUserMsg?.text || `Session ${content.sessionId?.substring(0, 8) || 'unknown'}`;

                return {
                    id: f,
                    date: content.startTime || fs.statSync(path.join(HISTORY_DIR, f)).mtimeMs,
                    summary: summary,
                    totalMessages: content.transcript?.length || 0,
                    usage: content.usage,
                    sentiment: content.averageSentiment || 0.5
                };
            } catch (e) { return null; }
        }).filter(item => item !== null);

        res.json(historyList);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Workflows endpoint
app.get('/api/workflows', (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.startsWith('workflow_') && f.endsWith('.json'));
        const workflows = files.map(f => {
            const content = readJsonFile(path.join(WORKFLOWS_DIR, f), {});
            return { id: content.id || f, name: content.name || f };
        });
        res.json(workflows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Tools endpoint
app.get('/api/tools', (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
        const tools = files.map(f => {
            const content = readJsonFile(path.join(TOOLS_DIR, f), {});
            return {
                id: f,
                name: content.toolSpec?.name || f,
                description: content.toolSpec?.description || ''
            };
        });
        res.json(tools);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// System Status endpoint
app.get('/api/system/status', (req: Request, res: Response) => {
    const awsConnected = !!(process.env.AWS_ACCESS_KEY_ID || process.env.NOVA_AWS_ACCESS_KEY_ID);
    res.json({
        aws: awsConnected ? 'connected' : 'error',
        region: process.env.AWS_REGION || process.env.NOVA_AWS_REGION || 'unknown'
    });
});

app.post('/api/system/debug', (req: Request, res: Response) => {
    const { enabled } = req.body;
    process.env.DEBUG = enabled ? 'true' : 'false';
    console.log(`[Gateway] Debug mode set to: ${enabled}`);
    res.json({ success: true, debug: enabled });
});

app.post('/api/system/reset', async (req: Request, res: Response) => {
    console.log('[Gateway] Initiating System Reset (Stubs only)...');
    res.json({ success: true, message: 'System reset initiated (stub)' });
});

// Prompts endpoint (with Langfuse fetch logic)
app.get('/api/prompts', async (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.txt'));
        if (files.length === 0) {
            console.log('[Gateway] No local prompts found, forcing sync...');
            // In a real app we'd wait for sync or return empty
        }

        const prompts = files.map(f => {
            const content = fs.readFileSync(path.join(PROMPTS_DIR, f), 'utf-8');
            let displayName = f.replace('.txt', '');
            if (displayName.startsWith('core-')) {
                displayName = 'Core ' + displayName.substring(5).replace(/_/g, ' ');
            } else if (displayName.startsWith('persona-')) {
                displayName = 'Persona ' + displayName.substring(8).replace(/_/g, ' ');
            } else {
                displayName = displayName.replace(/_/g, ' ');
            }
            displayName = displayName.replace(/\b\w/g, l => l.toUpperCase());

            return {
                id: f.replace('.txt', ''),
                name: displayName,
                content: content,
                source: 'local'
            };
        });
        res.json(prompts);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/prompts/sync', async (req: Request, res: Response) => {
    try {
        // Trigger sync - simplified implementation
        console.log('[Gateway] Syncing prompts with Langfuse...');
        // @ts-ignore
        const response = await langfuse.api.promptsList({ limit: 100 });
        if (response && response.data) {
            for (const p of response.data) {
                try {
                    const prompt = await langfuse.getPrompt(p.name);
                    const content = prompt.compile();
                    fs.writeFileSync(path.join(PROMPTS_DIR, `${p.name}.txt`), content);
                } catch (err) {
                    console.error(`[Gateway] Failed to sync prompt ${p.name}:`, err);
                }
            }
        }
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Stub endpoints for remaining ones
app.get('/api/tests', (req, res) => res.json([]));
app.get('/api/presets', (req, res) => res.json([]));
app.get('/api/knowledge-bases', (req, res) => res.json([]));


// Create HTTP server
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/sonic' });

// Active WebSocket connections
const activeConnections = new Map<string, WebSocket>();

wss.on('connection', async (ws: WebSocket) => {
    const sessionId = uuidv4();
    activeConnections.set(sessionId, ws);

    console.log(`[Gateway] New WebSocket connection: ${sessionId}`);

    // Create Langfuse trace for this session
    const trace = langfuse.trace({
        name: 'a2a-session',
        sessionId: sessionId,
        metadata: {
            initialAgent: 'triage',
            timestamp: Date.now()
        }
    });
    const traceId = trace.id;
    console.log(`[Gateway] Created Langfuse trace: ${traceId}`);

    // Create session and route to triage agent
    const session = await router.createSession(sessionId, 'triage');
    const triageAgent = await router.routeToAgent(sessionId);

    if (!triageAgent) {
        console.error('[Gateway] No triage agent available');
        ws.send(JSON.stringify({
            type: 'error',
            message: 'No agents available. Please try again later.'
        }));
        ws.close();
        return;
    }

    // Establish connection to agent
    let agentWs: WebSocket | null = null;
    let currentAgent = triageAgent;

    const connectToAgent = async (agent: any) => {
        if (agentWs) {
            agentWs.removeAllListeners();
            agentWs.close();
        }

        try {
            console.log(`[Gateway] Routing session ${sessionId} to agent: ${agent.id}`);
            const agentUrl = agent.url.replace('http://', 'ws://').replace('https://', 'wss://');
            agentWs = new WebSocket(`${agentUrl}/session`);

            agentWs.on('open', () => {
                console.log(`[Gateway] Connected to agent: ${agent.id}`);
                // Send session initialization with trace context
                agentWs!.send(JSON.stringify({
                    type: 'session_init',
                    sessionId,
                    traceId,  // Pass trace ID to agent
                    timestamp: Date.now()
                }));
            });

            // Handle messages from agent
            agentWs.on('message', async (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString());

                    // INTERCEPT Hand-off requests!
                    if (message.type === 'handoff_request') {
                        console.log(`[Gateway] Handoff requested: ${agent.id} -> ${message.targetAgentId}`);
                        
                        // Tag handoff event in Langfuse
                        trace.event({
                            name: 'a2a-handoff',
                            metadata: {
                                from: agent.id,
                                to: message.targetAgentId,
                                reason: message.reason || 'unknown',
                                sessionId: sessionId
                            }
                        });

                        // 1. Update session in Redis
                        await router.transferSession(sessionId, message.targetAgentId);

                        // 2. Resolve new agent
                        const nextAgent = await router.routeToAgent(sessionId);
                        if (nextAgent) {
                            currentAgent = nextAgent;
                            // 3. Re-route!
                            await connectToAgent(nextAgent);
                        } else {
                            console.error(`[Gateway] Target agent ${message.targetAgentId} not found for handoff`);
                        }
                        return;
                    }

                    // Forward all other messages to client
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(data);
                    }
                } catch (e) {
                    // If not JSON, just forward (binary audio etc)
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(data);
                    }
                }
            });

            agentWs.on('close', () => {
                console.log(`[Gateway] Agent ${agent.id} closed connection for session ${sessionId}`);
            });

            agentWs.on('error', (error) => {
                console.error(`[Gateway] Agent ${agent.id} WebSocket error:`, error);
            });

        } catch (error) {
            console.error(`[Gateway] Failed to connect to agent ${agent.id}:`, error);
            ws.send(JSON.stringify({
                type: 'error',
                message: `Failed to connect to agent ${agent.id}`
            }));
        }
    };

    // Connect to initial triage agent
    await connectToAgent(triageAgent);

    // Forward messages from client to current agent
    ws.on('message', async (data: Buffer, isBinary: boolean) => {
        try {
            const message = JSON.parse(data.toString());

            // Handle special gateway commands
            if (message.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                return;
            }

            // Forward to current agent
            if (agentWs && agentWs.readyState === WebSocket.OPEN) {
                agentWs.send(data, { binary: isBinary });
            }
        } catch (error) {
            // Forward non-JSON (audio) to current agent
            if (agentWs && agentWs.readyState === WebSocket.OPEN) {
                agentWs.send(data, { binary: isBinary });
            }
        }
    });

    // Handle client disconnection
    ws.on('close', async () => {
        console.log(`[Gateway] Client disconnected: ${sessionId}`);
        activeConnections.delete(sessionId);

        // Close agent connection
        if (agentWs) {
            agentWs.close();
        }

        // Clean up session (with delay to allow for reconnection)
        setTimeout(async () => {
            await router.deleteSession(sessionId);
        }, 60000); // 1 minute grace period
    });

    ws.on('error', (error) => {
        console.error('[Gateway] WebSocket error:', error);
    });
});

// Start server with retry logic
async function start() {
    const maxRetries = 10;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            console.log(`[Gateway] Attempting to connect to Redis (attempt ${retryCount + 1}/${maxRetries})...`);
            await registry.connect();
            await router.connect();
            console.log('[Gateway] Successfully connected to Redis');
            break;
        } catch (error) {
            retryCount++;
            if (retryCount >= maxRetries) {
                console.error('[Gateway] Failed to connect to Redis after max retries');
                process.exit(1);
            }
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
            console.log(`[Gateway] Redis connection failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`[Gateway] HTTP server listening on port ${PORT}`);
        console.log(`[Gateway] WebSocket endpoint: ws://localhost:${PORT}/sonic`);
        console.log(`[Gateway] Health check: http://localhost:${PORT}/health`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[Gateway] Shutting down gracefully...');

    // Close all WebSocket connections
    for (const [sessionId, ws] of activeConnections) {
        ws.close();
    }

    await registry.close();
    await router.close();

    server.close(() => {
        console.log('[Gateway] Server closed');
        process.exit(0);
    });
});

start();
