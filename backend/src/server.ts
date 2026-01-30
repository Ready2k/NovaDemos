
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import cors from 'cors';
import { AgentService } from './services/agent-service';
import { SonicService } from './services/sonic-service';
import { PromptService } from './services/prompt-service';
import { ToolService } from './services/tool-service';
// AgentCoreGatewayClient is internal to AgentService

// Load environment variables
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const SONIC_PATH = '/sonic';

// Global Services
const promptService = new PromptService();
const toolService = new ToolService();
// We initialize AgentService. It will use session-specific Credentials passed in ClientSession.
const agentService = new AgentService();

// AgentService initializes its own AgentCoreGatewayClient if needed.

// Active Sessions
const activeSessions = new Map<WebSocket, SonicService>();

// Create HTTP server
const app = express();
app.use(cors());
app.use(express.json());

// Helper for JSON File I/O
const readJsonFile = (filePath: string, defaultVal: any = []) => {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (e) {
        console.error(`[Server] Failed to read ${filePath}:`, e);
    }
    return defaultVal;
};

const writeJsonFile = (filePath: string, data: any) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error(`[Server] Failed to write ${filePath}:`, e);
        return false;
    }
};

// --- DATA PATHS ---
// Determine if running in Docker or locally
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '..');

const TOOLS_DIR = path.join(BASE_DIR, 'tools');
const WORKFLOWS_DIR = path.join(BASE_DIR, 'workflows');
const HISTORY_DIR = path.join(BASE_DIR, 'history');
const KB_FILE = path.join(BASE_DIR, 'knowledge_bases.json');

console.log('[Server] Running in:', isDocker ? 'Docker' : 'Local');
console.log('[Server] BASE_DIR:', BASE_DIR);
console.log('[Server] TOOLS_DIR:', TOOLS_DIR);
console.log('[Server] WORKFLOWS_DIR:', WORKFLOWS_DIR);
console.log('[Server] HISTORY_DIR:', HISTORY_DIR);

// Ensure directories exist
[TOOLS_DIR, WORKFLOWS_DIR, HISTORY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});


// Health Check
app.get('/health', (req, res) => {
    res.send('OK');
});

// --- PROMPTS API ---
app.get('/api/prompts', async (req, res) => {
    try {
        const prompts = await promptService.listPrompts();
        res.json(prompts);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/prompts/sync', async (req, res) => {
    try {
        const prompts = await promptService.listPrompts(true);
        res.json({ success: true, count: prompts.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Simulation API (stub for now)
app.post('/api/simulation/generate', async (req, res) => {
    res.status(501).json({ error: 'Simulation service pending refactor' });
});

// --- VOICES API ---
app.get('/api/voices', (req, res) => {
    // Return standard Amazon Polly/Nova voices
    res.json([
        { id: 'Matthew', name: 'Matthew (US Male)', language: 'en-US' },
        { id: 'Ruth', name: 'Ruth (US Female)', language: 'en-US' },
        { id: 'Stephen', name: 'Stephen (US Male)', language: 'en-US' },
        { id: 'Danielle', name: 'Danielle (US Female)', language: 'en-US' },
        { id: 'Amy', name: 'Amy (GB Female)', language: 'en-GB' },
        { id: 'Arthur', name: 'Arthur (GB Male)', language: 'en-GB' },
        // ... add more as needed, this satisfies the frontend requirements
    ]);
});

// --- TOOLS API ---
app.get('/api/tools', (req, res) => {
    try {
        const tools = toolService.loadTools().map(t => {
            const spec = t.toolSpec;
            let params = "{}";
            try {
                const schema = JSON.parse(spec.inputSchema.json);
                params = JSON.stringify(schema, null, 2);
            } catch (e) { }

            // Create clean display name from tool name
            const displayName = spec.name
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (l: string) => l.toUpperCase());

            return {
                name: spec.name, // Keep original name for matching
                displayName: displayName, // Add clean display name
                description: spec.description.split('\n\n[INSTRUCTION]:')[0],
                instruction: t.instruction,
                agentPrompt: t.agentPrompt,
                parameters: params,
                category: t.category || 'General'
            };
        });

        // Add handoff tools (these are dynamically generated, not from files)
        const handoffTools = [
            {
                name: 'transfer_to_banking',
                displayName: 'Transfer To Banking',
                description: 'Transfer conversation to Banking Specialist agent',
                instruction: 'Use when user needs banking services',
                agentPrompt: '',
                parameters: '{}',
                category: 'Handoff'
            },
            {
                name: 'transfer_to_idv',
                displayName: 'Transfer To IDV',
                description: 'Transfer conversation to Identity Verification agent',
                instruction: 'Use when user needs identity verification',
                agentPrompt: '',
                parameters: '{}',
                category: 'Handoff'
            },
            {
                name: 'transfer_to_mortgage',
                displayName: 'Transfer To Mortgage',
                description: 'Transfer conversation to Mortgage Specialist agent',
                instruction: 'Use when user needs mortgage information',
                agentPrompt: '',
                parameters: '{}',
                category: 'Handoff'
            },
            {
                name: 'transfer_to_disputes',
                displayName: 'Transfer To Disputes',
                description: 'Transfer conversation to Disputes Specialist agent',
                instruction: 'Use when user wants to dispute a transaction',
                agentPrompt: '',
                parameters: '{}',
                category: 'Handoff'
            },
            {
                name: 'transfer_to_investigation',
                displayName: 'Transfer To Investigation',
                description: 'Transfer conversation to Investigation agent',
                instruction: 'Use when user reports fraud or suspicious activity',
                agentPrompt: '',
                parameters: '{}',
                category: 'Handoff'
            },
            {
                name: 'return_to_triage',
                displayName: 'Return To Triage',
                description: 'Return conversation to Triage agent after completing task',
                instruction: 'Use when task is complete and user may need more help',
                agentPrompt: '',
                parameters: '{}',
                category: 'Handoff'
            }
        ];

        res.json([...tools, ...handoffTools]);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/tools', (req, res) => {
    const toolDef = req.body;
    if (!toolDef.name) return res.status(400).json({ error: "Name required" });

    // Save as JSON
    const fileName = `${toolDef.name}.json`;
    const filePath = path.join(TOOLS_DIR, fileName);

    // Convert parameters string back to object if needed, or assume it's object
    // Frontend sends object if it parsed it, or string? 
    // ToolsSettings.tsx line 81: sends JSON.stringify(payload) where payload.parameters is object.

    // We save strictly what is needed
    // Map frontend structure to backend storage structure
    const storageFormat = {
        name: toolDef.name,
        description: toolDef.description,
        instruction: toolDef.instruction,
        agentPrompt: toolDef.agentPrompt,
        input_schema: toolDef.parameters // Frontend sends "parameters" object
    };

    if (writeJsonFile(filePath, storageFormat)) {
        res.json({ success: true, tool: storageFormat });
    } else {
        res.status(500).json({ error: "Failed to save tool" });
    }
});

app.delete('/api/tools/:name', (req, res) => {
    const fileName = `${req.params.name}.json`;
    const filePath = path.join(TOOLS_DIR, fileName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Tool not found" });
    }
});

// --- WORKFLOWS API ---
app.get('/api/workflows', (req, res) => {
    try {
        const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.startsWith('workflow_') && f.endsWith('.json'));
        const workflows = files.map(f => {
            const content = readJsonFile(path.join(WORKFLOWS_DIR, f), {});
            return { id: content.id, name: content.name };
        });
        res.json(workflows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/workflow/:id', (req, res) => {
    const filePath = path.join(WORKFLOWS_DIR, `workflow_${req.params.id}.json`);
    if (fs.existsSync(filePath)) {
        res.json(readJsonFile(filePath));
    } else {
        res.status(404).json({ error: "Workflow not found" });
    }
});

app.post('/api/workflow/:id', (req, res) => {
    const filePath = path.join(WORKFLOWS_DIR, `workflow_${req.params.id}.json`);
    const data = req.body;
    // ensure ID matches
    data.id = req.params.id;

    if (writeJsonFile(filePath, data)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "Failed to save workflow" });
    }
});

app.delete('/api/workflow/:id', (req, res) => {
    const filePath = path.join(WORKFLOWS_DIR, `workflow_${req.params.id}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Workflow not found" });
    }
});

// --- KNOWLEDGE BASES API ---
app.get('/api/knowledge-bases', (req, res) => {
    res.json(readJsonFile(KB_FILE, []));
});

app.post('/api/knowledge-bases', (req, res) => {
    const newKb = req.body;
    const kbs = readJsonFile(KB_FILE, []);
    kbs.push(newKb); // simplistic append, assumes frontend handles dupes or we don't care
    if (writeJsonFile(KB_FILE, kbs)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "Failed to save KB" });
    }
});

app.delete('/api/knowledge-bases/:id', (req, res) => {
    let kbs = readJsonFile(KB_FILE, []);
    kbs = kbs.filter((k: any) => k.id !== req.params.id);
    if (writeJsonFile(KB_FILE, kbs)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "Failed to delete KB" });
    }
});

// --- HISTORY API ---
app.get('/api/history', (req, res) => {
    try {
        const files = fs.readdirSync(HISTORY_DIR)
            .filter(f => f.endsWith('.json') && f.startsWith('session_')); // Only include session files
        // Sort by date desc (filename often contains date, or read content)
        // For performance, we'll just map them. Ideally, filename should allow sorting.
        // Assuming filename scheme is unique but maybe not strictly sortable by string.

        const historyList = files.map(f => {
            // We need some metadata. Reading all files might be slow but necessary.
            try {
                const content = readJsonFile(path.join(HISTORY_DIR, f));
                // Generate a better summary from the first user message
                const firstUserMsg = content.transcript?.find((m: any) => m.role === 'user');
                const summary = firstUserMsg?.text || `Session ${content.sessionId?.substring(0, 8) || 'unknown'}`;

                return {
                    id: f,
                    date: content.startTime || fs.statSync(path.join(HISTORY_DIR, f)).mtimeMs,
                    summary: summary,
                    totalMessages: content.transcript?.length || 0,
                    usage: content.usage,
                    feedback: content.feedback
                };
            } catch { return null; }
        }).filter(Boolean).sort((a: any, b: any) => b.date - a.date);

        res.json(historyList);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/history/:id', (req, res) => {
    const filePath = path.join(HISTORY_DIR, req.params.id);
    if (fs.existsSync(filePath)) {
        res.json(readJsonFile(filePath));
    } else {
        res.status(404).json({ error: "Session not found" });
    }
});

// --- TESTS API ---
const TEST_LOGS_DIR = path.join(process.cwd(), 'test_logs');
const PRESETS_FILE = path.join(process.cwd(), 'presets.json');

[TEST_LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.get('/api/tests', (req, res) => {
    try {
        if (!fs.existsSync(TEST_LOGS_DIR)) return res.json([]);
        const files = fs.readdirSync(TEST_LOGS_DIR).filter(f => f.endsWith('.json'));

        const logs = files.map(f => {
            const stats = fs.statSync(path.join(TEST_LOGS_DIR, f));
            return {
                filename: f,
                created: stats.birthtime,
                size: stats.size
            };
        }).sort((a, b) => b.created.getTime() - a.created.getTime());

        res.json(logs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/tests/:filename', (req, res) => {
    const filePath = path.join(TEST_LOGS_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.json(readJsonFile(filePath));
    } else {
        res.status(404).json({ error: "Log not found" });
    }
});

// --- PRESETS API ---
app.get('/api/presets', (req, res) => {
    res.json(readJsonFile(PRESETS_FILE, []));
});

app.post('/api/presets', (req, res) => {
    const newPreset = req.body;
    newPreset.id = Date.now().toString(); // simple ID gen
    newPreset.createdAt = new Date().toISOString();

    const presets = readJsonFile(PRESETS_FILE, []);
    presets.push(newPreset);

    if (writeJsonFile(PRESETS_FILE, presets)) {
        res.json({ success: true, preset: newPreset });
    } else {
        res.status(500).json({ error: "Failed to save preset" });
    }
});

app.delete('/api/presets/:id', (req, res) => {
    let presets = readJsonFile(PRESETS_FILE, []);
    presets = presets.filter((p: any) => p.id !== req.params.id);
    if (writeJsonFile(PRESETS_FILE, presets)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "Failed to delete preset" });
    }
});

// System Status API
app.get('/api/system/status', (req, res) => {
    const awsConnected = !!(process.env.AWS_ACCESS_KEY_ID || process.env.NOVA_AWS_ACCESS_KEY_ID);
    res.json({
        aws: awsConnected ? 'connected' : 'error',
        region: process.env.AWS_REGION || process.env.NOVA_AWS_REGION || 'unknown'
    });
});

app.post('/api/system/debug', (req, res) => {
    const { enabled } = req.body;
    // Set global debug flag (assuming simplistic implementation for now)
    process.env.DEBUG = enabled ? 'true' : 'false';
    console.log(`[Server] Debug mode set to: ${enabled}`);
    res.json({ success: true, debug: enabled });
});

app.post('/api/system/reset', async (req, res) => {
    console.log('[Server] Initiating System Reset...');
    try {
        // 1. Close all active sessions
        for (const [ws, service] of activeSessions.entries()) {
            await service.stop();
            ws.close(1001, 'System Reset');
        }
        activeSessions.clear();

        // 2. Clear Chat History (Optional - purely file based)
        const historyDir = path.join(__dirname, '../../chat_history');
        if (fs.existsSync(historyDir)) {
            const files = fs.readdirSync(historyDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    fs.unlinkSync(path.join(historyDir, file));
                }
            }
        }
        console.log('[Server] System Reset Complete');
        res.json({ success: true });
    } catch (err: any) {
        console.error('[Server] Reset failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// Feedback API
app.post('/api/feedback', (req, res) => {
    const feedback = req.body;
    console.log('[Server] 📝 Received Feedback:', JSON.stringify(feedback, null, 2));

    // In a real app, save to DB or send to Langfuse
    // For now, we just log it to a file
    const feedbackFile = path.join(HISTORY_DIR, 'feedback_log.json');
    const logs = readJsonFile(feedbackFile, []);
    logs.push({ ...feedback, timestamp: new Date().toISOString() });
    writeJsonFile(feedbackFile, logs);

    res.json({ success: true });
});

const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: SONIC_PATH });

wss.on('connection', async (ws: WebSocket) => {
    console.log('[Server] New Sonic WebSocket connection');

    // Instantiate Session Service
    // We pass the singleton services. SonicService encapsulates the session state.
    const sonicService = new SonicService(
        ws,
        agentService,
        promptService,
        toolService,
    );

    activeSessions.set(ws, sonicService);

    ws.on('message', async (data: any, isBinary: boolean) => {
        try {
            await sonicService.handleClientMessage(data, isBinary);
        } catch (err) {
            console.error('[Server] Message handling error:', err);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: 'Internal Server Error' }));
            }
        }
    });

    ws.on('close', async () => {
        console.log('[Server] Connection closed');
        await sonicService.stop();
        activeSessions.delete(ws);
        console.log(`[Server] Active sessions: ${activeSessions.size}`);
    });

    ws.on('error', (error) => {
        console.error('[Server] WebSocket error:', error);
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] HTTP server listening on port ${PORT}`);
    console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}${SONIC_PATH}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    console.log(`[Server] Services initialized: AgentService, PromptService, ToolService, SonicService`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[Server] Shutting down gracefully...');
    for (const service of activeSessions.values()) {
        await service.stop();
    }
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (error: Error) => {
    if (error.message === 'Premature close' || (error as any).code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.warn('[Server] Caught stream premature close (ignoring):', error.message);
    } else {
        console.error('[Server] Uncaught exception:', error);
    }
});
