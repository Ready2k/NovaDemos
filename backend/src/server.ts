import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SonicClient, AudioChunk, SonicEvent } from './sonic-client';
import { callBankAgent } from './bedrock-agent-client';
import { TranscribeClientWrapper } from './transcribe-client';
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// --- AWS Bedrock AgentCore Client ---
// Build credentials config for AgentCore client
const agentCoreConfig: any = {
    region: process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1'
};

// Add explicit credentials if NOVA_ prefixed env vars are set
if (process.env.NOVA_AWS_ACCESS_KEY_ID && process.env.NOVA_AWS_SECRET_ACCESS_KEY) {
    agentCoreConfig.credentials = {
        accessKeyId: process.env.NOVA_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
    };
} else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    agentCoreConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
}

const agentCoreClient = new BedrockAgentCoreClient(agentCoreConfig);

/**
 * Helper to call AWS AgentCore Runtime
 * NOW SUPPORTS: Multi-Turn Loop (The "Orchestrator" Pattern)
 */
async function callAgentCore(session: ClientSession, qualifier: string, initialPayload: any) {
    try {
        console.log(`[AgentCore] Invoking agent for session ${session.sessionId}`);

        let runtimeArn = process.env.AGENT_CORE_RUNTIME_ARN;
        if (!runtimeArn) return { status: "error", message: "Missing AGENT_CORE_RUNTIME_ARN" };
        if (runtimeArn.includes('/runtime-endpoint/')) runtimeArn = runtimeArn.split('/runtime-endpoint/')[0];

        // Session ID Logic
        let rSessionId = session.sessionId;
        if (!rSessionId || rSessionId.length < 33) rSessionId = crypto.randomUUID();

        // ORCHESTRATOR LOOP
        let currentPrompt = initialPayload.prompt || JSON.stringify(initialPayload);
        let finalResult = "";

        // Loop limit to prevent infinite recursion
        for (let turn = 1; turn <= 5; turn++) {
            console.log(`[AgentCore] --- Turn ${turn} ---`);

            const payloadObj = { prompt: currentPrompt };

            const command = new InvokeAgentRuntimeCommand({
                agentRuntimeArn: runtimeArn,
                qualifier: 'DEFAULT',
                mcpSessionId: rSessionId,
                runtimeSessionId: rSessionId,
                contentType: "application/json",
                accept: "application/json",
                payload: Buffer.from(JSON.stringify(payloadObj))
            });

            const response = await agentCoreClient.send(command);
            const textResponse = await response.response?.transformToString();

            // Parse response (AgentCore returns JSON wrapper)
            let agentText = "";
            try {
                if (textResponse) {
                    const parsed = JSON.parse(textResponse);
                    // Try multiple fields
                    agentText = parsed.text ||
                        parsed?.result?.content?.[0]?.text ||
                        parsed?.output?.message?.content?.[0]?.text ||
                        "";
                }
            } catch (e) {
                agentText = textResponse || ""; // Fallback to raw
            }

            if (!agentText) {
                console.log("[AgentCore] Empty response from agent.");
                break;
            }

            console.log(`[AgentCore] Output: ${agentText.substring(0, 100)}...`);

            // CHECK FOR TAGS (<search>)
            const searchMatch = agentText.match(/<search>(.*?)<\/search>/);

            if (searchMatch) {
                const query = searchMatch[1];

                // Execute Tool (Mock)
                const toolResult = performMockSearch(query);

                // Update Prompt for Next Turn (Re-Inject History)
                currentPrompt = `
                    [PREVIOUS HISTORY]
                    Assistant: ${agentText}
                    
                    [SYSTEM TOOL OUTPUT]
                    The tool returned: "${toolResult}"
                    
                    [INSTRUCTION]
                    Using the tool output above, provide the final answer to the user.
                `;
            } else {
                // No tool called -> This is the final answer
                finalResult = agentText;
                break;
            }
        }

        return {
            status: "success",
            data: finalResult
        };

    } catch (e: any) {
        console.error('[AgentCore] Invocation failed:', e);
        return {
            status: "error",
            message: e.message
        };
    }
}

const PORT = 8080;
const SONIC_PATH = '/sonic';
const FRONTEND_DIR = path.join(__dirname, '../../frontend');
const TOOLS_DIR = path.join(__dirname, '../../tools');
const PROMPTS_DIR = path.join(__dirname, '../prompts');

function loadPrompt(filename: string): string {
    try {
        return fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
    } catch (err) {
        console.error(`[Server] Failed to load prompt ${filename}:`, err);
        return '';
    }
}

function listPrompts(): { id: string, name: string, content: string }[] {
    try {
        const files = fs.readdirSync(PROMPTS_DIR);
        return files.filter(f => f.endsWith('.txt')).map(f => ({
            id: f,
            name: f.replace('.txt', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            content: loadPrompt(f)
        }));
    } catch (err) {
        console.error('[Server] Failed to list prompts:', err);
        return [];
    }
}

function loadTools(): any[] {
    try {
        const files = fs.readdirSync(TOOLS_DIR);
        return files.filter(f => f.endsWith('.json')).map(f => {
            try {
                const content = fs.readFileSync(path.join(TOOLS_DIR, f), 'utf-8');
                const toolDef = JSON.parse(content);

                // Transform to Bedrock Tool Spec format
                // 1. Rename input_schema -> inputSchema
                // 2. Wrap schema in { json: ... }
                const toolSpec: any = {
                    name: toolDef.name,
                    description: toolDef.description,
                    inputSchema: {
                        json: toolDef.input_schema || toolDef.inputSchema
                    }
                };

                return {
                    toolSpec: toolSpec,
                    instruction: toolDef.instruction, // Pass instruction to frontend
                    agentPrompt: toolDef.agentPrompt // New: AgentCore prompt override
                };
            } catch (e) {
                console.error(`[Server] Failed to load tool ${f}:`, e);
                return null;
            }
        }).filter(t => t !== null);
    } catch (err) {
        console.error('[Server] Failed to list tools:', err);
        return [];
    }
}

// --- FILLER AUDIO CACHE ---
const fillerAudioCache = new Map<string, Map<string, Buffer>>(); // voiceId -> phrase -> audioBuffer
const FILLER_PHRASES = [
    "Just checking on that...",
    "One moment please...",
    "Let me look that up...",
    "Checking the system...",
    "Hold on a second...",
    "Let me check..."
];

/**
 * Generate filler audio using a temporary Nova Sonic session
 */
async function generateFillerWithSonic(text: string, voiceId: string = 'matthew'): Promise<Buffer | null> {
    console.log(`[FillerGen] CALLED for: "${text}" (${voiceId})`);

    // Create a temporary client
    const tempClient = new SonicClient();

    // Config as an Echo/Repeater Bot
    tempClient.setConfig({
        systemPrompt: "You are a repeater. You must repeat exactly what the user says. Do not add any other words, greetings, or punctuation descriptions. Just say the words.",
        voiceId: voiceId,
    });

    const audioChunks: Buffer[] = [];
    const completionPromise = new Promise<void>((resolve, reject) => {
        // Timeout safety
        const timeout = setTimeout(() => {
            reject(new Error("Timeout generating filler audio"));
        }, 15000);

        tempClient.startSession((event: SonicEvent) => {
            if (event.type === 'audio' && event.data.audio) {
                audioChunks.push(event.data.audio);
                // console.log(`[FillerGen] Received ${event.data.audio.length} bytes`);
            }
            if (event.type === 'interactionTurnEnd' || (event.type === 'contentEnd' && event.data.stopReason === 'END_TURN')) {
                clearTimeout(timeout);
                resolve();
            }
        }).then(async () => {
            // Once session starts, send the text
            await tempClient.sendText(text);
        }).catch(reject);
    });

    try {
        await completionPromise;
        const fullBuffer = Buffer.concat(audioChunks);
        console.log(`[FillerGen] Generated ${fullBuffer.length} bytes for "${text}"`);
        await tempClient.stopSession();
        return fullBuffer;
    } catch (e) {
        console.error('[FillerGen] Failed:', e);
        try { await tempClient.stopSession(); } catch (_) { }
        return null;
    }
}

/**
 * Pre-warm cache for a voice ID (fire and forget)
 */
function prewarmFillerCache(voiceId: string) {
    // Normalize Voice ID: User lowercase 'matthew' as default (standard for Nova Sonic in this app)
    const vid = voiceId || 'matthew';

    if (fillerAudioCache.has(vid)) return; // Already cached

    console.log(`[FillerCache] Pre-warming cache for voice: ${vid}`);
    const cache = new Map<string, Buffer>();
    fillerAudioCache.set(vid, cache);

    // Process sequentially to avoid rate limits
    (async () => {
        for (const phrase of FILLER_PHRASES) {
            const buffer = await generateFillerWithSonic(phrase, vid);
            if (buffer) {
                cache.set(phrase, buffer);
            }
            // Small delay between generations
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`[FillerCache] Completed pre-warming for ${vid}`);
    })();
}

/**
 * Helper: Perform Mock Search (Service Substitution)
 */
function performMockSearch(query: string): string {
    console.log(`[Server] ⚙️  ACTION: Executing Mock Search for: "${query}"`);
    // For "get_server_time" context, we return the time.
    // In a real agent, this would call Google/Bing.
    const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
    return `The current time in Yarnfield, UK is: ${now}`;
}

/**
 * Common logic to handle filler word generation and playback
 */
async function handleFillerWord(session: ClientSession) {
    const vid = session.voiceId || 'matthew';
    const randomPhrase = FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];

    // Check Cache or Generate Immediately
    const cache = fillerAudioCache.get(vid);
    let fillerAudio: Buffer | undefined;

    if (cache && cache.has(randomPhrase)) {
        console.log(`[Server] Playing cached filler: "${randomPhrase}"`);
        fillerAudio = cache.get(randomPhrase);
    } else {
        console.log(`[Server] Filler not cached for ${vid}. Generating immediately...`);
        try {
            // Wait up to 3s for generation
            fillerAudio = await generateFillerWithSonic(randomPhrase, vid) || undefined;
            if (fillerAudio) {
                if (!fillerAudioCache.has(vid)) fillerAudioCache.set(vid, new Map());
                fillerAudioCache.get(vid)?.set(randomPhrase, fillerAudio);
            }
        } catch (e) {
            console.error("Filler gen failed", e);
        }
    }

    if (session.ws.readyState === WebSocket.OPEN && fillerAudio) {
        // Send Transcript for Filler Word (UI Feedback)
        session.ws.send(JSON.stringify({
            type: 'transcript',
            role: 'assistant',
            text: randomPhrase + "...",
            isFinal: false
        }));
        session.ws.send(fillerAudio);
    }
}




interface Tool {
    toolSpec: {
        name: string;
        description?: string;
        inputSchema: {
            json: any;
        };
    };
}

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
    isIntercepting?: boolean; // New: Flag to suppress audio if we catch a hallucination
    lastUserTranscript?: string;
    // Deduplication
    lastAgentReply?: string;
    lastAgentReplyTime?: number;
    // Tools
    tools?: Tool[];
    // Audio Buffering (Lookahead)
    isBufferingAudio?: boolean;
    audioBufferQueue?: Buffer[];
    hasFlowedAudio?: boolean;
    // Voice Config
    voiceId?: string;

    // Context Variables
    userLocation?: string;
    userTimezone?: string;
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

    if (req.url === '/api/prompts') {
        const prompts = listPrompts();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(prompts));
        return;
    }

    if (req.url === '/api/tools') {
        const tools = loadTools();
        // Return simplified list for UI
        const simpleTools = tools.map(t => ({
            name: t.toolSpec.name,
            description: t.toolSpec.description
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(simpleTools));
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
    // Generate a longer session ID (UUID is 36 chars)
    const sessionId = crypto.randomUUID();

    console.log(`[Server] New client connected: ${clientIp} (${sessionId})`);

    // Create Sonic client for this session
    const sonicClient = new SonicClient();
    const transcribeClient = new TranscribeClientWrapper(process.env.NOVA_AWS_REGION || process.env.AWS_REGION);

    // Store session
    const session: ClientSession = {
        ws,
        sonicClient,
        sessionId,
        brainMode: 'raw_nova', // Default
        agentBuffer: [],
        transcribeClient,
        silenceTimer: null,
        isInterrupted: false,
        isIntercepting: false,
        lastUserTranscript: '',
        lastAgentReply: undefined,
        lastAgentReplyTime: 0,

        userLocation: "Unknown Location",
        userTimezone: "UTC",

        isBufferingAudio: false,
        audioBufferQueue: [],
        hasFlowedAudio: false,


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

        // console.log(`[Server] Message received. Type: ${typeof data}, IsBuffer: ${isBuffer}, Length: ${data.length}, First byte: ${firstByte}`);

        if (isBuffer && data.length > 0 && data[0] === 123) {
            console.log(`[Server] Potential JSON message: ${data.toString().substring(0, 100)}...`);
        }

        try {
            // Check if it's a JSON message (configuration)
            if (!Buffer.isBuffer(data) || (data.length > 0 && data[0] === 123)) { // 123 is '{'
                try {
                    const message = data.toString();
                    const parsed = JSON.parse(message);

                    if (parsed.type === 'getPrompts') {
                        const prompts = listPrompts();
                        ws.send(JSON.stringify({ type: 'promptsList', prompts }));
                        return;
                    }

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
                                parsed.config.systemPrompt = loadPrompt('agent_echo.txt');
                                console.log('[Server] Overriding System Prompt for Agent Mode (Echo Bot)');
                                console.log(`[Server] --- AGENT MODE ACTIVE: ${session.agentId || 'Default Banking Bot'} ---`);
                            }
                        }

                        // 3. Inject Tools (Dynamic Selection)
                        const allTools = loadTools();
                        let tools = [];

                        // If frontend explicitly sends selectedTools list, use it to filter
                        if (parsed.config.selectedTools && Array.isArray(parsed.config.selectedTools)) {
                            tools = allTools.filter(t => parsed.config.selectedTools.includes(t.toolSpec.name));
                        } else {
                            // Default behavior: Load ALL tools (Matches original behavior if no selection sent)
                            // OR should we default to NONE? 
                            // User asked for "tools listed... access to". 
                            // Safety: Default to ALL for backward compatibility with existing tests, 
                            // but UI will send empty array if nothing checked.
                            tools = allTools;
                        }

                        parsed.config.tools = tools;
                        session.tools = tools; // CRITICAL: Assign to session for interceptor checks in handleSonicEvent
                        console.log(`[Server] Loaded ${tools.length}/4 tools: ${tools.map(t => t.toolSpec.name).join(', ')}`);

                        // --- PROMPT ENGINEERING: Inject Tool Instructions ---
                        // AWS Models usually need explicit instructions to use tools reliably.
                        const toolInstructions = tools
                            .map(t => t.instruction)
                            .filter(i => i) // Remove undefined
                            .join('\n');

                        // FORCE NATIVE TOOL USE INSTRUCTION
                        const nativeToolInstruction = `
[CRITICAL SYSTEM INSTRUCTION]:
You have access to NATIVE tools.
1. WHEN you need to use a tool, you MUST use the native tool use syntax.
2. DO NOT say "ACTION: tool_name" or "I will check that".
3. Just generate the tool call event silently.
4. Wait for the tool result before speaking again.
`;


                        if (toolInstructions || nativeToolInstruction) {
                            parsed.config.systemPrompt = (parsed.config.systemPrompt || "") + "\n" + nativeToolInstruction + "\n\nAlso follow these tool use guidelines:\n" + (toolInstructions || "");
                            console.log('[Server] Injected tool instructions into System Prompt.');
                        }

                        // Pass other config to SonicClient
                        // Explicitly include tool definitions in the update (mapped to AWS Tool Interface)
                        parsed.config.tools = tools.map(t => ({ toolSpec: t.toolSpec }));
                        sonicClient.updateSessionConfig(parsed.config);

                        // Send System Info to Debug Panel
                        ws.send(JSON.stringify({
                            type: 'debugInfo',
                            data: {
                                systemInfo: {
                                    mode: session.brainMode,
                                    persona: session.brainMode === 'bedrock_agent' ? 'Echo Bot (Relay Mode)' : 'Direct Persona',
                                    description: session.brainMode === 'bedrock_agent'
                                        ? 'Backend automatically uses "agent_echo.txt" to preserve Agent output exactly.'
                                        : 'Using User-defined System Prompt.'
                                }
                            }
                        }));

                        // 4. Update Voice Config
                        if (parsed.config.voiceId) {
                            session.voiceId = parsed.config.voiceId;
                        }

                        console.log(`[Server] Session Voice ID set to: ${session.voiceId}`);

                        if (parsed.config.userLocation) session.userLocation = parsed.config.userLocation;
                        if (parsed.config.userTimezone) session.userTimezone = parsed.config.userTimezone;

                        console.log(`[Server] Session configured. Voice: ${session.voiceId}, Location: ${session.userLocation}, Timezone: ${session.userTimezone}`);

                        // Prewarm filler cache for this specific voice
                        if (session.voiceId) {
                            prewarmFillerCache(session.voiceId);
                        }

                        // CRITICAL: If session is already active, we MUST stop it to apply the new System Prompt.
                        // The System Prompt is only sent at the beginning of the session (in createInputStream).
                        if (sonicClient.getSessionId()) {
                            console.log('[Server] Configuration updated while session active. Restarting session to apply new System Prompt...');
                            await sonicClient.stopSession();
                        }

                        // Start session if not already started (or if we just stopped it)
                        if (!sonicClient.getSessionId()) {
                            await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));
                            
                            // AI SPEAKS FIRST: Send initial greeting trigger
                            // This makes the AI greet the user immediately after connection
                            console.log('[Server] Triggering initial AI greeting...');
                            setTimeout(async () => {
                                if (sonicClient.getSessionId()) {
                                    await sonicClient.sendText("Hi");
                                    console.log('[Server] Initial greeting sent to AI');
                                }
                            }, 500); // Small delay to ensure session is fully ready
                        }
                        return;
                    } else if (parsed.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong' }));
                        return;
                    } else if (parsed.type === 'textInput') {
                        console.log('[Server] Received text input:', parsed.text);
                        if (parsed.text) {
                            // Store user transcript for debug panel
                            session.lastUserTranscript = parsed.text;
                            
                            // Send user message to transcript display
                            ws.send(JSON.stringify({
                                type: 'transcript',
                                role: 'user',
                                text: parsed.text,
                                isFinal: true
                            }));
                            
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
                    // Only log error if not a buffer (otherwise it's likely just audio starting with '{')
                    if (!Buffer.isBuffer(data)) {
                        console.log('[Server] JSON parse failed:', e);
                    }
                    // Ignore binary data that failed parse, fall through to audio handler
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
                    const VAD_THRESHOLD = 800; // Lowered from 1000 to better detect soft speech

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
                            // Clear timer reference immediately so VAD knows it fired
                            session.silenceTimer = null;
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
                                        session.agentAliasId,
                                        // Filler Word Handler
                                        (filler) => {
                                            console.log(`[Server] Emitting filler word: "${filler}"`);
                                            session.sonicClient.sendText(filler);
                                        }
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

                                    // --- SERVER-SIDE DEDUPLICATION ---
                                    const now = Date.now();
                                    // Trim and Normalize for comparison
                                    const cleanReply = agentReply.trim();
                                    const cleanLast = (session.lastAgentReply || '').trim();

                                    console.log(`[Server] Checking dedupe: (${cleanReply.length} chars) "${cleanReply.substring(0, 20)}..." vs Last: (${cleanLast.length} chars) "${cleanLast.substring(0, 20)}..." (TimeDiff: ${session.lastAgentReplyTime ? now - session.lastAgentReplyTime : 'N/A'}ms)`);

                                    if (cleanReply === cleanLast && session.lastAgentReplyTime && (now - session.lastAgentReplyTime) < 4000) {
                                        console.warn(`[Server] 🛑 DUPLICATE AGENT REPLY DETECTED (ignored): "${cleanReply.substring(0, 50)}..."`);
                                        return;
                                    }
                                    session.lastAgentReply = cleanReply;
                                    session.lastAgentReplyTime = now;
                                    // ---------------------------------

                                    // Ensure session is started
                                    if (!sonicClient.getSessionId()) {
                                        await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));
                                    }

                                    console.log('[Server] Sending to Sonic:', agentReply);
                                    await sonicClient.sendText(agentReply);

                                } catch (agentError: any) {
                                    console.error('[Server] Agent Error:', agentError);

                                    // Forward error to Debug Panel
                                    ws.send(JSON.stringify({
                                        type: 'debugInfo',
                                        data: {
                                            error: {
                                                message: 'Agent Execution Failed',
                                                details: agentError.message || 'Unknown error occurred while calling Bedrock Agent',
                                                timestamp: new Date().toISOString()
                                            }
                                        }
                                    }));

                                    // Also notify user via voice if possible? Maybe not, could loop.
                                    ws.send(JSON.stringify({ type: 'error', message: 'Agent Error' }));
                                }
                            }
                        }, 1500); // 1500ms silence threshold to allow for pauses
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

    // Start Banking Core Runtime

});

/**
 * Handle events from Nova Sonic and forward to WebSocket client
 */
async function handleSonicEvent(ws: WebSocket, event: SonicEvent, session: ClientSession) {
    // If interrupted or intercepting, drop audio packets
    if ((session.isInterrupted || session.isIntercepting) && event.type === 'audio') {
        return;
    }

    switch (event.type) {
        case 'contentStart':
            if (event.data.role === 'assistant') {
                // Only verify buffering if we haven't already flowed audio for this turn
                if (!session.hasFlowedAudio) {
                    console.log('[Server] Assistant Turn Started - Buffering Audio for Safety...');
                    session.isBufferingAudio = true;
                    session.audioBufferQueue = [];
                }
                session.isIntercepting = false; // Reset interception flag for new turn
            } else if (event.data.role === 'user') {
                // Reset turn state on user input
                session.hasFlowedAudio = false;
                session.isBufferingAudio = false;
                session.audioBufferQueue = [];
            }
            break;

        case 'audio':
            // Forward audio data as binary WebSocket message
            if (event.data.audio) {
                // If we are intercepting (confirmed tool call), DROP everything
                if (session.isIntercepting) return;

                const audioBuffer = Buffer.isBuffer(event.data.audio)
                    ? event.data.audio
                    : Buffer.from(event.data.audio);

                if (session.isBufferingAudio) {
                    // Buffer this chunk until we confirm strictly that it's NOT a tool call
                    session.audioBufferQueue?.push(audioBuffer);
                    // console.log(`[Server] Buffering audio chunk... (Queue: ${session.audioBufferQueue?.length})`);
                } else if (ws.readyState === WebSocket.OPEN) {
                    ws.send(audioBuffer);
                    // console.log(`[Server] Sent audio packet (${audioBuffer.length} bytes)`);
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

            // --- RAW NOVA MODE ---
            // Store user transcript for debug context
            const role = event.data.role || 'assistant';
            if (role === 'user') {
                session.lastUserTranscript = event.data.transcript;
            }

            // Send Debug Info for Raw Nova Mode - Show ALL updates for debugging
            if (ws.readyState === WebSocket.OPEN) {
                // If it's an assistant reply, send debug info with context
                if (role === 'assistant' || role === 'model') {
                    ws.send(JSON.stringify({
                        type: 'debugInfo',
                        data: {
                            transcript: session.lastUserTranscript || '(No user transcript)',
                            agentReply: event.data.transcript,
                            isFinal: event.data.isFinal,
                            stage: event.data.isFinal ? 'FINAL' : 'STREAMING',
                            trace: [] // No trace for raw nova
                        }
                    }));
                } else if (role === 'user') {
                    // Also update debug panel on user input
                    ws.send(JSON.stringify({
                        type: 'debugInfo',
                        data: {
                            transcript: event.data.transcript,
                            agentReply: '...',
                            isFinal: true,
                            stage: 'USER_INPUT',
                            trace: []
                        }
                    }));
                }

                // --- CRITICAL FIX: Intercept JSON Tool Calls ---
                // If model outputs JSON code block, it's trying to call a tool
                // Detect JSON Intent (relaxed trigger)
                const text = event.data.transcript || "";
                const isFinal = event.data.isFinal;

                // Helper to check if tool is enabled
                const isToolEnabled = (name: string) => session.tools?.some(t => t.toolSpec?.name === name);

                const hasJson = text.toLowerCase().includes("json") ||
                    (!!text.match(/payments[_\s]*agent/i) && isToolEnabled('payments_agent')) ||
                    (!!text.match(/(invoke|call|use|check|action)?[_\s]*(\[)?get[_\s]*server[_\s]*time/i) && isToolEnabled('get_server_time'));

                // Lookahead Logic:
                // If we have text, we can decide whether to FLUSH or DROP the audio buffer.
                if (session.isBufferingAudio && text.length > 5) { // Wait for at least 5 chars ("ACTION" is 6)
                    if (hasJson) {
                        console.log('[Server] Lookahead detected Tool Call! DROPPING audio buffer.');
                        session.isIntercepting = true;
                        session.isBufferingAudio = false;
                        session.audioBufferQueue = []; // Drop
                    } else {
                        // It's just normal speech ("Ahoy...")
                        // BUT wait... the tool call might come LATER in the sentence?
                        // No, the prompt mandate says tool call must be IMMEDIATE.
                        // So if the first ~10-20 chars aren't a tool call, we assume it's speech.
                        // Let's be safe: Flush if > 20 chars OR verified "safe" start.
                        // Actually, simpler: If NOT hasJson, flush.
                        // Wait, "ACTION" might arrive in chunks "ACT", "ION".
                        // So we wait for a bit more length if it looks ambiguous.

                        const looksLikeToolStart = text.match(/^(action|invoke|call|Use|param|json|{)/i);

                        if (!looksLikeToolStart || text.length > 20) {
                            console.log('[Server] Lookahead verified Speech. FLUSHING audio buffer.');
                            session.isBufferingAudio = false;
                            session.hasFlowedAudio = true; // Mark turn as "flowing"
                            session.audioBufferQueue?.forEach(chunk => {
                                if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
                            });
                            session.audioBufferQueue = [];
                        }
                    }
                }

                console.log(`[DEBUG] Transcript received: "${text}"`);
                console.log(`[DEBUG] hasJson: ${hasJson}, Enabled Tools: ${JSON.stringify(session.tools?.map(t => t.toolSpec.name))}`);

                // VERBOSE DEBUGGING
                if (hasJson || isFinal) {
                    console.log(`[Server] Transcript Debug - Final: ${isFinal}, HasJSON: ${hasJson}, Text Preview: ${text.substring(0, 50)}...`);
                }

                // Check for COMPLETE JSON object even if not final
                // This allows eager execution while the model is still streaming silence or padding
                const hasCompleteJson = hasJson && text.includes('}') && text.indexOf('{') < text.lastIndexOf('}');

                if (hasCompleteJson || (hasJson && isFinal)) {
                    console.log('[Server] Detected Potential JSON Tool Call (Strategy: Eager/Final):', text);
                    try {
                        let jsonStr = "";

                        // PRIORITY 1: Check for "name": field (Nova's native format)
                        if (text.includes('"name":')) {
                            console.log('[Server] JSON using "name" field. Attempting recovery.');
                            const nameIndex = text.indexOf('"name":');
                            // Find the last brace after "name":
                            const lastBrace = text.lastIndexOf('}');
                            if (lastBrace !== -1 && lastBrace > nameIndex) {
                                let extracted = "{" + text.substring(nameIndex, lastBrace + 1);
                                // Add closing brace for outer object
                                extracted = extracted + "}";
                                // Normalize "name" to "tool"
                                extracted = extracted.replace('"name":', '"tool":');
                                // Handle "arguments" vs "parameters"
                                extracted = extracted.replace('"arguments":', '"parameters":');
                                jsonStr = extracted;
                            }
                        }
                        // PRIORITY 2: Standard brace extraction (only if "name" check didn't work)
                        else {
                            // "Nuclear" JSON extraction: Find the first '{' and the last '}'
                            let firstBrace = text.indexOf('{');
                            const lastBrace = text.lastIndexOf('}');

                            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                                jsonStr = text.substring(firstBrace, lastBrace + 1);
                            } else if (text.match(/payments[_\s]*agent\s*\(/i)) {
                                // FALLBACK: Parsing [tool(arg=val)] OR tool(arg=val) (Model hallucination format)
                                // Handles: [payments_agent(...)], payments_ agent (...), etc.
                                console.log('[Server] Detected Text-Style Tool Call:', text);

                                // Regex to capture content inside tool(...) 
                                // Matches "payments...agent" then "(" then capture until ")" or "]"
                                const match = text.match(/payments[_\s]*agent\s*\(([^)\]]*)/i);
                                if (match) {
                                    const toolName = "payments_agent"; // Normalize name
                                    const argsStr = match[1]; // e.g. customer_ id=" CUST-001",  payee=" Comstar",  amount=200
                                    jsonStr = `{ "tool": "${toolName}", "parameters": {`;

                                    // Parse args (key="val" or key=val)
                                    const args = argsStr.split(',').map((arg: string) => arg.trim());
                                    const params: string[] = [];
                                    for (const arg of args) {
                                        const eqIdx = arg.indexOf('=');
                                        if (eqIdx !== -1) {
                                            // Clean key: "customer_ id" -> "customerId"
                                            let key = arg.substring(0, eqIdx).trim();
                                            key = key.replace(/[\s_]+/g, ''); // "customer_ id" -> "customerid"
                                            if (key === 'customerid') key = 'customerId';

                                            let val = arg.substring(eqIdx + 1).trim();
                                            // Clean val quotes
                                            if (val.startsWith('"') && val.endsWith('"')) {
                                                val = val.substring(1, val.length - 1);
                                            }
                                            // Re-quote for JSON
                                            if (isNaN(Number(val)) && val !== 'true' && val !== 'false') {
                                                val = `"${val}"`;
                                            }
                                            params.push(`"${key}": ${val}`);
                                        }
                                    }
                                    jsonStr += params.join(', ') + "} }";
                                    console.log('[Server] Converted Text Syntax to JSON:', jsonStr);
                                }
                            } else if (text.includes('"tool":')) {
                                // FALLBACK: parsing simple property list if outer braces missing
                                console.log('[Server] JSON missing outer braces. Attempting recovery.');
                                // Find start of "tool"
                                const toolIndex = text.indexOf('"tool":');
                                // Look for end (either } or end of string)
                                const end = (lastBrace !== -1) ? lastBrace + 1 : text.length;
                                jsonStr = "{" + text.substring(toolIndex, end) + (lastBrace === -1 ? "}" : "");
                            } else if (text.replace(/\s|_/g, '').toLowerCase().includes("getservertime")) {
                                // FALLBACK: Raw Text Match for "get_ server_ time" (Model speaking the name)
                                console.log('[Server] Detected Raw Tool Name in speech. constructing JSON.');
                                jsonStr = '{ "tool": "get_server_time", "parameters": {} }';
                            }
                        } // Close the else block from PRIORITY 2


                        if (jsonStr) {
                            console.log('[Server] Raw JSON Candidate:', jsonStr);

                            // AUTO-REPAIR: Fix model hallucinations/typos
                            // 1. Fix "customer_ id" -> "customerId" (and other underscore spaces)
                            jsonStr = jsonStr.replace(/_\s([a-z])/g, '$1'); // "customer_ id" -> "customerid" (close enough) or better specific fixes:
                            jsonStr = jsonStr.replace("customer_ id", "customerId");
                            jsonStr = jsonStr.replace("payments_ agent", "payments_agent");

                            // 1.5. Remove newlines and normalize whitespace (fix for Nova's formatting)
                            jsonStr = jsonStr.replace(/\n/g, ' ').replace(/\s+/g, ' ');

                            // 2. Fix missing commas if needed (simple cases)

                            // 3. Fix missing braces for "parameters" object
                            // The model often outputs: "parameters": "customerId": ... instead of "parameters": { "customerId": ...
                            const paramsIndex = jsonStr.indexOf('"parameters":');
                            if (paramsIndex !== -1) {
                                const afterParams = jsonStr.substring(paramsIndex + 13).trim(); // 13 is length of "parameters":
                                if (!afterParams.startsWith('{')) {
                                    console.log('[Server] Fixing missing braces for parameters object');
                                    // Insert { after "parameters":
                                    // We can just replace the first occurrence of "parameters": with "parameters": {
                                    jsonStr = jsonStr.replace('"parameters":', '"parameters": {');
                                    // And append a closing brace at the end
                                    jsonStr = jsonStr + "}";
                                }
                            }

                            // 4. Fix trailing commas (Common model error, and side effect of our wrapper)
                            // Regex: replace , followed by whitespace and } with just }
                            jsonStr = jsonStr.replace(/,\s*}/g, '}');
                            jsonStr = jsonStr.replace(/,\s*]/g, ']');

                            // 0. Play Filler Word (Heuristic)
                            console.log('[Server] Heuristic Handler Triggering Filler...');
                            // Try to get filler audio (from cache or generate on fly)
                            console.log('[Server] Repaired JSON Candidate:', jsonStr);

                            const toolCall = JSON.parse(jsonStr);
                            console.log('[Server] Parsed Tool Call:', toolCall);

                            if (toolCall.tool) {
                                let toolName = toolCall.tool.toLowerCase();
                                if (toolName.includes('getservertime') || toolName.includes('get_server_time')) {
                                    toolName = 'get_server_time';
                                }

                                if (toolName === 'get_server_time') {
                                    console.log(`[Server] Heuristic detected tool: ${toolName} - Routing to AgentCore`);

                                    // Play filler word
                                    await handleFillerWord(session);

                                    // Get tool definition and agentPrompt (same as Native Tool Handler)
                                    const toolDef = loadTools().find(t => t.toolSpec.name === toolName);
                                    let agentPayload = {};

                                    if (toolDef && toolDef.agentPrompt) {
                                        let promptToUse = toolDef.agentPrompt;
                                        promptToUse = promptToUse.replace('{{USER_LOCATION}}', session.userLocation || "Unknown Location");
                                        promptToUse = promptToUse.replace('{{USER_TIMEZONE}}', session.userTimezone || "UTC");
                                        console.log(`[Server] Using configured agentPrompt for ${toolName}`);
                                        agentPayload = { prompt: promptToUse };
                                    }

                                    // Call AgentCore
                                    const result = await callAgentCore(session, toolName, agentPayload);
                                    console.log('[Server] AgentCore Result (Heuristic):', result);

                                    // Inject result back to model
                                    const systemInjection = `[System] The tool '${toolName}' returned: "${JSON.stringify(result)}". Please tell this to the user naturally.`;
                                    if (session.sonicClient) {
                                        console.log('[Server] Injecting AgentCore Result to Model:', systemInjection);
                                        await session.sonicClient.sendText(systemInjection);
                                    }
                                } else if (toolCall.parameters) {
                                    // Execute AgentCore tools
                                    console.log(`[Server] Executing intercepted tool call: ${toolCall.tool}`);
                                    if (session.sonicClient) session.sonicClient.sendText("Processing your request...");

                                    const result = await callAgentCore(session, toolCall.tool, toolCall.parameters);
                                    console.log('[Server] AgentCore Result:', result);

                                    // Send result to UI
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({
                                            type: 'transcript',
                                            role: 'assistant',
                                            text: `[System] Tool executed: ${JSON.stringify(result)}`,
                                            isFinal: true
                                        }));
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[Server] Failed to process intercepted tool call:', e);
                    }
                }

                // Forward transcript as JSON message (Sanitized)
                // We strip the JSON code block so the user doesn't see the raw payload
                let displayText = event.data.transcript || "";
                // Remove content between first { and last } if it looks like the tool call
                // Remove content starting from "json" marker to clean up UI
                // Matches: `json ..., ```json ..., or just json ...
                // ALSO match the tool syntax [payments_agent...] or payments_ agent...
                const jsonMarkerMatch = displayText.match(/(`*json|\[?payments[_\s]*agent)/i);
                if (jsonMarkerMatch) {
                    // Start of the match
                    const matchIndex = jsonMarkerMatch.index;
                    if (matchIndex !== undefined) {
                        // Keep everything BEFORE the match
                        displayText = displayText.substring(0, matchIndex).trim();
                        // Clean up any trailing backticks or brackets left over
                        displayText = displayText.replace(/`+$/, '').trim();
                        displayText = displayText.replace(/\[$/, '').trim();
                    }
                }

                if (displayText) {
                    // --- HEURISTIC INTERCEPTOR (Restored & Redirected to AgentCore) ---
                    // Matches: XML hallucinations <tool_ call...> ONLY.
                    // REMOVED: get_server_time regex (Trusted Native Tool now)
                    if (displayText.includes('<tool') && event.data.isFinal) {
                        console.log('[Server] Heuristic Interceptor: Detected XML tool tag. Forcing AgentCore execution.');

                        // Activate Audio Squelch for this turn
                        session.isIntercepting = true;

                        // --- FILLER WORD LOGIC (Refactored) ---
                        await handleFillerWord(session);
                        // -------------------------


                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'debugInfo',
                                data: {
                                    toolUse: { name: 'get_server_time', input: {}, toolUseId: `heuristic-${Date.now()}` }
                                }

                            }));
                        }

                        // 2. Execute AgentCore Logic (Replaces Local Logic)
                        try {
                            // DYNAMIC PROMPT: Check if this tool has a specific 'agentPrompt' defined
                            // We look up the tool definition from our loaded list (assuming we have access or can find it)
                            const toolDef = loadTools().find(t => t.toolSpec.name === 'get_server_time'); // Simple lookup for now

                            let promptToUse = "What time is it?"; // Fallback
                            if (toolDef && toolDef.agentPrompt) {
                                promptToUse = toolDef.agentPrompt;
                                // DYNAMIC INJECTION: Replace placeholders with session variables
                                promptToUse = promptToUse.replace('{{USER_LOCATION}}', session.userLocation || "Unknown Location");
                                promptToUse = promptToUse.replace('{{USER_TIMEZONE}}', session.userTimezone || "UTC");

                                console.log(`[Server] Using configured agentPrompt for ${'get_server_time'}`);
                                console.log(`[Server] Injected Prompt: ${promptToUse}`);
                            }

                            const agentPayload = {
                                prompt: promptToUse
                            };

                            const result = await callAgentCore(
                                session,
                                'get_server_time',
                                agentPayload
                            );
                            console.log('[Server] AgentCore Heuristic Result:', result);

                            // 3. Send Result to Sonic
                            if (session.sonicClient) {
                                // Extract safe data to avoid circular JSON error
                                let safeResult = "Success";
                                // Cast to any to avoid TS errors with mismatched SDK types
                                const data = result?.data as any;

                                if (data) {
                                    if (typeof data === 'string') {
                                        safeResult = data;
                                    } else if (data.completion) {
                                        safeResult = "Agent execution triggered.";
                                    } else if (data.payload) {
                                        try {
                                            const payloadStr = new TextDecoder().decode(data.payload);
                                            safeResult = payloadStr;
                                        } catch (e) {
                                            safeResult = "Binary Payload";
                                        }
                                    } else {
                                        // Fallback: Use stringified data if it's an object/result
                                        safeResult = JSON.stringify(data);
                                    }
                                } else if (result && result.status === 'error') {
                                    safeResult = result.message || "Unknown Error";
                                }

                                const systemInjection = `[System] The tool 'get_server_time' returned: "${safeResult}".Please tell this to the user.`;
                                console.log('[Server] Injecting Heuristic Result:', systemInjection);
                                await session.sonicClient.sendText(systemInjection);
                            }
                        } catch (e: any) {
                            console.error('[Server] Heuristic AgentCore call failed:', e);
                        }

                        // Prevent original "get_server_time" text from being sent to frontend/speech
                        displayText = '';
                    }

                    // Filter out interruption messages and empty text
                    const isInterruptionMessage = displayText.includes('"interrupted"') || displayText.includes('interrupted');
                    
                    if (isInterruptionMessage) {
                        console.log(`[Server] Filtered out interruption message`);
                        return;
                    }
                    
                    if (displayText.trim().length === 0) {
                        console.log(`[Server] Skipped empty transcript`);
                        return;
                    }
                    
                    // Handle streaming transcripts
                    if (event.data.isStreaming) {
                        // Send streaming updates to show text appearing in real-time
                        ws.send(JSON.stringify({
                            type: 'transcript',
                            role: role,
                            text: displayText,
                            isFinal: false,
                            isStreaming: true
                        }));
                        console.log(`[Server] Sent streaming transcript: "${displayText.substring(0, 50)}..."`);
                    } 
                    // Handle cancelled transcripts (interrupted)
                    else if (event.data.isCancelled) {
                        // Clear the streaming message
                        ws.send(JSON.stringify({
                            type: 'transcriptCancelled',
                            role: role
                        }));
                        console.log(`[Server] Sent cancellation for interrupted transcript`);
                    }
                    // Handle final transcripts
                    else if (event.data.isFinal) {
                        // Smart deduplication: Only skip if it's exactly the same OR if it's shorter than the last one
                        const isDuplicate = session.lastAgentReply === displayText;
                        const isShorterThanLast = session.lastAgentReply && displayText.length <= session.lastAgentReply.length && 
                                                 session.lastAgentReply.startsWith(displayText);
                        
                        if (!isDuplicate && !isShorterThanLast) {
                            ws.send(JSON.stringify({
                                type: 'transcript',
                                role: role,
                                text: displayText,
                                isFinal: true,
                                isStreaming: false
                            }));
                            
                            // Track last message for deduplication
                            if (role === 'assistant') {
                                session.lastAgentReply = displayText;
                                session.lastAgentReplyTime = Date.now();
                            }
                            console.log(`[Server] Sent final transcript: "${displayText.substring(0, 50)}..."`);
                        } else if (isDuplicate) {
                            console.log(`[Server] Skipped duplicate transcript: "${displayText.substring(0, 50)}..."`);
                        } else if (isShorterThanLast) {
                            console.log(`[Server] Skipped shorter transcript (already have longer): "${displayText.substring(0, 50)}..."`);
                        }
                    }
                }
            }
            break;

        case 'toolUse': {
            // Native AWS Bedrock Tool Use Event
            console.log('[Server] Received NATIVE Tool Use Event:', JSON.stringify(event.data));
            const toolUse = event.data;
            if (toolUse && toolUse.name && toolUse.input) {
                // Execute the tool call against AWS AgentCore
                console.log(`[Server] Executing NATIVE tool call: ${toolUse.name}`);

                // --- FILLER WORD LOGIC (Refactored) ---
                await handleFillerWord(session);
                // -------------------------

                // Notify UI of tool usage (Visual Feedback)
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'debugInfo',
                        data: {
                            toolUse: toolUse // { name, input, toolUseId }
                        }
                    }));
                }



                // LOCAL TOOL INTERCEPTOR REMOVED per user request (Steps 355)
                // All tools now flow to callAgentCore below.
                /*
                if (toolUse.name === 'get_server_time') {
                    // ... removed local logic ...
                }
                */

                try {
                    // DYNAMIC PROMPT: Check if this tool has a specific 'agentPrompt' defined
                    const toolDef = loadTools().find(t => t.toolSpec.name === toolUse.name);

                    let agentPayload = toolUse.input;

                    if (toolDef && toolDef.agentPrompt) {
                        let promptToUse = toolDef.agentPrompt;
                        // DYNAMIC INJECTION
                        promptToUse = promptToUse.replace('{{USER_LOCATION}}', session.userLocation || "Unknown Location");
                        promptToUse = promptToUse.replace('{{USER_TIMEZONE}}', session.userTimezone || "UTC");

                        console.log(`[Server] Using configured agentPrompt for ${toolUse.name}`);
                        agentPayload = { prompt: promptToUse };
                    }

                    // Call AgentCore using the existing client
                    const result = await callAgentCore(
                        session,
                        toolUse.name,
                        agentPayload
                    );

                    console.log('[Server] AgentCore Result (Native):', result);

                    // Send the result back to Sonic (Native Tool Result)
                    // Note: SonicClient.sendToolResult expects toolUseId
                    if (session.sonicClient) {
                        await session.sonicClient.sendToolResult(
                            toolUse.toolUseId,
                            result // Pass raw result object
                        );
                    }

                    // Optional: Inform user via system message
                    /*
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'transcript',
                            role: 'assistant',
                            text: `[System] Tool executed: ${ toolUse.name } `,
                            isFinal: true
                        }));
                    }
                    */

                } catch (e: any) {
                    console.error('[Server] Native tool execution failed:', e);
                    // Report error back to Sonic
                    if (session.sonicClient) {
                        await session.sonicClient.sendToolResult(
                            toolUse.toolUseId,
                            { text: `Error: ${e.message} ` },
                            true
                        );
                    }
                }
            }
            break;
        }

        case 'metadata':
            // Forward metrics to debug panel
            if (ws.readyState === WebSocket.OPEN && event.data.metrics) {
                ws.send(JSON.stringify({
                    type: 'debugInfo',
                    data: {
                        metrics: event.data.metrics
                    }
                }));
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

        case 'contentEnd':
            // Reset audio squelch for next turn
            if (session.isIntercepting) {
                console.log(`[Server] Turn End(${event.type}): Resetting intercept flag.`);
                session.isIntercepting = false;
            }
            break;

        case 'interactionTurnEnd':
            // Reset flow state for next interaction
            session.hasFlowedAudio = false;
            if (session.isIntercepting) {
                session.isIntercepting = false;
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
