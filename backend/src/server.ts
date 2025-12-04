import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { SonicClient, AudioChunk, SonicEvent } from './sonic-client';
import { callBankAgent } from './bedrock-agent-client';
import { TranscribeClientWrapper } from './transcribe-client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PORT = 8080;
const SONIC_PATH = '/sonic';
const FRONTEND_DIR = path.join(__dirname, '../../frontend');

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
    // Agent Mode State
    brainMode: 'raw_nova' | 'bedrock_agent';
    agentId?: string;
    agentAliasId?: string;
    agentBuffer: Buffer[];
    transcribeClient: TranscribeClientWrapper;
    silenceTimer: NodeJS.Timeout | null;
    isInterrupted: boolean;
}

const activeSessions = new Map<WebSocket, ClientSession>();

// Create HTTP server
const server = http.createServer((req, res) => {
    console.log(`[HTTP] Request: ${req.url}`);

    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }

    // Serve static files
    let filePath = req.url === '/' ? '/index.html' : req.url || '/index.html';
    // Remove query parameters
    filePath = filePath.split('?')[0];

    const absolutePath = path.join(FRONTEND_DIR, filePath);

    // Prevent directory traversal
    if (!absolutePath.startsWith(FRONTEND_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const extname = path.extname(absolutePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.ico':
            contentType = 'image/x-icon';
            break;
    }

    fs.readFile(absolutePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.log(`[HTTP] File not found: ${absolutePath}`);
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
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
    const transcribeClient = new TranscribeClientWrapper(process.env.AWS_REGION);

    // Store session
    const session: ClientSession = {
        ws,
        sonicClient,
        sessionId,
        brainMode: 'raw_nova', // Default
        agentBuffer: [],
        transcribeClient,
        silenceTimer: null,
        isInterrupted: false
    };
    activeSessions.set(ws, session);

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
                        console.log('[Server] Received session config:', parsed.config);
                        console.log('[Server] Full Config Object:', JSON.stringify(parsed.config, null, 2));

                        // 1. Handle Agent Configuration Overrides FIRST
                        if (parsed.config.agentId && parsed.config.agentAliasId) {
                            session.agentId = parsed.config.agentId;
                            session.agentAliasId = parsed.config.agentAliasId;
                            console.log(`[Server] Configured Custom Agent: ${session.agentId} / ${session.agentAliasId}`);
                        } else {
                            // Reset if not present (to fallback to env vars)
                            session.agentId = undefined;
                            session.agentAliasId = undefined;
                        }

                        // 2. Handle Brain Mode
                        if (parsed.config.brainMode) {
                            session.brainMode = parsed.config.brainMode;
                            console.log(`[Server] Switched Brain Mode to: ${session.brainMode}`);

                            // If Agent Mode, override system prompt to be a TTS engine
                            if (session.brainMode === 'bedrock_agent') {
                                parsed.config.systemPrompt = "You are a verbatim text-to-speech engine. You must speak the user's input EXACTLY as provided, word for word. Do not paraphrase, summarize, or add any conversational filler. Just read the text.";
                                console.log('[Server] Overriding System Prompt for Agent Mode (Echo Bot)');
                                console.log(`[Server] --- AGENT MODE ACTIVE: ${session.agentId || 'Default Banking Bot'} ---`);
                            }
                        }

                        // Pass other config to SonicClient
                        sonicClient.updateSessionConfig(parsed.config);

                        // Start session if not already started
                        if (!sonicClient.getSessionId()) {
                            await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));
                        }
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
                                await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));
                            }
                            await sonicClient.sendText(parsed.text);
                        }
                        return;
                    } else if (parsed.type === 'awsConfig') {
                        console.log('[Server] Received AWS Configuration update');
                        const { accessKeyId, secretAccessKey, region } = parsed.config;
                        if (accessKeyId && secretAccessKey && region) {
                            sonicClient.updateCredentials(accessKeyId, secretAccessKey, region);
                            ws.send(JSON.stringify({ type: 'status', message: 'AWS Credentials Updated' }));
                        } else {
                            ws.send(JSON.stringify({ type: 'error', message: 'Invalid AWS Configuration' }));
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
            } else {
                // Binary Audio Data
                const audioBuffer = Buffer.from(data as Buffer);

                if (session.brainMode === 'bedrock_agent') {
                    // --- AGENT MODE ---
                    // 1. Buffer Audio
                    session.agentBuffer.push(audioBuffer);

                    // 2. VAD (Energy-based Silence Detection)
                    const rms = calculateRMS(audioBuffer);
                    // console.log('[Server] VAD RMS:', rms); // Uncomment to debug sensitivity
                    const VAD_THRESHOLD = 1000; // Increased from 600 to reduce false positives

                    // Only reset silence timer if we detect speech (high energy)
                    if (rms > VAD_THRESHOLD) {
                        if (session.silenceTimer) clearTimeout(session.silenceTimer);
                        session.silenceTimer = null;

                        // INTERRUPTION DETECTED
                        if (!session.isInterrupted) {
                            console.log('[Server] Interruption detected (VAD)! Stopping playback.');
                            session.isInterrupted = true;
                            ws.send(JSON.stringify({ type: 'interruption' }));
                        }
                    }

                    // If no timer is running (meaning we are in a potential silence period), start one
                    if (!session.silenceTimer) {
                        session.silenceTimer = setTimeout(async () => {
                            console.log('[Server] Silence timer fired');
                            if (session.agentBuffer.length === 0) return;

                            const fullAudio = Buffer.concat(session.agentBuffer);
                            session.agentBuffer = []; // Clear buffer

                            console.log(`[Server] Processing ${fullAudio.length} bytes for Agent...`);

                            // 3. Transcribe
                            const text = await session.transcribeClient.transcribe(fullAudio);
                            if (text) {
                                console.log(`[Server] User said (Transcribed): "${text}"`);
                                ws.send(JSON.stringify({ type: 'transcript', role: 'user', text, isFinal: true }));

                                // 4. Invoke Agent
                                try {
                                    console.log('[Server] Calling Agent...');
                                    const { completion: agentReply, trace } = await callBankAgent(
                                        text,
                                        session.sessionId,
                                        session.agentId,
                                        session.agentAliasId
                                    );
                                    console.log(`[Server] Agent replied: "${agentReply}"`);

                                    // Send Debug Info
                                    console.log(`[Server] Sending Debug Info (Trace count: ${trace?.length || 0})`);
                                    if (trace && trace.length > 0) {
                                        console.log('[Server] First Trace Item:', JSON.stringify(trace[0], null, 2));
                                    }
                                    ws.send(JSON.stringify({
                                        type: 'debugInfo',
                                        data: {
                                            transcript: text,
                                            agentReply,
                                            trace
                                        }
                                    }));

                                    ws.send(JSON.stringify({ type: 'transcript', role: 'assistant', text: agentReply, isFinal: true }));

                                    // 5. Synthesize with Sonic (TTS)
                                    // Reset interruption flag before new turn
                                    session.isInterrupted = false;

                                    // Ensure session is started
                                    if (!sonicClient.getSessionId()) {
                                        await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));
                                    }
                                    console.log('[Server] Sending to Sonic:', agentReply);
                                    await sonicClient.sendText(agentReply);

                                } catch (err) {
                                    console.error('[Server] Agent Error:', err);
                                    ws.send(JSON.stringify({ type: 'error', message: 'Agent Error' }));
                                }
                            }
                        }, 800); // 800ms silence threshold
                    }

                } else {
                    // --- RAW NOVA MODE (Existing) ---
                    // Ensure session is started
                    if (!sonicClient.getSessionId()) {
                        await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));
                    }
                    await sonicClient.sendAudioChunk({
                        buffer: audioBuffer,
                        timestamp: Date.now()
                    });
                }
            }

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
function handleSonicEvent(ws: WebSocket, event: SonicEvent, session: ClientSession) {
    // If interrupted, drop audio packets
    if (session.isInterrupted && event.type === 'audio') {
        return;
    }

    switch (event.type) {
        case 'audio':
            // Forward audio data as binary WebSocket message
            if (event.data.audio) {
                const audioBuffer = Buffer.isBuffer(event.data.audio)
                    ? event.data.audio
                    : Buffer.from(event.data.audio);

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(audioBuffer);
                    console.log(`[Server] Sent audio packet (${audioBuffer.length} bytes)`);
                }
            }
            break;

        case 'transcript':
            // In Agent Mode, we already sent the transcript from the Agent directly.
            // Nova Sonic's transcript is just a TTS echo, so we suppress it from the main chat.
            // HOWEVER, we send it as 'ttsOutput' for the Debug Panel to catch refusals/mismatches.
            if (session.brainMode === 'bedrock_agent') {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'ttsOutput',
                        text: event.data.transcript,
                        isFinal: event.data.isFinal
                    }));
                }
                return;
            }

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

/**
 * Calculate Root Mean Square (RMS) of audio buffer
 */
function calculateRMS(buffer: Buffer): number {
    if (buffer.length === 0) return 0;

    let sum = 0;
    const int16Buffer = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

    for (let i = 0; i < int16Buffer.length; i++) {
        sum += int16Buffer[i] * int16Buffer[i];
    }

    return Math.sqrt(sum / int16Buffer.length);
}
