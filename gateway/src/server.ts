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

// Gateway Routing Endpoints for Agent-to-Agent Communication

// Update session memory (called by agents via Gateway Router)
app.post('/api/sessions/:sessionId/memory', async (req: Request, res: Response) => {
    try {
        const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
        const { memory } = req.body;
        const agentId = req.headers['x-agent-id'];

        console.log(`[Gateway] Memory update request from agent ${agentId} for session ${sessionId}`);
        console.log(`[Gateway] Memory keys: ${Object.keys(memory || {}).join(', ')}`);

        const success = await router.updateMemory(sessionId, memory);

        if (success) {
            res.json({ success: true, sessionId, timestamp: Date.now() });
        } else {
            res.status(404).json({ success: false, error: 'Session not found' });
        }
    } catch (e: any) {
        console.error('[Gateway] Memory update error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get session memory (called by agents via Gateway Router)
app.get('/api/sessions/:sessionId/memory', async (req: Request, res: Response) => {
    try {
        const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
        const agentId = req.headers['x-agent-id'];

        console.log(`[Gateway] Memory retrieval request from agent ${agentId} for session ${sessionId}`);

        const memory = await router.getMemory(sessionId);

        if (memory) {
            res.json({ success: true, memory, timestamp: Date.now() });
        } else {
            res.status(404).json({ success: false, error: 'Session not found' });
        }
    } catch (e: any) {
        console.error('[Gateway] Memory retrieval error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Transfer session to another agent (called by agents via Gateway Router)
app.post('/api/sessions/:sessionId/transfer', async (req: Request, res: Response) => {
    try {
        const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
        const { targetAgent, reason } = req.body;
        const agentId = req.headers['x-agent-id'];

        console.log(`[Gateway] Transfer request from agent ${agentId}: ${sessionId} → ${targetAgent}`);
        console.log(`[Gateway] Reason: ${reason}`);

        const success = await router.transferSession(sessionId, targetAgent);

        if (success) {
            res.json({ success: true, sessionId, targetAgent, timestamp: Date.now() });
        } else {
            res.status(404).json({ success: false, error: 'Transfer failed' });
        }
    } catch (e: any) {
        console.error('[Gateway] Transfer error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get agent status (called by agents via Gateway Router)
app.get('/api/agents/:agentId', async (req: Request, res: Response) => {
    try {
        const agentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
        const agent = await registry.getAgent(agentId);

        if (agent) {
            res.json(agent);
        } else {
            res.status(404).json({ error: 'Agent not found' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Update agent status (called by agents via Gateway Router)
app.post('/api/agents/:agentId/status', async (req: Request, res: Response) => {
    try {
        const agentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
        const { status, details } = req.body;

        console.log(`[Gateway] Agent ${agentId} status update: ${status}`);

        // For now, just acknowledge - could extend to track agent status in Redis
        res.json({ success: true, agentId, status, timestamp: Date.now() });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// create HTTP and WebSocket servers
const server = createServer(app);
const wss = new WebSocketServer({ 
    server, 
    path: '/sonic',
    verifyClient: (info: any) => {
        console.log(`[Gateway] WebSocket connection attempt from origin: ${info.origin}`);
        return true; // Accept all connections
    }
});
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
                        console.log(`[Gateway] Sending session_init to ${agent.id} with memory:`, JSON.stringify(memory).substring(0, 200));
                        
                        ws.send(JSON.stringify({ type: 'session_init', sessionId, traceId, memory: memory || {}, graphState: memory?.graphState, timestamp: Date.now() }));

                        // CRITICAL: Wait for agent to initialize session before flushing buffer
                        // This prevents "Session not found" errors
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Buffer flush
                        console.log(`[Gateway] Flushing ${messageQueue.length} buffered messages to ${agent.id}`);
                        while (messageQueue.length > 0) {
                            const msg = messageQueue.shift();
                            if (msg && ws.readyState === WebSocket.OPEN) ws.send(msg.data, { binary: msg.isBinary });
                        }

                        // REMOVED: Gateway handoff trigger - agents now use auto-trigger instead
                        // This prevents duplicate messages and race conditions
                        // Agents will auto-trigger based on their own logic after session_init

                        resolve();
                    }).catch(reject);
                });

                ws.on('message', async (data: Buffer, isBinary: boolean) => {
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
                                    // Parse the nested result structure
                                    let idvResult = message.result;
                                    
                                    // Handle nested content structure: {content: [{text: "..."}]}
                                    if (idvResult?.content && Array.isArray(idvResult.content) && idvResult.content[0]?.text) {
                                        try {
                                            idvResult = JSON.parse(idvResult.content[0].text);
                                        } catch (e) {
                                            console.warn(`[Gateway] Failed to parse IDV result text:`, e);
                                        }
                                    }
                                    
                                    if (message.success && idvResult?.auth_status === 'VERIFIED') {
                                        console.log(`[Gateway] ✅ Detected successful IDV. Syncing memory and triggering auto-route to banking.`);
                                        console.log(`[Gateway]    Customer: ${idvResult.customer_name}, Account: ${idvResult.account}`);
                                        
                                        // Update memory with verified credentials
                                        await router.updateMemory(sessionId, {
                                            verified: true,
                                            userName: idvResult.customer_name,
                                            account: idvResult.account,
                                            sortCode: idvResult.sortCode
                                        });

                                        // VERIFIED STATE GATE: Automatically route to banking after successful verification
                                        // This implements the "state gate" pattern where the system handles routing
                                        console.log(`[Gateway] 🚪 VERIFIED STATE GATE: Auto-routing to banking agent`);
                                        
                                        // Wait for IDV agent to finish speaking, then route to banking
                                        setTimeout(async () => {
                                            const bankingAgent = await registry.getAgent('banking');
                                            if (bankingAgent) {
                                                currentAgent = bankingAgent;
                                                isHandingOff = true;
                                                try {
                                                    await connectToAgent(bankingAgent);
                                                    
                                                    // Inform client of automatic handoff
                                                    clientWs.send(JSON.stringify({
                                                        type: 'handoff_event',
                                                        target: 'banking',
                                                        reason: 'verified_state_gate',
                                                        timestamp: Date.now()
                                                    }));
                                                } catch (err) {
                                                    console.error(`[Gateway] Auto-route to banking failed:`, err);
                                                } finally {
                                                    isHandingOff = false;
                                                }
                                            }
                                        }, 2000); // Wait 2 seconds for IDV agent to finish speaking
                                    }
                                }

                                if (message.type === 'tool_use' && handoffTools.includes(message.toolName)) {
                                    console.log(`[Gateway] 🔄 HANDOFF TOOL DETECTED: ${message.toolName} (waiting for result...)`);
                                    // Don't intercept yet - wait for tool_result to confirm success
                                    // This prevents intercepting blocked handoffs
                                }

                                if (message.type === 'tool_result' && handoffTools.includes(message.toolName)) {
                                    console.log(`[Gateway] 🔍 Tool result received for ${message.toolName}:`, JSON.stringify(message).substring(0, 300));
                                    
                                    // Check if handoff was blocked by circuit breaker or validation
                                    const isBlocked = message.error && (
                                        message.error.includes('Circuit breaker') ||
                                        message.error.includes('blocked') ||
                                        message.error.includes('Already called')
                                    );
                                    
                                    if (isBlocked) {
                                        console.log(`[Gateway] ⚠️  Handoff ${message.toolName} blocked: ${message.error}`);
                                        // Forward the error to client but don't intercept
                                        clientWs.send(data, { binary: isBinary });
                                        return;
                                    }
                                    
                                    // Handoff tools always succeed if not blocked - they just initiate the transfer
                                    console.log(`[Gateway] 🔄 INTERCEPTED HANDOFF: ${message.toolName} (initiating transfer)`);

                                    // CRITICAL: Forward tool_result to client FIRST for UI feedback
                                    clientWs.send(data, { binary: isBinary });

                                    // SHIELD current agent from any more user input immediately
                                    isHandingOff = true;

                                    // Extract target agent ID
                                    const targetId = message.toolName.replace('transfer_to_', '').replace('return_to_', '');
                                    
                                    // CRITICAL: Extract credentials from tool input if present
                                    // This allows users to provide credentials upfront (e.g., "check balance for account 12345678, sort code 112233")
                                    if (targetId === 'idv' && message.input?.reason) {
                                        const reason = message.input.reason;
                                        // Look for account number (8 digits) and sort code (6 digits)
                                        const accountMatch = reason.match(/\b(\d{8})\b/);
                                        const sortCodeMatch = reason.match(/\b(\d{6})\b/);
                                        
                                        if (accountMatch && sortCodeMatch) {
                                            console.log(`[Gateway] 📋 Extracted credentials from handoff: Account ${accountMatch[1]}, Sort Code ${sortCodeMatch[1]}`);
                                            // Add to memory so IDV agent can use them
                                            await router.updateMemory(sessionId, {
                                                providedAccount: accountMatch[1],
                                                providedSortCode: sortCodeMatch[1]
                                            });
                                        }
                                    }
                                    
                                    // Perform handoff immediately (no delay)
                                    (async () => {
                                        try {
                                            console.log(`[Gateway] 🔄 Performing handoff to: ${targetId}`);
                                            const targetAgent = await registry.getAgent(targetId);
                                            
                                            if (!targetAgent) {
                                                console.error(`[Gateway] ❌ Target agent not found: ${targetId}`);
                                                isHandingOff = false;
                                                return;
                                            }
                                            
                                            console.log(`[Gateway] ✅ Found target agent: ${targetAgent.id}`);
                                            currentAgent = targetAgent;
                                            
                                            // Connect to new agent
                                            await connectToAgent(targetAgent);
                                            
                                            console.log(`[Gateway] ✅ Handoff complete: ${message.toolName} → ${targetId}`);
                                            
                                            // Inform client of handoff
                                            clientWs.send(JSON.stringify({
                                                type: 'handoff_event',
                                                target: targetId,
                                                timestamp: Date.now()
                                            }));
                                            
                                        } catch (err) {
                                            console.error(`[Gateway] ❌ Handoff failed:`, err);
                                        } finally {
                                            isHandingOff = false;
                                        }
                                    })();
                                    
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
                            console.log(`[Gateway] Forwarding message from agent to client (type: ${!isBinary ? JSON.parse(data.toString()).type : 'binary'})`);
                            clientWs.send(data, { binary: isBinary });
                        } else {
                            console.log(`[Gateway] Skipping message from old agent connection`);
                        }
                    }
                });

                ws.on('close', () => { 
                    console.log(`[Gateway] Agent WebSocket closed for session: ${sessionId}`);
                    if (agentWs === ws) agentWs = null; 
                });
            } catch (error) { reject(error); }
        });
    };

    clientWs.on('message', async (data: Buffer) => {
        try {
            const isBinary = Buffer.isBuffer(data) && data.length > 0 && data[0] !== 0x7B;
            if (!isBinary) {
                const message = JSON.parse(data.toString());
                console.log(`[Gateway] Received JSON message from client:`, message.type);

                // Proactive extraction of credentials and intent
                if (message.type === 'text_input' && message.text) {
                    console.log(`[Gateway] Text input received: "${message.text}"`);
                    
                    // CRITICAL FIX: Forward text_input to agent FIRST, before memory update
                    // This ensures the agent receives and can process the user's message
                    if (agentWs && agentWs.readyState === WebSocket.OPEN && !isHandingOff) {
                        console.log(`[Gateway] Forwarding text_input to agent FIRST`);
                        agentWs.send(data, { binary: isBinary });
                    } else if (isInitializing || isHandingOff || (agentWs && agentWs.readyState === WebSocket.CONNECTING)) {
                        console.log(`[Gateway] Buffering text_input (initializing: ${isInitializing}, handingOff: ${isHandingOff})`);
                        messageQueue.push({ data, isBinary });
                    }
                    
                    // THEN extract credentials and update memory
                    const parsed = parseUserMessage(message.text);
                    
                    console.log(`[Gateway] 🔍 Parsed user message:`, {
                        accountNumber: parsed.accountNumber,
                        sortCode: parsed.sortCode,
                        intent: parsed.intent
                    });
                    
                    if (parsed.accountNumber || parsed.sortCode || parsed.intent) {
                        const currentMemory = await router.getMemory(sessionId);
                        const updates: any = {};
                        
                        // CRITICAL FIX: Use providedAccount/providedSortCode keys for pre-provided credentials
                        // These are checked by IDV agent auto-trigger logic
                        if (parsed.accountNumber) {
                            updates.account = parsed.accountNumber;
                            updates.providedAccount = parsed.accountNumber; // For IDV auto-trigger
                            console.log(`[Gateway] 📋 Extracted account number: ${parsed.accountNumber}`);
                        }
                        if (parsed.sortCode) {
                            updates.sortCode = parsed.sortCode;
                            updates.providedSortCode = parsed.sortCode; // For IDV auto-trigger
                            console.log(`[Gateway] 📋 Extracted sort code: ${parsed.sortCode}`);
                        }
                        if (parsed.intent && !currentMemory?.userIntent) {
                            updates.userIntent = parsed.intent;
                            console.log(`[Gateway] 🎯 Extracted intent: ${parsed.intent}`);
                        }
                        updates.lastUserMessage = message.text;

                        if (Object.keys(updates).length > 0) {
                            console.log(`[Gateway] 💾 Updating memory with:`, updates);
                            await router.updateMemory(sessionId, updates);
                            const finalMemory = await router.getMemory(sessionId);
                            
                            console.log(`[Gateway] 📤 Final memory state:`, {
                                account: finalMemory?.account,
                                sortCode: finalMemory?.sortCode,
                                providedAccount: finalMemory?.providedAccount,
                                providedSortCode: finalMemory?.providedSortCode,
                                userIntent: finalMemory?.userIntent
                            });
                            
                            if (agentWs && agentWs.readyState === WebSocket.OPEN) {
                                console.log(`[Gateway] Sending memory_update AFTER text_input`);
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
                    
                    // IMPORTANT: Return here to prevent duplicate forwarding below
                    return;
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
                    console.log(`[Gateway] Session not initialized, initializing now...`);
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
                console.log(`[Gateway] Forwarding message to agent (binary: ${isBinary})`);
                agentWs.send(data, { binary: isBinary });
            } else if (isInitializing || isHandingOff || (agentWs && agentWs.readyState === WebSocket.CONNECTING)) {
                // Buffer user input during transtions
                console.log(`[Gateway] Buffering message (initializing: ${isInitializing}, handingOff: ${isHandingOff})`);
                messageQueue.push({ data, isBinary });
            } else {
                console.log(`[Gateway] Cannot forward message - no agent connection`);
            }
        } catch (error) {
            console.error(`[Gateway] Error processing message:`, error);
            // audio usually
            if (agentWs && agentWs.readyState === WebSocket.OPEN && !isHandingOff) {
                agentWs.send(data, { binary: true });
            } else if (isInitializing || isHandingOff) {
                messageQueue.push({ data, isBinary: true });
            }
        }
    });

    clientWs.on('close', async (code, reason) => {
        console.log(`[Gateway] Client WebSocket closed: code=${code}, reason=${reason?.toString() || 'none'}, sessionId=${sessionId}`);
        activeConnections.delete(sessionId);
        
        // CRITICAL FIX: Add grace period for agent to finish processing
        // Don't close agent WebSocket immediately - give it time to complete operations
        if (agentWs) { 
            console.log(`[Gateway] Waiting 10 seconds for agent to finish processing before closing...`);
            
            // Set a flag to prevent new messages from being forwarded
            isHandingOff = true;
            
            // Wait for agent to finish processing (or timeout after 10 seconds)
            setTimeout(() => {
                console.log(`[Gateway] Grace period expired, closing agent WebSocket for session: ${sessionId}`);
                try { 
                    if (agentWs && agentWs.readyState === WebSocket.OPEN) {
                        agentWs.close(); 
                    }
                } catch (e) { 
                    console.error(`[Gateway] Error closing agent WebSocket:`, e);
                }
            }, 10000); // 10 second grace period
        }
        
        // Clean up session after grace period + buffer
        setTimeout(async () => { 
            await router.deleteSession(sessionId); 
        }, 70000); // 70 seconds total (10s grace + 60s buffer)
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
