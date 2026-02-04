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
import { parseUserMessage } from './intent-parser';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '8080');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// --- DATA PATHS ---
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');

const WORKFLOWS_DIR = path.join(BASE_DIR, 'backend/workflows');
const TOOLS_DIR = path.join(BASE_DIR, 'backend/tools');
const HISTORY_DIR = path.join(BASE_DIR, 'backend/history');
const PROMPTS_DIR = path.join(BASE_DIR, 'backend/prompts');
const PERSONAS_DIR = path.join(BASE_DIR, 'backend/personas');

// Ensure directories exist
[WORKFLOWS_DIR, TOOLS_DIR, HISTORY_DIR, PROMPTS_DIR, PERSONAS_DIR].forEach(dir => {
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

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// Stub endpoints
app.get('/api/tests', (req: Request, res: Response) => res.json([]));
app.get('/api/presets', (req: Request, res: Response) => res.json([]));
app.get('/api/knowledge-bases', (req: Request, res: Response) => res.json([]));

// Health check
app.get('/health', async (req: Request, res: Response) => {
    const agents = await registry.getAllAgents();
    res.json({ status: 'healthy', service: 'gateway', agents: agents.length, timestamp: Date.now() });
});

// Agent registration
app.post('/api/agents/register', async (req: Request, res: Response) => {
    try {
        const { id, url, capabilities, port } = req.body;
        await registry.registerAgent({ id, url, status: 'healthy', capabilities: capabilities || [], lastHeartbeat: Date.now(), port });
        res.json({ success: true, message: `Agent ${id} registered` });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/heartbeat', async (req: Request, res: Response) => {
    try {
        const { agentId } = req.body;
        await registry.updateHeartbeat(agentId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Voices
app.get('/api/voices', (req: Request, res: Response) => {
    res.json([
        { id: 'tiffany', name: 'Tiffany (US Female, Polyglot)', language: 'en-US', polyglot: true },
        { id: 'matthew', name: 'Matthew (US Male, Polyglot)', language: 'en-US', polyglot: true },
        { id: 'amy', name: 'Amy (UK Female)', language: 'en-GB' },
        { id: 'olivia', name: 'Olivia (AU Female)', language: 'en-AU' },
        { id: 'kiara', name: 'Kiara (IN Female)', language: 'en-IN' },
        { id: 'arjun', name: 'Arjun (IN Male)', language: 'en-IN' },
        { id: 'ambre', name: 'Ambre (French Female)', language: 'fr-FR' },
        { id: 'florian', name: 'Florian (French Male)', language: 'fr-FR' },
        { id: 'beatrice', name: 'Beatrice (Italian Female)', language: 'it-IT' },
        { id: 'lorenzo', name: 'Lorenzo (Italian Male)', language: 'it-IT' },
        { id: 'tina', name: 'Tina (German Female)', language: 'de-DE' },
        { id: 'lennart', name: 'Lennart (German Male)', language: 'de-DE' },
        { id: 'lupe', name: 'Lupe (Spanish US Female)', language: 'es-US' },
        { id: 'carlos', name: 'Carlos (Spanish US Male)', language: 'es-US' },
        { id: 'carolina', name: 'Carolina (Portuguese Female)', language: 'pt-BR' },
        { id: 'leo', name: 'Leo (Portuguese Male)', language: 'pt-BR' }
    ]);
});

// History
app.get('/api/history', (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json') && f.startsWith('session_'));
        const historyList = files.map(f => {
            try {
                const content = readJsonFile(path.join(HISTORY_DIR, f));
                const firstUserMsg = content.transcript?.find((m: any) => m.role === 'user');
                const summary = firstUserMsg?.text || `Session ${content.sessionId?.substring(0, 8) || 'unknown'}`;
                return { id: f, date: content.startTime || fs.statSync(path.join(HISTORY_DIR, f)).mtimeMs, summary: summary, totalMessages: content.transcript?.length || 0, usage: content.usage, sentiment: content.averageSentiment || 0.5 };
            } catch (e) { return null; }
        }).filter(item => item !== null);
        res.json(historyList);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/history/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const filename = id.endsWith('.json') ? id : `${id}.json`;
        const sessionPath = path.join(HISTORY_DIR, filename);
        if (!fs.existsSync(sessionPath)) return res.status(404).json({ error: `Session ${id} not found` });
        const session = readJsonFile(sessionPath, null);
        if (!session) return res.status(404).json({ error: `Failed to read session ${id}` });
        res.json(session);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Workflows
app.get('/api/workflows', (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.startsWith('workflow_') && f.endsWith('.json'));
        const workflows = files.map(f => {
            const content = readJsonFile(path.join(WORKFLOWS_DIR, f), {});
            return { id: content.id || f, name: content.name || f };
        });
        res.json(workflows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/workflow/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const filename = id.startsWith('workflow_') ? (id.endsWith('.json') ? id : `${id}.json`) : `workflow_${id}.json`;
        const workflowPath = path.join(WORKFLOWS_DIR, filename);
        if (!fs.existsSync(workflowPath)) return res.status(404).json({ error: `Workflow ${id} not found` });
        res.json(readJsonFile(workflowPath, null));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/workflow/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const filename = id.startsWith('workflow_') ? `${id}.json` : `workflow_${id}.json`;
        fs.writeFileSync(path.join(WORKFLOWS_DIR, filename), JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Personas
app.get('/api/personas', (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(PERSONAS_DIR).filter(f => f.endsWith('.json'));
        const personas = files.map(file => {
            try {
                const persona = JSON.parse(fs.readFileSync(path.join(PERSONAS_DIR, file), 'utf-8'));
                return { id: persona.id || file.replace('.json', ''), name: persona.name || 'Untitled', description: persona.description || '', voiceId: persona.voiceId || 'matthew', workflows: persona.workflows || [], allowedToolsCount: (persona.allowedTools || []).length, metadata: persona.metadata || {} };
            } catch (e) { return null; }
        }).filter(p => p !== null);
        res.json(personas);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/personas/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const filePath = path.join(PERSONAS_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: `Persona ${id} not found` });
        const persona = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        let promptContent = null;
        if (persona.promptFile) {
            const promptPath = path.join(PROMPTS_DIR, persona.promptFile);
            if (fs.existsSync(promptPath)) promptContent = fs.readFileSync(promptPath, 'utf-8');
        }
        res.json({ ...persona, promptContent });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.put('/api/personas/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const filePath = path.join(PERSONAS_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: `Persona ${id} not found` });
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const { promptContent, ...personaData } = { ...existing, ...req.body, id: existing.id };
        fs.writeFileSync(filePath, JSON.stringify(personaData, null, 2));
        if (promptContent && personaData.promptFile) fs.writeFileSync(path.join(PROMPTS_DIR, personaData.promptFile), promptContent);
        res.json({ success: true, persona: personaData });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Prompts
app.get('/api/prompts', async (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.txt'));
        const prompts = files.map(f => {
            const content = fs.readFileSync(path.join(PROMPTS_DIR, f), 'utf-8');
            return { id: f.replace('.txt', ''), name: f.replace('.txt', '').replace(/_/g, ' '), content, source: 'local' };
        });
        res.json(prompts);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// System
app.get('/api/system/status', (req: Request, res: Response) => {
    res.json({ aws: (process.env.AWS_ACCESS_KEY_ID || process.env.NOVA_AWS_ACCESS_KEY_ID) ? 'connected' : 'error', region: process.env.AWS_REGION || process.env.NOVA_AWS_REGION || 'unknown' });
});

app.get('/api/agents', async (req: Request, res: Response) => {
    try { res.json(await registry.getAllAgents()); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tools', (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
        const tools = files.map(f => {
            const content = readJsonFile(path.join(TOOLS_DIR, f), {});
            return { id: f, name: content.toolSpec?.name || f, description: content.toolSpec?.description || '' };
        });
        res.json(tools);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// create HTTP and WebSocket servers
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/sonic' });
const activeConnections = new Map<string, WebSocket>();

wss.on('connection', async (clientWs: WebSocket) => {
    const sessionId = uuidv4();
    activeConnections.set(sessionId, clientWs);
    console.log(`[Gateway] New WebSocket connection: ${sessionId}`);

    let selectedWorkflowId = 'triage';
    let agentWs: WebSocket | null = null;
    let currentAgent: any = null;
    let sessionInitialized = false;
    let isInitializing = false;
    let isHandingOff = false;
    const messageQueue: { data: Buffer, isBinary: boolean }[] = [];

    clientWs.send(JSON.stringify({ type: 'connected', sessionId: sessionId, timestamp: Date.now() }));

    const trace = langfuse.trace({
        name: 'a2a-session',
        sessionId: sessionId,
        metadata: { initialAgent: selectedWorkflowId, timestamp: Date.now() }
    });
    const traceId = trace.id;

    const transcriptDedupe = new Set<string>();

    const connectToAgent = (agent: any): Promise<void> => {
        return new Promise((resolve, reject) => {
            const oldWs = agentWs;

            try {
                console.log(`[Gateway] Routing session ${sessionId} to agent: ${agent.id}`);
                const agentUrl = agent.url.replace('http://', 'ws://').replace('https://', 'wss://');
                const ws = new WebSocket(`${agentUrl}/session`);

                const timeout = setTimeout(() => {
                    if (ws.readyState !== WebSocket.OPEN) { ws.close(); reject(new Error(`Agent ${agent.id} connection timeout`)); }
                }, 5000);

                ws.on('error', (error) => { clearTimeout(timeout); reject(error); });
                ws.on('open', () => {
                    clearTimeout(timeout);
                    console.log(`[Gateway] Connected to agent: ${agent.id}`);

                    // Seamless swap: Update pointer and only then close old connection
                    agentWs = ws;
                    if (oldWs) {
                        setTimeout(() => {
                            try {
                                oldWs.removeAllListeners();
                                if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) oldWs.close();
                            } catch (e) { }
                        }, 500);
                    }

                    router.getMemory(sessionId).then(async (memory) => {
                        ws.send(JSON.stringify({ type: 'session_init', sessionId, traceId, memory: memory || {}, graphState: memory?.graphState, timestamp: Date.now() }));

                        // Buffer flush
                        while (messageQueue.length > 0) {
                            const msg = messageQueue.shift();
                            if (msg && ws.readyState === WebSocket.OPEN) ws.send(msg.data, { binary: msg.isBinary });
                        }

                        // Proactive trigger for the new agent to speak first
                        if (isHandingOff) {
                            console.log(`[Gateway] Sending handoff trigger to agent: ${agent.id}`);
                            ws.send(JSON.stringify({
                                type: 'text_input',
                                text: '[System: User has been transferred to you. Please greet them and proceed with the verification or task.]',
                                skipTranscript: true,
                                timestamp: Date.now()
                            }));
                        }

                        resolve();
                    }).catch(reject);
                });

                ws.on('message', (data: Buffer, isBinary: boolean) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        try {
                            if (!isBinary) {
                                const message = JSON.parse(data.toString());
                                const handoffTools = ['transfer_to_idv', 'transfer_to_banking', 'transfer_to_disputes', 'transfer_to_investigation', 'transfer_to_mortgage', 'return_to_triage'];

                                // Anti-duplication for transcripts
                                if (message.type === 'transcript' && message.id) {
                                    if (transcriptDedupe.has(message.id)) return;
                                    transcriptDedupe.add(message.id);
                                    // Periodic cleanup
                                    if (transcriptDedupe.size > 100) {
                                        const first = transcriptDedupe.values().next().value;
                                        if (first) transcriptDedupe.delete(first);
                                    }
                                }

                                // Identity Synthesis: Intercept IDV results to update central memory
                                if (message.type === 'tool_result' && message.toolName === 'perform_idv_check') {
                                    if (message.success && message.result?.auth_status === 'VERIFIED') {
                                        console.log(`[Gateway] ✅ Detected successful IDV. Syncing memory.`);
                                        router.updateMemory(sessionId, {
                                            verified: true,
                                            userName: message.result.customer_name,
                                            account: message.result.account,
                                            sortCode: message.result.sortCode
                                        });
                                    }
                                }

                                if (message.type === 'tool_use' && handoffTools.includes(message.toolName)) {
                                    console.log(`[Gateway] 🔄 INTERCEPTED HANDOFF: ${message.toolName}`);

                                    // SHIELD current agent from any more user input immediately
                                    isHandingOff = true;

                                    // Acknowledge to agent so it can finish its turn properly
                                    ws.send(JSON.stringify({
                                        type: 'tool_result',
                                        toolName: message.toolName,
                                        toolUseId: message.toolUseId,
                                        result: { status: 'handoff_initiated', target: message.toolName },
                                        success: true,
                                        timestamp: Date.now()
                                    }));

                                    // Wait for agent to finish speaking (if it had more to say) then swap
                                    setTimeout(async () => {
                                        const targetId = message.toolName.replace('transfer_to_', '').replace('return_to_', '');
                                        const targetAgent = await registry.getAgent(targetId);
                                        if (targetAgent) {
                                            currentAgent = targetAgent;
                                            try {
                                                await connectToAgent(targetAgent);
                                            } catch (err) {
                                                console.error(`[Gateway] Handoff failed:`, err);
                                                isHandingOff = false; // Reset if failed
                                            } finally {
                                                isHandingOff = false;
                                            }
                                        } else {
                                            isHandingOff = false;
                                        }
                                    }, 1500); // reduced to 1.5s for snappier transition

                                    // Inform client of handoff for UI/logging
                                    clientWs.send(JSON.stringify({
                                        type: 'handoff_event',
                                        target: message.toolName.replace('transfer_to_', ''),
                                        timestamp: Date.now()
                                    }));
                                    return;
                                }
                                if (message.type === 'update_memory') {
                                    router.updateMemory(sessionId, message.memory);
                                    return;
                                }
                            }
                        } catch (e) { }

                        // Strict output management to prevent echo
                        if (agentWs === ws) {
                            clientWs.send(data, { binary: isBinary });
                        }
                    }
                });

                ws.on('close', () => { if (agentWs === ws) agentWs = null; });
            } catch (error) { reject(error); }
        });
    };

    clientWs.on('message', async (data: Buffer) => {
        try {
            const isBinary = Buffer.isBuffer(data) && data.length > 0 && data[0] !== 0x7B;
            if (!isBinary) {
                const message = JSON.parse(data.toString());

                // Proactive extraction of credentials and intent
                if (message.type === 'text_input' && message.text) {
                    const parsed = parseUserMessage(message.text);
                    if (parsed.accountNumber || parsed.sortCode || parsed.intent) {
                        const currentMemory = await router.getMemory(sessionId);
                        const updates: any = {};
                        if (parsed.accountNumber) updates.account = parsed.accountNumber;
                        if (parsed.sortCode) updates.sortCode = parsed.sortCode;
                        if (parsed.intent && !currentMemory?.userIntent) updates.userIntent = parsed.intent;
                        updates.lastUserMessage = message.text;

                        if (Object.keys(updates).length > 0) {
                            await router.updateMemory(sessionId, updates);
                            const finalMemory = await router.getMemory(sessionId);
                            if (agentWs && agentWs.readyState === WebSocket.OPEN) {
                                agentWs.send(JSON.stringify({
                                    type: 'memory_update',
                                    sessionId,
                                    memory: finalMemory,
                                    graphState: finalMemory?.graphState,
                                    timestamp: Date.now()
                                }));
                            }
                        }
                    }
                }

                if (message.type === 'select_workflow') {
                    selectedWorkflowId = message.workflowId || 'triage';
                    if (!sessionInitialized && !isInitializing) {
                        isInitializing = true;
                        try {
                            await router.createSession(sessionId, selectedWorkflowId);
                            const agent = await router.routeToAgent(sessionId);
                            if (agent) { currentAgent = agent; await connectToAgent(agent); sessionInitialized = true; }
                        } finally { isInitializing = false; }
                    }
                    return;
                }
                if (message.type === 'ping') { clientWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() })); return; }
                if (!sessionInitialized && !isInitializing && !isHandingOff) {
                    isInitializing = true;
                    try {
                        await router.createSession(sessionId, selectedWorkflowId);
                        const agent = await router.routeToAgent(sessionId);
                        if (agent) { currentAgent = agent; await connectToAgent(agent); sessionInitialized = true; }
                    } finally { isInitializing = false; }
                }
            }
            // Forward or buffer based on state
            if (agentWs && agentWs.readyState === WebSocket.OPEN && !isHandingOff) {
                agentWs.send(data, { binary: isBinary });
            } else if (isInitializing || isHandingOff || (agentWs && agentWs.readyState === WebSocket.CONNECTING)) {
                // Buffer user input during transtions
                messageQueue.push({ data, isBinary });
            }
        } catch (error) {
            // audio usually
            if (agentWs && agentWs.readyState === WebSocket.OPEN && !isHandingOff) {
                agentWs.send(data, { binary: true });
            } else if (isInitializing || isHandingOff) {
                messageQueue.push({ data, isBinary: true });
            }
        }
    });

    clientWs.on('close', async () => {
        activeConnections.delete(sessionId);
        if (agentWs) { try { agentWs.close(); } catch (e) { } }
        setTimeout(async () => { await router.deleteSession(sessionId); }, 60000);
    });

    clientWs.on('error', (error) => {
        console.error('[Gateway] Client WebSocket error:', error);
    });
});

async function start() {
    const maxRetries = 10;
    let retryCount = 0;
    while (retryCount < maxRetries) {
        try {
            await registry.connect();
            await router.connect();
            console.log('[Gateway] Successfully connected to Redis');
            break;
        } catch (error) {
            retryCount++;
            if (retryCount >= maxRetries) process.exit(1);
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    server.listen(PORT, '0.0.0.0', () => console.log(`[Gateway] Listening on ${PORT}`));
}

process.on('SIGINT', async () => {
    for (const [id, ws] of activeConnections) {
        try { ws.close(); } catch (e) { }
    }
    await registry.close();
    await router.close();
    server.close(() => process.exit(0));
});

start();
