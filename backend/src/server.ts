import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { SonicClient, AudioChunk, SonicEvent } from './sonic-client';

const PORT = 8080;
const SONIC_PATH = '/sonic';

/**
 * WebSocket Server for Real-Time Voice-to-Voice Assistant
 * 
 * Current implementation:
 * - Accepts binary audio frames from browser
 * - Echoes them back for testing end-to-end flow
 * 
 * Future implementation:
 * - Route audio to SonicClient
 * - Stream Sonic responses back to browser
 */

interface ClientSession {
    ws: WebSocket;
    sonicClient: SonicClient;
    sessionId: string;
}

const activeSessions = new Map<WebSocket, ClientSession>();

// Create HTTP server
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Create WebSocket server
const wss = new WebSocketServer({
    server,
    path: SONIC_PATH
});

console.log(`[Server] WebSocket server starting on port ${PORT}${SONIC_PATH}`);

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const clientIp = req.socket.remoteAddress;
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[Server] New client connected: ${clientIp} (${sessionId})`);

    // Create Sonic client for this session
    const sonicClient = new SonicClient();

    // Store session
    activeSessions.set(ws, {
        ws,
        sonicClient,
        sessionId
    });

    // Handle incoming binary audio frames
    ws.on('message', async (data: Buffer) => {
        try {
            // Validate binary data
            if (!Buffer.isBuffer(data)) {
                console.error('[Server] Received non-buffer data');
                return;
            }

            console.log(`[Server] Received audio chunk: ${data.length} bytes from ${sessionId}`);

            // MVP: Echo audio back to client for testing
            // This validates end-to-end binary audio flow
            ws.send(data);

            // TODO: Future implementation - Route to Sonic
            // const chunk: AudioChunk = {
            //   buffer: data,
            //   timestamp: Date.now()
            // };
            // await sonicClient.sendAudioChunk(chunk);

        } catch (error) {
            console.error('[Server] Error processing audio:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process audio'
            }));
        }
    });

    // Handle client disconnect
    ws.on('close', async (code: number, reason: Buffer) => {
        console.log(`[Server] Client disconnected: ${sessionId} (code: ${code})`);

        const session = activeSessions.get(ws);
        if (session) {
            // Clean up Sonic session
            if (session.sonicClient.isActive()) {
                await session.sonicClient.stopSession();
            }
            activeSessions.delete(ws);
        }
    });

    // Handle errors
    ws.on('error', (error: Error) => {
        console.error(`[Server] WebSocket error for ${sessionId}:`, error);
    });

    // Send connection acknowledgment
    ws.send(JSON.stringify({
        type: 'connected',
        sessionId,
        message: 'Connected to WebSocket server'
    }));
});

// Handle server errors
wss.on('error', (error: Error) => {
    console.error('[Server] WebSocket server error:', error);
});

// Start HTTP server
server.listen(PORT, () => {
    console.log(`[Server] HTTP server listening on port ${PORT}`);
    console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}${SONIC_PATH}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[Server] Shutting down gracefully...');

    // Close all active sessions
    for (const [ws, session] of activeSessions.entries()) {
        if (session.sonicClient.isActive()) {
            await session.sonicClient.stopSession();
        }
        ws.close();
    }

    wss.close(() => {
        server.close(() => {
            console.log('[Server] Server closed');
            process.exit(0);
        });
    });
});
