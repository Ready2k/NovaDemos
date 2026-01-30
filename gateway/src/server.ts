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
// Determine if running in Docker or locally
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');

const WORKFLOWS_DIR = path.join(BASE_DIR, 'backend/workflows');
const TOOLS_DIR = path.join(BASE_DIR, 'backend/tools');
const HISTORY_DIR = path.join(BASE_DIR, 'backend/history');
const PROMPTS_DIR = path.join(BASE_DIR, 'backend/prompts');
const PERSONAS_DIR = path.join(BASE_DIR, 'backend/personas');

console.log('[Gateway] Running in:', isDocker ? 'Docker' : 'Local');
console.log('[Gateway] BASE_DIR:', BASE_DIR);
console.log('[Gateway] WORKFLOWS_DIR:', WORKFLOWS_DIR);
console.log('[Gateway] TOOLS_DIR:', TOOLS_DIR);
console.log('[Gateway] HISTORY_DIR:', HISTORY_DIR);
console.log('[Gateway] PROMPTS_DIR:', PROMPTS_DIR);
console.log('[Gateway] PERSONAS_DIR:', PERSONAS_DIR);

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

// Voices endpoint - Nova Sonic voices
app.get('/api/voices', (req: Request, res: Response) => {
    res.json([
        // Polyglot voices (can speak all languages)
        { id: 'tiffany', name: 'Tiffany (US Female, Polyglot)', language: 'en-US', polyglot: true },
        { id: 'matthew', name: 'Matthew (US Male, Polyglot)', language: 'en-US', polyglot: true },
        
        // English variants
        { id: 'amy', name: 'Amy (UK Female)', language: 'en-GB' },
        { id: 'olivia', name: 'Olivia (AU Female)', language: 'en-AU' },
        { id: 'kiara', name: 'Kiara (IN Female)', language: 'en-IN' },
        { id: 'arjun', name: 'Arjun (IN Male)', language: 'en-IN' },
        
        // European languages
        { id: 'ambre', name: 'Ambre (French Female)', language: 'fr-FR' },
        { id: 'florian', name: 'Florian (French Male)', language: 'fr-FR' },
        { id: 'beatrice', name: 'Beatrice (Italian Female)', language: 'it-IT' },
        { id: 'lorenzo', name: 'Lorenzo (Italian Male)', language: 'it-IT' },
        { id: 'tina', name: 'Tina (German Female)', language: 'de-DE' },
        { id: 'lennart', name: 'Lennart (German Male)', language: 'de-DE' },
        
        // Spanish & Portuguese
        { id: 'lupe', name: 'Lupe (Spanish US Female)', language: 'es-US' },
        { id: 'carlos', name: 'Carlos (Spanish US Male)', language: 'es-US' },
        { id: 'carolina', name: 'Carolina (Portuguese Female)', language: 'pt-BR' },
        { id: 'leo', name: 'Leo (Portuguese Male)', language: 'pt-BR' }
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

// Individual history session endpoint
app.get('/api/history/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        // Handle both with and without .json extension
        const filename = id.endsWith('.json') ? id : `${id}.json`;
        const sessionPath = path.join(HISTORY_DIR, filename);
        
        if (!fs.existsSync(sessionPath)) {
            return res.status(404).json({ error: `Session ${id} not found` });
        }
        
        const session = readJsonFile(sessionPath, null);
        if (!session) {
            return res.status(404).json({ error: `Failed to read session ${id}` });
        }
        
        res.json(session);
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

// Individual workflow endpoint
app.get('/api/workflow/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        // Try with and without workflow_ prefix and .json extension
        const possibleFiles = [
            `${id}.json`,
            `workflow_${id}.json`,
            id.endsWith('.json') ? id : `${id}.json`
        ];
        
        let workflowPath: string | null = null;
        for (const filename of possibleFiles) {
            const testPath = path.join(WORKFLOWS_DIR, filename);
            if (fs.existsSync(testPath)) {
                workflowPath = testPath;
                break;
            }
        }
        
        if (!workflowPath) {
            return res.status(404).json({ error: `Workflow ${id} not found` });
        }
        
        const workflow = readJsonFile(workflowPath, null);
        if (!workflow) {
            return res.status(404).json({ error: `Failed to read workflow ${id}` });
        }
        
        res.json(workflow);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workflow/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const workflow = req.body;
        
        // Determine filename
        const filename = id.startsWith('workflow_') ? `${id}.json` : `workflow_${id}.json`;
        const workflowPath = path.join(WORKFLOWS_DIR, filename);
        
        fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
        res.json({ success: true, message: `Workflow ${id} saved` });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/workflow/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const possibleFiles = [
            `${id}.json`,
            `workflow_${id}.json`,
            id.endsWith('.json') ? id : `${id}.json`
        ];
        
        let deleted = false;
        for (const filename of possibleFiles) {
            const testPath = path.join(WORKFLOWS_DIR, filename);
            if (fs.existsSync(testPath)) {
                fs.unlinkSync(testPath);
                deleted = true;
                break;
            }
        }
        
        if (!deleted) {
            return res.status(404).json({ error: `Workflow ${id} not found` });
        }
        
        res.json({ success: true, message: `Workflow ${id} deleted` });
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

// Agents endpoint - List all agents with metadata
app.get('/api/agents', async (req: Request, res: Response) => {
    try {
        const agents = await registry.getAllAgents();
        res.json(agents);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Individual agent endpoint
app.get('/api/agents/:id', async (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const agent = await registry.getAgent(id);
        if (!agent) {
            return res.status(404).json({ error: `Agent ${id} not found` });
        }
        res.json(agent);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ===== PERSONA ENDPOINTS =====

// List all personas
app.get('/api/personas', (req: Request, res: Response) => {
    try {
        const files = fs.readdirSync(PERSONAS_DIR).filter(f => f.endsWith('.json'));
        const personas = files.map(file => {
            try {
                const content = fs.readFileSync(path.join(PERSONAS_DIR, file), 'utf-8');
                const persona = JSON.parse(content);
                return {
                    id: persona.id || file.replace('.json', ''),
                    name: persona.name || 'Untitled',
                    description: persona.description || '',
                    voiceId: persona.voiceId || 'matthew',
                    workflows: persona.workflows || [],
                    allowedToolsCount: (persona.allowedTools || []).length,
                    metadata: persona.metadata || {}
                };
            } catch (e) {
                console.error(`[Gateway] Failed to parse persona ${file}:`, e);
                return null;
            }
        }).filter(p => p !== null);
        
        console.log(`[Gateway] Loaded ${personas.length} personas`);
        res.json(personas);
    } catch (e: any) {
        console.error('[Gateway] Failed to list personas:', e);
        res.status(500).json({ error: e.message });
    }
});

// Get individual persona
app.get('/api/personas/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const filePath = path.join(PERSONAS_DIR, `${id}.json`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: `Persona ${id} not found` });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const persona = JSON.parse(content);
        
        // Also load the prompt file if it exists
        let promptContent = null;
        if (persona.promptFile) {
            const promptPath = path.join(PROMPTS_DIR, persona.promptFile);
            if (fs.existsSync(promptPath)) {
                promptContent = fs.readFileSync(promptPath, 'utf-8');
            }
        }
        
        res.json({
            ...persona,
            promptContent
        });
    } catch (e: any) {
        console.error('[Gateway] Failed to get persona:', e);
        res.status(500).json({ error: e.message });
    }
});

// Create new persona
app.post('/api/personas', (req: Request, res: Response) => {
    try {
        const persona = req.body;
        
        // Validate required fields
        if (!persona.id) {
            return res.status(400).json({ error: 'Persona ID is required' });
        }
        
        const filePath = path.join(PERSONAS_DIR, `${persona.id}.json`);
        
        // Check if already exists
        if (fs.existsSync(filePath)) {
            return res.status(409).json({ error: 'Persona already exists' });
        }
        
        // Set defaults
        const personaData = {
            id: persona.id,
            name: persona.name || 'Untitled Persona',
            description: persona.description || '',
            promptFile: persona.promptFile || null,
            workflows: persona.workflows || [],
            allowedTools: persona.allowedTools || [],
            voiceId: persona.voiceId || 'matthew',
            metadata: persona.metadata || {
                language: 'en-US',
                region: 'UK',
                tone: 'professional'
            }
        };
        
        // Write persona config file
        fs.writeFileSync(filePath, JSON.stringify(personaData, null, 2), 'utf-8');
        
        // Create prompt file if content provided
        if (persona.promptContent && persona.promptFile) {
            const promptPath = path.join(PROMPTS_DIR, persona.promptFile);
            fs.writeFileSync(promptPath, persona.promptContent, 'utf-8');
        }
        
        console.log(`[Gateway] Created persona: ${persona.id}`);
        res.json({ success: true, persona: personaData });
    } catch (e: any) {
        console.error('[Gateway] Failed to create persona:', e);
        res.status(500).json({ error: e.message });
    }
});

// Update persona
app.put('/api/personas/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const updates = req.body;
        const filePath = path.join(PERSONAS_DIR, `${id}.json`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: `Persona ${id} not found` });
        }
        
        // Read existing persona
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Merge updates
        const updated = {
            ...existing,
            ...updates,
            id: existing.id // Don't allow ID changes
        };
        
        // Remove promptContent from persona file (it goes in separate file)
        const { promptContent, ...personaData } = updated;
        
        // Write updated persona config
        fs.writeFileSync(filePath, JSON.stringify(personaData, null, 2), 'utf-8');
        
        // Update prompt file if content provided
        if (promptContent && personaData.promptFile) {
            const promptPath = path.join(PROMPTS_DIR, personaData.promptFile);
            fs.writeFileSync(promptPath, promptContent, 'utf-8');
        }
        
        console.log(`[Gateway] Updated persona: ${id}`);
        res.json({ success: true, persona: personaData });
    } catch (e: any) {
        console.error('[Gateway] Failed to update persona:', e);
        res.status(500).json({ error: e.message });
    }
});

// Delete persona
app.delete('/api/personas/:id', (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const filePath = path.join(PERSONAS_DIR, `${id}.json`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: `Persona ${id} not found` });
        }
        
        // Read persona to get prompt file
        const persona = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Delete persona config file
        fs.unlinkSync(filePath);
        
        // Optionally delete prompt file (commented out for safety)
        // if (persona.promptFile) {
        //     const promptPath = path.join(PROMPTS_DIR, persona.promptFile);
        //     if (fs.existsSync(promptPath)) {
        //         fs.unlinkSync(promptPath);
        //     }
        // }
        
        console.log(`[Gateway] Deleted persona: ${id}`);
        res.json({ success: true, message: `Persona ${id} deleted` });
    } catch (e: any) {
        console.error('[Gateway] Failed to delete persona:', e);
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
    
    // Store selected workflow for this session
    let selectedWorkflowId = 'triage'; // Default to triage

    // Send confirmation to frontend immediately
    ws.send(JSON.stringify({
        type: 'connected',
        sessionId: sessionId,
        timestamp: Date.now()
    }));
    console.log(`[Gateway] Sent 'connected' confirmation to frontend`);

    // Create Langfuse trace for this session
    const trace = langfuse.trace({
        name: 'a2a-session',
        sessionId: sessionId,
        metadata: {
            initialAgent: selectedWorkflowId,
            timestamp: Date.now()
        }
    });
    const traceId = trace.id;
    console.log(`[Gateway] Created Langfuse trace: ${traceId}`);

    // Wait for workflow selection before routing
    let agentWs: WebSocket | null = null;
    let currentAgent: any = null;
    let sessionInitialized = false;

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
                
                // Get current session memory to pass to new agent
                router.getMemory(sessionId).then(memory => {
                    // Send session initialization with trace context and memory
                    agentWs!.send(JSON.stringify({
                        type: 'session_init',
                        sessionId,
                        traceId,  // Pass trace ID to agent
                        memory: memory || {},  // Pass session memory to agent
                        timestamp: Date.now()
                    }));
                    
                    if (memory && memory.verified) {
                        console.log(`[Gateway] Passed verified user to agent ${agent.id}: ${memory.userName}`);
                    }
                });
            });

            // Handle messages from agent
            agentWs.on('message', async (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString());
                    console.log(`[Gateway] Received from agent ${agent.id}:`, message.type);

                    // Handle memory updates from agents
                    if (message.type === 'update_memory') {
                        console.log(`[Gateway] Updating session memory:`, message.memory);
                        await router.updateMemory(sessionId, message.memory);
                        return; // Don't forward to client
                    }

                    // INTERCEPT Hand-off requests!
                    if (message.type === 'handoff_request') {
                        console.log(`[Gateway] Handoff requested: ${agent.id} -> ${message.targetAgentId}`);
                        
                        // Get current session memory
                        const sessionMemory = await router.getMemory(sessionId);
                        
                        // Update memory with handoff context
                        if (message.context) {
                            const updates: any = {
                                lastAgent: agent.id
                            };
                            
                            // Handle return to triage
                            if (message.context.isReturn) {
                                updates.taskCompleted = message.context.taskCompleted;
                                updates.conversationSummary = message.context.summary;
                                console.log(`[Gateway] Return handoff - Task: ${updates.taskCompleted}`);
                            } else {
                                // Store user intent from handoff reason
                                // CRITICAL: Only store if we don't already have a userIntent
                                // This preserves the ORIGINAL intent from Triage through the entire journey
                                if (message.context.reason) {
                                    if (!sessionMemory || !sessionMemory.userIntent) {
                                        updates.userIntent = message.context.reason;
                                        console.log(`[Gateway] Storing NEW user intent: ${message.context.reason}`);
                                    } else {
                                        console.log(`[Gateway] Preserving ORIGINAL user intent: ${sessionMemory.userIntent} (not overwriting with: ${message.context.reason})`);
                                    }
                                }
                                
                                // Store last user message
                                if (message.context.lastUserMessage) {
                                    updates.lastUserMessage = message.context.lastUserMessage;
                                }
                            }
                            
                            await router.updateMemory(sessionId, updates);
                        }
                        
                        // Tag handoff event in Langfuse
                        trace.event({
                            name: 'a2a-handoff',
                            metadata: {
                                from: agent.id,
                                to: message.targetAgentId,
                                reason: message.context?.reason || message.context?.summary || 'unknown',
                                isReturn: message.context?.isReturn || false,
                                sessionId: sessionId,
                                sessionMemory: sessionMemory
                            }
                        });

                        // 1. Update session in Redis
                        await router.transferSession(sessionId, message.targetAgentId, message.context);

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
                    console.log(`[Gateway] Forwarding ${message.type} to client`);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(data);
                    } else {
                        console.warn(`[Gateway] Cannot forward ${message.type}, client WebSocket not open`);
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

    // Forward messages from client to current agent
    ws.on('message', async (data: Buffer, isBinary: boolean) => {
        try {
            const message = JSON.parse(data.toString());

            // Handle workflow selection
            if (message.type === 'select_workflow') {
                console.log(`[Gateway] Workflow selected: ${message.workflowId}`);
                selectedWorkflowId = message.workflowId || 'triage';
                
                // Initialize session with selected workflow
                if (!sessionInitialized) {
                    const session = await router.createSession(sessionId, selectedWorkflowId);
                    const agent = await router.routeToAgent(sessionId);
                    
                    if (!agent) {
                        console.error(`[Gateway] No agent available for workflow: ${selectedWorkflowId}`);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `No agent available for ${selectedWorkflowId}. Please try again later.`
                        }));
                        return;
                    }
                    
                    currentAgent = agent;
                    await connectToAgent(agent);
                    sessionInitialized = true;
                }
                return;
            }

            // Handle special gateway commands
            if (message.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                return;
            }
            
            // Initialize with default workflow if not yet initialized
            if (!sessionInitialized) {
                console.log(`[Gateway] Auto-initializing with default workflow: ${selectedWorkflowId}`);
                const session = await router.createSession(sessionId, selectedWorkflowId);
                const agent = await router.routeToAgent(sessionId);
                
                if (!agent) {
                    console.error(`[Gateway] No agent available for workflow: ${selectedWorkflowId}`);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'No agents available. Please try again later.'
                    }));
                    return;
                }
                
                currentAgent = agent;
                await connectToAgent(agent);
                sessionInitialized = true;
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
