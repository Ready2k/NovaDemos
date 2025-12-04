import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { SonicClient, AudioChunk, SonicEvent } from './sonic-client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PORT = 8080;
const SONIC_PATH = '/sonic';

/**
 * WebSocket Server for Real-Time Voice-to-Voice Assistant
 * 
 * Integrates with Amazon Nova 2 Sonic for bidirectional speech streaming:
 * - Accepts binary audio frames from browser
 * - Routes audio to Nova 2 Sonic via AWS Bedrock
 * - Streams Sonic responses back to browser
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

wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
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

    // Send connection acknowledgment
    ws.send(JSON.stringify({
        type: 'connected',
        sessionId,
        message: 'Connected to Nova 2 Sonic'
    }));

    // Handle incoming messages (JSON config or binary audio)
    ws.on('message', async (data: any) => {
        const isBuffer = Buffer.isBuffer(data);
        let firstByte = 'N/A';
        if (isBuffer && data.length > 0) firstByte = data[0].toString();

        console.log(`[Server] Message received. Type: ${typeof data}, IsBuffer: ${isBuffer}, Length: ${data.length}, First byte: ${firstByte}`);

        if (isBuffer && data.length > 0 && data[0] === 123) {
            console.log(`[Server] Potential JSON message: ${data.toString().substring(0, 100)}...`);
        }

        try {
            // Check if it's a JSON message (configuration)
            if (!Buffer.isBuffer(data) || (data.length > 0 && data[0] === 123)) { // 123 is '{'
                try {
                    const message = data.toString();
                    const parsed = JSON.parse(message);

                    if (parsed.type === 'sessionConfig') {
                        console.log(`[Server] Received session config:`, JSON.stringify(parsed.config));
                        sonicClient.setConfig(parsed.config);

                        // Restart session with new config
                        if (sonicClient.getSessionId()) {
                            console.log('[Server] Restarting session with new config');
                            await sonicClient.stopSession();
                        }
                        await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event));
                        return;
                    } else if (parsed.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong' }));
                        return;
                    } else if (parsed.type === 'textInput') {
                        console.log('[Server] Received text input:', parsed.text);
                        if (parsed.text) {
                            // Ensure session is started
                            if (!sonicClient.getSessionId()) {
                                console.log('[Server] Starting session for text input');
                                await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event));
                            }
                            await sonicClient.sendText(parsed.text);
                        }
                        return;
                    }
                } catch (e) {
                    console.log('[Server] JSON parse failed:', e);
                    // Not JSON, ignore
                }
            }

            // Validate binary data for audio
            if (!Buffer.isBuffer(data)) {
                // If it was JSON, we already handled it. If it was invalid JSON, we ignore it.
                // But if it's NOT a buffer and NOT handled as JSON, we should probably return.
                // However, the check above `!Buffer.isBuffer(data)` covers strings.
                // If it was a string and not JSON, we fall through here.
                // We should only process as audio if it IS a buffer.
                return;
            }

            // Ensure session is started for audio
            if (!sonicClient.getSessionId()) {
                console.log('[Server] Starting session on first audio chunk');
                await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event));
            }

            // Route audio to Nova Sonic
            const chunk: AudioChunk = {
                buffer: data,
                timestamp: Date.now()
            };
            await sonicClient.sendAudioChunk(chunk);

        } catch (error) {
            console.error('[Server] Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process message'
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
});

// Handle server errors
wss.on('error', (error: Error) => {
    console.error('[Server] WebSocket server error:', error);
});

// Prevent crash on stream errors (common with AWS SDK bidirectional streams)
process.on('uncaughtException', (error: Error) => {
    if (error.message === 'Premature close' || (error as any).code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.warn('[Server] Caught stream premature close (ignoring):', error.message);
    } else {
        console.error('[Server] Uncaught exception:', error);
        // For other critical errors, we might want to exit, but for dev we'll keep running
        // process.exit(1); 
    }
});

// Start HTTP server
server.listen(PORT, () => {
    console.log(`[Server] HTTP server listening on port ${PORT}`);
    console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}${SONIC_PATH}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    console.log(`[Server] Using Nova 2 Sonic model: ${process.env.NOVA_SONIC_MODEL_ID || 'amazon.nova-2-sonic-v1:0'}`);
});

/**
 * Handle events from Nova Sonic and forward to WebSocket client
 */
function handleSonicEvent(ws: WebSocket, event: SonicEvent) {
    switch (event.type) {
        case 'audio':
            // Forward audio data as binary WebSocket message
            if (event.data.audio) {
                const audioBuffer = Buffer.isBuffer(event.data.audio)
                    ? event.data.audio
                    : Buffer.from(event.data.audio);

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(audioBuffer);
                    // console.log(`[Server] Sent audio to client: ${audioBuffer.length} bytes`);
                }
            }
            break;

        case 'transcript':
            // Forward transcript as JSON message
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'transcript',
                    role: event.data.role || 'assistant',
                    text: event.data.transcript,
                    isFinal: event.data.isFinal // Pass isFinal flag
                }));
                console.log(`[Server] Sent transcript: "${event.data.transcript}" (Final: ${event.data.isFinal})`);
            }
            break;

        case 'interruption':
            // Forward interruption signal
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'interruption'
                }));
                console.log('[Server] Sent interruption signal to client');
            }
            break;

        case 'error':
            // Log error and notify client
            console.error('[Server] Nova Sonic error:', event.data);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Nova Sonic streaming error'
                }));
            }
            break;

        case 'usageEvent':
            // Forward usage stats
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'usage',
                    data: event.data
                }));
            }
            break;
    }
}

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
