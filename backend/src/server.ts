
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
import { AgentCoreGatewayClient } from './agentcore-gateway-client';

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

// Agent Core Gateway Client (Optional - for legacy tools or specific gateway calls)
let agentCoreGatewayClient: AgentCoreGatewayClient | null = null;
if (process.env.AGENT_CORE_GATEWAY_URL) {
    agentCoreGatewayClient = new AgentCoreGatewayClient();
    console.log('[Server] AgentCore Gateway Client initialized.');
} else {
    console.warn('[Server] AGENT_CORE_GATEWAY_URL not set. Gateway features disabled.');
}

// Active Sessions
const activeSessions = new Map<WebSocket, SonicService>();

// Create HTTP server
const app = express();
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
    res.send('OK');
});

// Prompt API Proxies
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

// Simulation API (stub for now, needs SimulationService refactor if used)
app.post('/api/simulation/generate', async (req, res) => {
    // TODO: Move SimulationService to separate file and use it here
    res.status(501).json({ error: 'Simulation service pending refactor' });
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
        agentCoreGatewayClient
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
