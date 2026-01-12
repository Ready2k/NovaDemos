import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SonicClient, AudioChunk, SonicEvent } from './sonic-client';
import { callBankAgent } from './bedrock-agent-client';
import { TranscribeClientWrapper } from './transcribe-client';
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import { AgentCoreGatewayClient } from './agentcore-gateway-client';
import { ToolManager } from './tool-manager';
import { formatVoicesForFrontend, fetchAvailableVoices } from './voice-service';

import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Version and build info
let VERSION_INFO;
try {
    VERSION_INFO = JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8'));
} catch (error) {
    // Fallback if build-info.json doesn't exist
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    VERSION_INFO = {
        version: packageJson.version,
        buildTime: new Date().toISOString(),
        name: packageJson.name
    };
}

// Utility function to add timestamps to logs
function logWithTimestamp(level: string, message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level} ${message}`);
}

// --- AWS Bedrock AgentCore Client ---
// Build credentials config for AgentCore client
let agentCoreConfig: any = {
    region: process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1'
};

// Add explicit credentials if NOVA_ prefixed env vars are set
if (process.env.NOVA_AWS_ACCESS_KEY_ID && process.env.NOVA_AWS_SECRET_ACCESS_KEY) {
    agentCoreConfig.credentials = {
        accessKeyId: process.env.NOVA_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
        ...(process.env.NOVA_AWS_SESSION_TOKEN && { sessionToken: process.env.NOVA_AWS_SESSION_TOKEN })
    };
} else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    agentCoreConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN })
    };
}

let agentCoreClient = new BedrockAgentCoreClient(agentCoreConfig);

// Initialize Bedrock Client for listing models
let bedrockClient = new BedrockClient(agentCoreConfig);

// Initialize Bedrock Agent Runtime Client for KB retrieval
let bedrockAgentRuntimeClient = new BedrockAgentRuntimeClient(agentCoreConfig);


// Initialize AgentCore Gateway Client
let agentCoreGatewayClient: AgentCoreGatewayClient | null = null;
try {
    agentCoreGatewayClient = new AgentCoreGatewayClient();
    console.log('[Server] AgentCore Gateway Client initialized successfully');
} catch (error) {
    console.warn('[Server] AgentCore Gateway Client initialization failed:', error);
}



// Knowledge Base Storage - Hoisted
const KB_FILE = path.join(__dirname, '../../knowledge_bases.json');

function loadKnowledgeBases() {
    try {
        if (!fs.existsSync(KB_FILE)) return [];
        return JSON.parse(fs.readFileSync(KB_FILE, 'utf-8'));
    } catch (e) {
        console.error("Failed to load KBs:", e);
        return [];
    }
}

function saveKnowledgeBases(kbs: any[]) {
    fs.writeFileSync(KB_FILE, JSON.stringify(kbs, null, 2));
}



/**
 * Check if two messages are similar enough to be considered duplicates
 * Uses fuzzy matching to catch variations in formatting, punctuation, etc.
 */
function areSimilarMessages(msg1: string, msg2: string): boolean {
    // Normalize both messages for comparison
    const normalize = (text: string) => text
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();

    const norm1 = normalize(msg1);
    const norm2 = normalize(msg2);

    // Check for exact match after normalization
    if (norm1 === norm2) return true;

    // Check if one is contained in the other (with significant overlap)
    const minLength = Math.min(norm1.length, norm2.length);
    if (minLength > 20) { // Only for substantial messages
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
            return true;
        }
    }

    // Check for high similarity using simple word overlap
    const words1 = norm1.split(' ').filter(w => w.length > 2);
    const words2 = norm2.split(' ').filter(w => w.length > 2);

    if (words1.length > 3 && words2.length > 3) {
        const commonWords = words1.filter(w => words2.includes(w));
        const similarity = commonWords.length / Math.max(words1.length, words2.length);
        return similarity > 0.8; // 80% word overlap
    }

    return false;
}

/**
 * Extract new content from accumulated Nova Sonic response
 * 
 * Nova Sonic maintains conversation context and accumulates responses like:
 * "Hello! How can I help you?I am an AI assistant. What do you need?"
 * 
 * This function extracts only the new content: "I am an AI assistant. What do you need?"
 */
function extractNewContent(fullResponse: string, previousResponses: string[]): string {
    if (!previousResponses || previousResponses.length === 0) {
        return fullResponse;
    }

    // Find the longest previous response that appears at the start of current response
    let longestMatch = '';
    let bestMatchLength = 0;

    for (const prevResponse of previousResponses) {
        // First try exact match
        if (fullResponse.startsWith(prevResponse) && prevResponse.length > longestMatch.length) {
            longestMatch = prevResponse;
            bestMatchLength = prevResponse.length;
            continue;
        }

        // Try fuzzy matching - find the longest common prefix
        let commonLength = 0;
        const minLength = Math.min(fullResponse.length, prevResponse.length);

        for (let i = 0; i < minLength; i++) {
            if (fullResponse[i] === prevResponse[i]) {
                commonLength = i + 1;
            } else {
                break;
            }
        }

        // If we found a substantial common prefix (at least 50 characters)
        if (commonLength > 50 && commonLength > bestMatchLength) {
            longestMatch = fullResponse.substring(0, commonLength);
            bestMatchLength = commonLength;
        }
    }

    // If we found a match, extract only the new content
    if (bestMatchLength > 0) {
        const newContent = fullResponse.substring(bestMatchLength).trim();
        console.log(`[ResponseParser] Extracted new content from accumulated response:`);
        console.log(`[ResponseParser] Full: "${fullResponse.substring(0, 100)}..."`);
        console.log(`[ResponseParser] Matched: "${longestMatch.substring(0, 50)}..."`);
        console.log(`[ResponseParser] New: "${newContent.substring(0, 50)}..."`);
        return newContent;
    }

    return fullResponse;
}

/**
 * Remove internal duplication within a single response
 * 
 * Nova Sonic sometimes generates responses like:
 * "Hello! How can I help you?Hello! How can I help you? I'm here to assist."
 * 
 * This function detects and removes such internal duplications.
 */
function removeInternalDuplication(text: string): string {
    if (!text || text.length < 20) {
        return text;
    }

    // Split into sentences for analysis
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

    if (sentences.length < 2) {
        return text;
    }

    // Check for repeated sentences at the beginning
    const firstSentence = sentences[0].trim();
    const secondSentence = sentences[1].trim();

    // If the first two sentences are very similar or identical
    if (firstSentence.length > 10 && secondSentence.length > 10) {
        const similarity = calculateStringSimilarity(firstSentence.toLowerCase(), secondSentence.toLowerCase());

        if (similarity > 0.8) {
            console.log(`[InternalDedup] Detected internal duplication (similarity: ${similarity.toFixed(2)})`);
            console.log(`[InternalDedup] First: "${firstSentence.substring(0, 50)}..."`);
            console.log(`[InternalDedup] Second: "${secondSentence.substring(0, 50)}..."`);

            // Remove the first sentence and return the rest
            const remainingSentences = sentences.slice(1);
            const cleanedText = remainingSentences.join('. ').trim();

            // Add proper punctuation if needed
            if (cleanedText && !cleanedText.match(/[.!?]$/)) {
                return cleanedText + '.';
            }

            console.log(`[InternalDedup] Cleaned: "${cleanedText.substring(0, 50)}..."`);
            return cleanedText;
        }
    }

    // Check for exact substring duplication (like "Hello!Hello!")
    const words = text.split(' ');
    if (words.length >= 4) {
        const halfLength = Math.floor(words.length / 2);
        const firstHalf = words.slice(0, halfLength).join(' ');
        const secondHalf = words.slice(halfLength, halfLength * 2).join(' ');

        if (firstHalf.length > 10 && firstHalf === secondHalf) {
            console.log(`[InternalDedup] Detected exact duplication in first half`);
            console.log(`[InternalDedup] Duplicated part: "${firstHalf.substring(0, 50)}..."`);

            // Return only the second half plus any remaining content
            const remaining = words.slice(halfLength).join(' ');
            console.log(`[InternalDedup] Cleaned: "${remaining.substring(0, 50)}..."`);
            return remaining;
        }
    }

    return text;
}

/**
 * Helper to call AWS AgentCore Runtime
 * NOW SUPPORTS: Multi-Turn Loop (The "Orchestrator" Pattern)
 */
async function callAgentCore(session: ClientSession, qualifier: string, initialPayload: any) {
    try {
        console.log(`[AgentCore] Invoking agent for session ${session.sessionId} with qualifier: '${qualifier}'`);
        const cleanQualifier = qualifier.trim();

        // Use session-specific Agent Core Runtime ARN if available, otherwise fall back to environment variable
        let runtimeArn = session.sonicClient?.config?.agentCoreRuntimeArn || process.env.AGENT_CORE_RUNTIME_ARN;
        if (!runtimeArn) return { status: "error", message: "Missing AGENT_CORE_RUNTIME_ARN" };
        if (runtimeArn && runtimeArn.includes('/runtime-endpoint/')) runtimeArn = runtimeArn.split('/runtime-endpoint/')[0];

        // --- MORTGAGE TOOL HANDLERS (MOCK) ---
        if (cleanQualifier === 'check_credit_score') {
            console.log(`[Tool] Executing check_credit_score with payload:`, initialPayload);
            // Deterministic mock based on name length to allow testing both paths
            const params = typeof initialPayload === 'string' ? JSON.parse(initialPayload) : initialPayload;
            const name = params.name || "Unknown";
            // If name has "Fail", give low score
            let score = 750;
            if (name.toLowerCase().includes('fail') || name.toLowerCase().includes('reject')) {
                score = 450;
            } else {
                score = 800 + Math.floor(Math.random() * 100);
            }
            return {
                status: "success",
                data: JSON.stringify({
                    score: score,
                    rating: score > 700 ? "Excellent" : "Poor",
                    status: score > 600 ? "PASS" : "FAIL"
                })
            };
        }

        if (cleanQualifier === 'value_property') {
            console.log(`[Tool] Executing value_property with payload:`, initialPayload);
            const params = typeof initialPayload === 'string' ? JSON.parse(initialPayload) : initialPayload;
            const estimated = Number(params.estimated_value) || 300000;
            // Valuate at +/- 5% of estimate
            const variance = 0.95 + (Math.random() * 0.1);
            const valuation = Math.round(estimated * variance);
            return {
                status: "success",
                data: JSON.stringify({
                    valuation: valuation,
                    confidence: "High",
                    source: "Hometrack Mock"
                })
            };
        }

        if (cleanQualifier === 'search_knowledge_base') {
            console.log(`[Tool] Executing search_knowledge_base with payload:`, initialPayload);
            const params = typeof initialPayload === 'string' ? JSON.parse(initialPayload) : initialPayload;
            const query = params.query;

            // Load KBs to find the configured one (supporting multiple for future, but using first enabled or specific ID for now)
            // For now, we'll try to find a KB ID passed in env or look up from our local storage if we had session context
            // Since the tool definition doesn't pass KB ID, we might need to hardcode or lookup.
            // The User Request mentioned KB ID: KCDO7ZUFA1.
            // Ideally, we should pick the KB associated with the current configuration.

            // Let's check if we can get the active KB from session (not currently stored) or fall back to the task's ID.
            // We'll read the KB_FILE to find available KBs.
            let kbId = "KCDO7ZUFA1"; // Default from task
            let modelArn = "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0";

            try {
                if (fs.existsSync(KB_FILE)) {
                    const kbs = JSON.parse(fs.readFileSync(KB_FILE, 'utf-8'));
                    if (kbs.length > 0) {
                        kbId = kbs[0].id; // Use the first one
                        if (kbs[0].modelArn) modelArn = kbs[0].modelArn;
                    }
                }
            } catch (e) {
                console.warn("[Tool] Failed to load KB config, using default", e);
            }

            try {
                const command = new RetrieveAndGenerateCommand({
                    input: { text: query },
                    retrieveAndGenerateConfiguration: {
                        type: 'KNOWLEDGE_BASE',
                        knowledgeBaseConfiguration: {
                            knowledgeBaseId: kbId,
                            modelArn: modelArn
                        }
                    }
                });

                const response = await bedrockAgentRuntimeClient.send(command);
                console.log("[Tool] Knowledge Base Response Metadata:", JSON.stringify(response.citations || "No citations", null, 2));

                const resultText = response.output?.text || "No information found in the knowledge base.";

                return {
                    status: "success",
                    data: resultText
                };
            } catch (error: any) {
                console.error("[Tool] Knowledge Base search failed:", error);
                return {
                    status: "error",
                    data: `Failed to search knowledge base: ${error.message}`
                };
            }
        }

        if (cleanQualifier === 'calculate_max_loan') {
            console.log(`[Tool] Executing calculate_max_loan with payload:`, initialPayload);
            const params = typeof initialPayload === 'string' ? JSON.parse(initialPayload) : initialPayload;
            const income = Number(params.total_annual_income) || 0;
            const multiplier = 4.5;
            const maxLoan = income * multiplier;
            return {
                status: "success",
                data: JSON.stringify({
                    max_loan_amount: maxLoan,
                    multiplier_used: multiplier,
                    risk_factor: "Standard"
                })
            };
        }

        if (cleanQualifier === 'get_mortgage_rates') {
            console.log(`[Tool] Executing get_mortgage_rates with payload:`, initialPayload);
            return {
                status: "success",
                data: JSON.stringify({
                    products: [
                        { name: "2 Year Fixed", rate: "4.5%", fee: "£999", monthly_payment: "Calculated at application" },
                        { name: "5 Year Fixed", rate: "4.1%", fee: "£0", monthly_payment: "Calculated at application" },
                        { name: "Tracker", rate: "Base + 0.5%", fee: "£499" }
                    ]
                })
            };
        }
        // --------------------------------------

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

            // CHECK FOR TAGS (<search>) - use 's' flag to match newlines
            const searchMatch = agentText.match(/<search>(.*?)<\/search>/s);

            // BANKING TOOL FIX: Skip orchestrator loop for banking tools
            const isBankingTool = ['agentcore_balance', 'agentcore_transactions', 'perform_idv_check',
                'create_dispute_case', 'lookup_merchant_alias', 'manage_recent_interactions',
                'update_dispute_case'].includes(qualifier);

            if (searchMatch && !isBankingTool) {
                const query = searchMatch[1];

                // Execute actual tool logic based on query
                let toolResult = "";
                if (query.toLowerCase().includes('time') || query.toLowerCase().includes('current')) {
                    const now = new Date();
                    const timeString = now.toLocaleString('en-GB', {
                        timeZone: 'Europe/London',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    toolResult = `The current time in London, UK is: ${timeString}`;
                } else {
                    toolResult = `Information retrieved for: ${query}`;
                }

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
const HISTORY_DIR = path.join(__dirname, '../../chat_history');

// Ensure history directory exists
function ensureHistoryDir() {
    if (!fs.existsSync(HISTORY_DIR)) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
        console.log(`[Server] Created chat history directory: ${HISTORY_DIR}`);
    }
}
ensureHistoryDir();



// Save transcript to file
function saveTranscript(session: ClientSession) {
    if (!session.transcript || session.transcript.length === 0) return;

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `session_${timestamp}_${session.sessionId.substring(0, 8)}.json`;
        const filePath = path.join(HISTORY_DIR, filename);

        const data = {
            sessionId: session.sessionId,
            startTime: session.transcript[0]?.timestamp || Date.now(),
            endTime: Date.now(),
            brainMode: session.brainMode,
            transcript: session.transcript,
            tools: session.allowedTools || [] // Save allowed tools list
        };

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`[Server] Saved chat history to ${filename}`);
    } catch (err) {
        console.error('[Server] Failed to save chat history:', err);
    }
}

// Initialize Tool Manager
const toolManager = new ToolManager(TOOLS_DIR);

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
        return files.filter(f => f.endsWith('.txt')).map(f => {
            let displayName = f.replace('.txt', '');

            // Handle prefixed naming convention
            if (displayName.startsWith('core-')) {
                displayName = 'Core ' + displayName.substring(5).replace(/_/g, ' ');
            } else if (displayName.startsWith('persona-')) {
                displayName = 'Persona ' + displayName.substring(8).replace(/_/g, ' ');
            } else {
                displayName = displayName.replace(/_/g, ' ');
            }

            // Capitalize words
            displayName = displayName.replace(/\b\w/g, l => l.toUpperCase());

            return {
                id: f,
                name: displayName,
                content: loadPrompt(f)
            };
        });
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
                // 1. Rename input_schema -> inputSchema (also support 'parameters')
                // 2. Wrap schema in { json: ... }
                const schema = toolDef.input_schema || toolDef.inputSchema || toolDef.parameters;
                const toolSpec: any = {
                    name: toolDef.name,
                    description: toolDef.description,
                    inputSchema: {
                        json: JSON.stringify(schema || {
                            type: "object",
                            properties: {},
                            required: []
                        })
                    }
                };

                return {
                    toolSpec: toolSpec,
                    instruction: toolDef.instruction, // Pass instruction to frontend
                    agentPrompt: toolDef.agentPrompt, // New: AgentCore prompt override
                    gatewayTarget: toolDef.gatewayTarget // New: Gateway target
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

// Progressive filler system for tool execution feedback
// Progressive filler system completely disabled per user request


function calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(' ').filter(w => w.length > 2);
    const words2 = str2.split(' ').filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const commonWords = words1.filter(w => words2.includes(w));
    return commonWords.length / Math.max(words1.length, words2.length);
}



// generateFillerWithSonic function removed - Nova 2 Sonic handles filler natively

// prewarmFillerCache function removed - Nova 2 Sonic handles filler natively

// performMockSearch function removed - now using proper tool execution logic in callAgentCore

// handleFillerWord function removed - Nova 2 Sonic handles filler natively

// handleDelayedFillerWord function removed - Nova 2 Sonic handles filler natively




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
    initialGreetingTimer?: NodeJS.Timeout | null; // Track initial greeting to prevent duplicates
    lastUserTranscript?: string;
    // Deduplication
    lastAgentReply?: string;
    lastAgentReplyTime?: number;
    recentAgentReplies?: Array<{ text: string, originalText?: string, time: number }>; // Track multiple recent messages
    // Tools
    tools?: Tool[];
    allowedTools?: string[]; // Tools permitted for execution (checked server-side)
    // Audio Buffering (Lookahead)
    isBufferingAudio?: boolean;
    audioBufferQueue?: Buffer[];
    hasFlowedAudio?: boolean;
    // Voice Config
    voiceId?: string;

    // Context Variables
    userLocation?: string;
    userTimezone?: string;

    // Tool Result Caching
    toolResultCache?: Map<string, {
        result: any;
        timestamp: number;
        toolName: string;
        query: string;
    }>;

    // Tool Execution Deduplication
    recentToolExecutions?: Map<string, {
        toolName: string;
        parameters: any;
        timestamp: number;
        result: any;
    }>;

    // Chat History
    transcript: {
        role: string;
        text: string;
        timestamp: number;
        type?: 'speculative' | 'final'; // New: Track type of transcript
    }[];

    // AWS Credentials (Per Session)
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    awsSessionToken?: string;
    awsRegion?: string;
    agentCoreRuntimeArn?: string;
}

const activeSessions = new Map<WebSocket, ClientSession>();

// Create HTTP server
const server = http.createServer(async (req, res) => {
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
        if (req.method === 'GET') {
            const tools = toolManager.listTools();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(tools));
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const toolDef = JSON.parse(body);
                    const success = toolManager.saveTool(toolDef);
                    if (success) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'success', message: 'Tool saved' }));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'error', message: 'Failed to save tool' }));
                    }
                } catch (e: any) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON: ' + e.message }));
                }
            });
            return;
        }
    }

    if (req.url?.startsWith('/api/tools/')) {
        const toolName = req.url.substring(11); // Remove /api/tools/

        if (req.method === 'DELETE') {
            const success = toolManager.deleteTool(toolName);
            if (success) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', message: 'Tool deleted' }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Tool not found or failed to delete' }));
            }
            return;
        }
    }

    if (req.url === '/api/gateway/tools') {
        if (agentCoreGatewayClient) {
            try {
                const tools = await agentCoreGatewayClient.listTools();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(tools));
            } catch (error: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        } else {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Gateway client not initialized' }));
        }
        return;
    }

    // List available personas (files in prompts directory)
    if (req.url === '/api/personas') {
        const prompts = listPrompts();
        // Filter mainly for persona-* but allow generic files if they map to flows
        // For visualizer, we want simple IDs
        const personas = prompts.map(p => ({
            id: p.id.replace('.txt', ''),
            name: p.name
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(personas));
        return;
    }

    // Dynamic Workflow Graph API
    if (req.method === 'GET' && req.url?.startsWith('/api/workflow/')) {
        const id = req.url.substring(14); // Remove /api/workflow/

        let filename = 'workflow-banking.json'; // Default

        // Map persona ID to workflow JSON file
        // Ideally these should be auto-generated or strictly mapped.
        // For this demo, we map 'persona-BankingDisputes' to the existing file.
        // Others will get a default 'Not Available' placeholder or generic flow.

        if (id === 'persona-BankingDisputes' || id === 'banking') {
            filename = 'workflow-banking.json';
        } else {
            // For now, return a generic placeholder graph for unsupported personas
            // or we could check if a specific json exists.
            const potentialFile = `workflow-${id}.json`;
            // Check existence in src/ or current dir logic below...
            filename = potentialFile;
        }

        // Path resolution (dist/ vs src/)
        let workflowPath = path.join(__dirname, '../src/', filename);
        if (!fs.existsSync(workflowPath)) {
            workflowPath = path.join(__dirname, filename);
        }

        if (fs.existsSync(workflowPath)) {
            const workflow = fs.readFileSync(workflowPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(workflow);
        } else {
            // Return a default "Empty/Placeholder" graph if specific file not found
            const placeholder = {
                nodes: [
                    { id: "start", label: "Start", type: "start" },
                    { id: "note", label: "No workflow defined\nfor this persona yet.", type: "process" },
                    { id: "end_placeholder", label: "End", type: "end" }
                ],
                edges: [
                    { from: "start", to: "note" },
                    { from: "note", to: "end_placeholder" }
                ]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(placeholder));
        }
        return;
    }


    // Save Workflow Graph API
    if (req.method === 'POST' && req.url?.startsWith('/api/workflow/')) {
        const id = req.url.substring(14); // Remove /api/workflow/

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const workflowData = JSON.parse(body);

                // validate minimal structure
                if (!workflowData.nodes || !Array.isArray(workflowData.nodes)) {
                    throw new Error('Invalid workflow data: missing nodes array');
                }

                // Determine filename
                let filename = `workflow-${id}.json`;
                if (id === 'persona-BankingDisputes' || id === 'banking') {
                    filename = 'workflow-banking.json';
                }

                // Default save to src directory so it persists across builds
                // Fallback to current dir if src not reachable
                let savePath = path.join(__dirname, '../src/', filename);

                // Verify directory exists (src should exist)
                const srcDir = path.dirname(savePath);
                if (!fs.existsSync(srcDir)) {
                    // Fallback to local dir
                    savePath = path.join(__dirname, filename);
                }

                fs.writeFileSync(savePath, JSON.stringify(workflowData, null, 2));
                console.log(`[Server] Saved workflow to ${savePath}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', path: savePath }));

            } catch (error: any) {
                console.error('[Server] Failed to save workflow:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }


    // Knowledge Base APIs
    if (req.url === '/api/knowledge-bases') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(loadKnowledgeBases()));
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const newKb = JSON.parse(body);
                    const kbs = loadKnowledgeBases();
                    kbs.push(newKb);
                    saveKnowledgeBases(kbs);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'success' }));
                } catch (e: any) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
    }



    if (req.url && req.url.startsWith('/api/knowledge-bases/') && req.method === 'PUT') {
        const idToUpdate = req.url.split('/').pop();
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const updatedFields = JSON.parse(body);
                const kbs = loadKnowledgeBases();
                const index = kbs.findIndex((kb: any) => kb.id === idToUpdate);

                if (index !== -1) {
                    kbs[index] = { ...kbs[index], ...updatedFields, id: idToUpdate };
                    saveKnowledgeBases(kbs);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'success' }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'KB not found' }));
                }
            } catch (e: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }



    if (req.url && req.url.startsWith('/api/knowledge-bases/') && req.method === 'DELETE') {
        const idToDelete = req.url.split('/').pop();
        const kbs = loadKnowledgeBases();
        const newKbs = kbs.filter((kb: any) => kb.id !== idToDelete);
        saveKnowledgeBases(newKbs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
        return;
    }

    // List Bedrock Models Endpoint
    if (req.url === '/api/bedrock-models') {
        console.log('[Server] Received request for /api/bedrock-models');
        try {
            console.log('[Server] Listing Foundation Models...');
            const command = new ListFoundationModelsCommand({});
            const response = await bedrockClient.send(command);
            console.log('[Server] Received response from Bedrock:', response.modelSummaries?.length || 0, 'models');

            const uniqueModels = new Map();

            response.modelSummaries?.forEach(m => {
                if (m.modelLifecycle?.status !== 'ACTIVE') return;
                // Filter for TEXT output only (excludes embeddings and image generation)
                if (!m.outputModalities?.includes('TEXT')) return;
                // Exclude embedding models explicitly just in case
                if (!m.modelId || m.modelId.includes('embed')) return;

                // Deduplication logic:
                // If we already have this model name, we might want to keep the "latest" or "on-demand" version.
                // Usually, the List API returns multiple variants. 
                // We'll prefer standard IDs over 'provisioned' ones if identifiable, 
                // but significantly, we only want one entry per visual name to avoid confusion.
                // We will overwrite, effectively keeping the last one seen unless we add specific logic.
                // A better approach is to check if the existing one is "better".
                // For now, let's just ensure we have unique names.
                if (!uniqueModels.has(m.modelName)) {
                    uniqueModels.set(m.modelName, {
                        id: m.modelId,
                        arn: m.modelArn,
                        name: m.modelName,
                        provider: m.providerName
                    });
                } else {
                    // Optional: Smart selection if duplicates differ significantly?
                    // For now, first-come (or last-come) unique name is enough to declutter.
                }
            });

            const models = Array.from(uniqueModels.values())
                .sort((a: any, b: any) => a.name.localeCompare(b.name));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(models));
        } catch (error: any) {
            console.error('[Server] Failed to list models:', error);
            // Fallback to basic list if permission denied or error
            const fallbackModels = [
                { id: 'anthropic.claude-3-haiku-20240307-v1:0', arn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku', provider: 'Anthropic' },
                { id: 'anthropic.claude-3-sonnet-20240229-v1:0', arn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0', name: 'Claude 3 Sonnet', provider: 'Anthropic' },
                { id: 'us.amazon.nova-2-lite-v1:0', arn: 'arn:aws:bedrock:us-east-1::foundation-model/us.amazon.nova-2-lite-v1:0', name: 'Nova 2 Lite', provider: 'Amazon' },
                { id: 'us.amazon.nova-2-pro-v1:0', arn: 'arn:aws:bedrock:us-east-1::foundation-model/us.amazon.nova-2-pro-v1:0', name: 'Nova 2 Pro', provider: 'Amazon' }
            ];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(fallbackModels));
        }
        return;
    }

    if (req.url === '/api/voices') {
        const voices = formatVoicesForFrontend();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(voices));
        return;
    }


    if (req.url === '/api/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(VERSION_INFO));
        return;
    }

    // Chat History API
    if (req.url === '/api/history') {
        try {
            ensureHistoryDir();
            const files = fs.readdirSync(HISTORY_DIR)
                .filter(f => f.endsWith('.json'))
                .map(f => {
                    const content = fs.readFileSync(path.join(HISTORY_DIR, f), 'utf-8');
                    const data = JSON.parse(content);
                    const totalMessages = data.transcript?.length || 0;
                    const finalMessages = data.transcript?.filter((msg: any) => msg.type !== 'speculative').length || 0;

                    return {
                        id: f,
                        date: data.startTime || fs.statSync(path.join(HISTORY_DIR, f)).mtimeMs,
                        summary: `Session ${data.sessionId?.substring(0, 6) || 'Unknown'} - ${totalMessages} msgs`,
                        totalMessages,
                        finalMessages,
                        transcript: data.transcript // Optional: don't send full transcript in list if heavy
                    };
                })
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Newest first

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
        } catch (err) {
            console.error('[Server] Failed to list history:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to list history' }));
        }
        return;
    }

    if (req.url?.startsWith('/api/history/')) {
        const filename = req.url.substring(13); // Remove /api/history/
        const safePath = path.join(HISTORY_DIR, path.basename(filename));

        if (fs.existsSync(safePath)) {
            const content = fs.readFileSync(safePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(content);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'History file not found' }));
        }
        return;
    }

    if (req.url === '/api/workflows') {
        try {
            // List all workflow files in src directory
            const srcDir = path.join(__dirname, '../src/');
            if (fs.existsSync(srcDir)) {
                const files = fs.readdirSync(srcDir)
                    .filter(f => f.startsWith('workflow-') && f.endsWith('.json'));

                const workflows = files.map(f => {
                    // Extract ID: workflow-banking.json -> banking
                    // workflow-persona-mortgage.json -> persona-mortgage
                    let id = f.replace('workflow-', '').replace('.json', '');
                    let name = id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

                    // Specific overrides for nicer names
                    if (id === 'banking') name = 'Banking Disputes';
                    if (id === 'persona-mortgage') name = 'Mortgage Application';

                    return { id, name, filename: f };
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(workflows));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
            }
        } catch (error) {
            console.error('[Server] Error fetching workflows:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch workflows' }));
        }
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
        case '.md':
            contentType = 'text/markdown';
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

    logWithTimestamp('[Server]', `New client connected: ${clientIp} (${sessionId})`);

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
        initialGreetingTimer: null,
        isInterrupted: false,
        isIntercepting: false,
        lastUserTranscript: '',
        lastAgentReply: undefined,
        lastAgentReplyTime: 0,
        recentAgentReplies: [],

        userLocation: "Unknown Location",
        userTimezone: "UTC",

        // Chat History
        transcript: []
    };
    activeSessions.set(ws, session);

    // Send connection acknowledgment
    ws.send(JSON.stringify({
        type: 'connected',
        sessionId,
        message: 'Connected to Nova 2 Sonic',
        version: VERSION_INFO,
        hasCredentials: !!(agentCoreConfig.credentials && agentCoreConfig.credentials.accessKeyId)
    }));

    // Handle incoming messages (JSON config or binary audio)
    ws.on('message', async (data: any) => {
        const isBuffer = Buffer.isBuffer(data);
        let firstByte = 'N/A';
        if (isBuffer && data.length > 0) firstByte = data[0].toString();

        try {
            // Check if it's a JSON message (configuration)
            // Improved detection: must be string data or buffer that looks like valid JSON
            const isLikelyJson = !Buffer.isBuffer(data) ||
                (data.length > 10 && data[0] === 123 && data[1] === 34); // Starts with '{"'

            if (isLikelyJson) {
                const message = data.toString('utf8');
                // Additional validation: must be valid UTF-8 and contain common JSON patterns
                if (message.includes('"type"') || message.includes('"config"')) {
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
                            // Use default agent from .env for Banking Bot mode
                            session.agentId = process.env.AGENT_ID;
                            session.agentAliasId = process.env.AGENT_ALIAS_ID;
                            if (session.agentId && session.agentAliasId) {
                                console.log(`[Server] Using Default Agent: ${session.agentId} / ${session.agentAliasId}`);
                            }
                        }

                        // 1.5 Handle AWS Credentials from Client
                        if (parsed.config.awsAccessKeyId && parsed.config.awsSecretAccessKey) {
                            session.awsAccessKeyId = parsed.config.awsAccessKeyId;
                            session.awsSecretAccessKey = parsed.config.awsSecretAccessKey;
                            session.awsSessionToken = parsed.config.awsSessionToken;
                            session.awsRegion = parsed.config.awsRegion || 'us-east-1';
                            session.agentCoreRuntimeArn = parsed.config.agentCoreRuntimeArn; // Store ARN if provided

                            const tokenStatus = session.awsSessionToken ? `Present (len: ${session.awsSessionToken.length})` : 'Missing/Empty';
                            console.log(`[Server] Received AWS Credentials from client. AccessKey: ${session.awsAccessKeyId?.substr(0, 4)}..., Token: ${tokenStatus}`);
                        }

                        // 1.8 Inject Core Guardrails (System-Level Quality Rules)
                        // These guardrails ensure consistent quality across all personas
                        // Can be disabled via frontend toggle for demonstration purposes
                        const enableGuardrails = parsed.config.enableGuardrails ?? true; // Default enabled

                        if (enableGuardrails && parsed.config.systemPrompt) {
                            const guardrails = loadPrompt('core-guardrails.txt');
                            if (guardrails) {
                                console.log('[Server] ✅ Injecting Core Guardrails (enabled by config)');
                                parsed.config.systemPrompt = guardrails + "\n\n" + "--- PERSONA-SPECIFIC INSTRUCTIONS BELOW ---\n\n" + parsed.config.systemPrompt;
                            }
                        } else if (!enableGuardrails) {
                            console.log('[Server] ⚠️  Core Guardrails DISABLED (per config) - persona prompt only');
                        }


                        // 2. Handle Brain Mode
                        if (parsed.config.brainMode) {
                            session.brainMode = parsed.config.brainMode;
                            logWithTimestamp('[Server]', `Switched Brain Mode to: ${session.brainMode}`);

                            // Workflow injection moved to after tool injection

                            // If Agent Mode, override system prompt to be a TTS engine
                            if (session.brainMode === 'bedrock_agent') {
                                parsed.config.systemPrompt = loadPrompt('core-agent_echo.txt');
                                console.log('[Server] Overriding System Prompt for Agent Mode (Echo Bot)');
                                console.log(`[Server] --- AGENT MODE ACTIVE: ${session.agentId || 'Default Banking Bot'} ---`);

                                // Test the agent with an initial greeting - DISABLED to prevent double streams
                                // setTimeout(async () => {
                                //     try {
                                //         console.log('[Server] Testing Banking Bot with initial greeting...');
                                //         const { completion: agentReply } = await callBankAgent(
                                //             "Hello, I'd like to get started",
                                //             session.sessionId,
                                //             session.agentId,
                                //             session.agentAliasId,
                                //             {
                                //                 accessKeyId: session.awsAccessKeyId,
                                //                 secretAccessKey: session.awsSecretAccessKey,
                                //                 sessionToken: session.awsSessionToken,
                                //                 region: session.awsRegion
                                //             }
                                //         );
                                //         logWithTimestamp('[Server]', `Banking Bot replied: "${agentReply}"`);

                                //         // Send to UI
                                //         ws.send(JSON.stringify({
                                //             type: 'transcript',
                                //             role: 'assistant',
                                //             text: agentReply,
                                //             isFinal: true
                                //         }));

                                //         // Send to TTS - Ensure session is properly started
                                //         if (session.sonicClient) {
                                //             // Check if Nova Sonic session is active
                                //             if (!session.sonicClient.getSessionId()) {
                                //                 console.log('[Server] Starting Nova Sonic session for Banking Bot TTS...');
                                //                 await session.sonicClient.startSession((event: SonicEvent) =>
                                //                     handleSonicEvent(ws, event, session)
                                //                 );
                                //                 // Wait a moment for session to be fully established
                                //                 await new Promise(resolve => setTimeout(resolve, 500));
                                //             }

                                //             // Double-check session is active before sending text
                                //             if (session.sonicClient.getSessionId()) {
                                //                 logWithTimestamp('[Server]', 'Sending Banking Bot greeting to TTS...');
                                //                 await session.sonicClient.sendText(agentReply);
                                //             } else {
                                //                 console.error('[Server] Nova Sonic session failed to start for Banking Bot TTS');
                                //             }
                                //         }
                                //     } catch (error) {
                                //         console.error('[Server] Banking Bot test failed:', error);
                                //         ws.send(JSON.stringify({
                                //             type: 'transcript',
                                //             role: 'system',
                                //             text: `Banking Bot Error: ${error instanceof Error ? error.message : String(error)}`,
                                //             isFinal: true
                                //         }));
                                //     }
                                // }, 1000);
                            }
                        }

                        // --- WORKFLOW LOADING (Priority for Tool Selection) ---
                        let workflowSystemPrompt = "";
                        let workflowTools: string[] | undefined;
                        try {
                            const availableWorkflows: any = {}; // Map of Prefix -> FilePath
                            let personaId = parsed.config.agentId || 'persona-banking_bot'; // Default fallback
                            personaId = personaId.replace('.txt', '');

                            // MULTI-WORKFLOW CONFIGURATION
                            // Check if client sent explicit linkedWorkflows
                            if (parsed.config.linkedWorkflows && Array.isArray(parsed.config.linkedWorkflows) && parsed.config.linkedWorkflows.length > 0) {
                                console.log('[Server] Using User-Linked Workflows:', parsed.config.linkedWorkflows);
                                parsed.config.linkedWorkflows.forEach((wfId: string) => {
                                    // Map ID to filename
                                    let filename = `workflow-${wfId}.json`;
                                    // Handle legacy/special cases if needed, though robust mapping logic should handle it
                                    // Use uppercase ID as prefix for collision avoidance (e.g. MORTGAGE, BANKING)
                                    let prefix = wfId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
                                    // Simplify prefix if it's long (e.g. PERSONA_MORTGAGE -> MORTGAGE)
                                    if (prefix.includes('PERSONA_')) prefix = prefix.replace('PERSONA_', '');

                                    availableWorkflows[prefix] = filename;
                                });
                            }
                            // Fallback: Hardcoded 'Banking Bot' Logic (Preserve for backward compatibility or default behavior)
                            else if (personaId === 'persona-banking_bot' || personaId === 'banking') {
                                // Default Banking Bot behavior = Dispute + Mortgage (until user overrides via UI)
                                // Actually, per new requirement, default should be NO linked workflow? 
                                // User said: "default view being no linked workflow" - but that refers to UI.
                                // For the bot itself, if no linkedWorkflows sent, maybe just load 'banking'?
                                // Let's keep the single Main workflow fallback if no linked workflows are provided.

                                // Revert to single workflow for 'banking' if no explicit link provided
                                availableWorkflows['MAIN'] = 'workflow-banking.json';
                            } else {
                                // Single workflow fallback for other personas
                                const filename = `workflow-${personaId}.json`;
                                availableWorkflows['MAIN'] = filename;
                            }

                            // MERGE WORKFLOWS
                            let mergedNodes: any[] = [];
                            let mergedEdges: any[] = [];
                            let validedTools: string[] = [];

                            for (const [prefix, filename] of Object.entries(availableWorkflows)) {
                                const workflowPath = path.join(__dirname, '../src/', filename as string);
                                const localPath = path.join(__dirname, filename as string);
                                let wfData;

                                if (fs.existsSync(workflowPath)) {
                                    wfData = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
                                } else if (fs.existsSync(localPath)) {
                                    wfData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
                                }

                                if (wfData) {
                                    console.log(`[Server] Merging workflow: ${filename} (Prefix: ${prefix})`);

                                    // Namespace Nodes & Edges
                                    const namespacedNodes = wfData.nodes.map((node: any) => ({
                                        ...node,
                                        id: `${prefix}_${node.id}`
                                    }));

                                    const namespacedEdges = wfData.edges.map((edge: any) => ({
                                        ...edge,
                                        from: `${prefix}_${edge.from}`,
                                        to: `${prefix}_${edge.to}`
                                    }));

                                    mergedNodes = [...mergedNodes, ...namespacedNodes];
                                    mergedEdges = [...mergedEdges, ...namespacedEdges];

                                    if (wfData.tools) {
                                        validedTools = [...validedTools, ...wfData.tools];
                                    }

                                    // AUTO-DETECT TOOLS FROMNODES (Fix for missing 'tools' array)
                                    if (wfData.nodes) {
                                        wfData.nodes.forEach((node: any) => {
                                            if (node.type === 'tool' && node.toolName) {
                                                validedTools.push(node.toolName);
                                            }
                                        });
                                    }
                                }
                            }

                            if (mergedNodes.length > 0) {
                                // Create Virtual Master Workflow
                                const masterWorkflow = {
                                    nodes: mergedNodes,
                                    edges: mergedEdges
                                };

                                workflowSystemPrompt = convertWorkflowToText(masterWorkflow);
                                workflowTools = [...new Set(validedTools)]; // Dedupe tools

                                // INJECT MASTER ROUTER
                                if (Object.keys(availableWorkflows).length > 1) {
                                    const routerInstruction = `
### MASTER ROUTER INSTRUCTION
You are orchestrating multiple workflows.
1. ASSESS USER INTENT: Determine what the user wants to do.
2. ROUTE TO START NODE:
   - If User wants to Query a Transaction or Dispute: GOTO [DISPUTE_start]
   - If User wants a Mortgage or Home Loan: GOTO [MORTGAGE_start]
   - If Unclear: Ask clarifying question.

`;
                                    workflowSystemPrompt = routerInstruction + workflowSystemPrompt;
                                }

                                console.log(`[Server] Dynamic Workflow Generated. Nodes: ${mergedNodes.length}, Tools: ${workflowTools.length}`);
                            }
                        } catch (e) {
                            console.error("[Server] Failed to load dynamic workflow:", e);
                        }

                        // 3. Inject Tools (Dynamic Selection)
                        const allTools = loadTools();
                        let tools = [];

                        if (workflowTools && Array.isArray(workflowTools)) {
                            // Priority 1: User's Explicit Selection (Strict Limit)
                            // If the user has ticked tools in the UI, we ONLY allow those.
                            if (parsed.config.selectedTools && Array.isArray(parsed.config.selectedTools) && parsed.config.selectedTools.length > 0) {
                                console.log('[Server] Using User Selection STRICTLY (Overrides Workflow Defaults):', parsed.config.selectedTools);
                                const userAllowed = new Set(parsed.config.selectedTools);
                                tools = allTools.filter(t => userAllowed.has(t.toolSpec.name));
                            }
                            // Priority 2: Workflow Definition (Fallback if no user selection)
                            else {
                                console.log('[Server] No user selection. Falling back to strict workflow whitelist.');
                                const allowedNames = new Set(workflowTools);
                                tools = allTools.filter(t => allowedNames.has(t.toolSpec.name));
                            }
                            console.log(`[Server] Using strict workflow tool whitelist (with overrides). Enabled: ${tools.map(t => t.toolSpec.name).join(', ')}`);

                            // If user has specific selection, we should respect it for EXECUTION, 
                            // but we still send definition to LLM so it attempts native use (which we can catch).
                        } else {
                            // PRIORITY 2: Default (Load ALL tools)
                            tools = allTools;
                            console.log('[Server] No workflow tools specified. Sending ALL tools to model to encourage native use.');
                        }

                        // Store user's allowed tools preference
                        if (parsed.config.selectedTools !== undefined && Array.isArray(parsed.config.selectedTools)) {
                            session.allowedTools = parsed.config.selectedTools;
                            console.log(`[Server] User allowed tools: ${JSON.stringify(session.allowedTools)}`);
                        } else {
                            // Default to all tools if no selection
                            session.allowedTools = tools.map(t => t.toolSpec.name);
                        }

                        parsed.config.tools = tools;
                        session.tools = tools; // CRITICAL: Assign to session for interceptor checks in handleSonicEvent
                        logWithTimestamp('[Server]', `Loaded ${tools.length}/${allTools.length} tools: ${tools.map(t => t.toolSpec.name).join(', ') || 'NONE'}`);
                        logWithTimestamp('[Server]', `Tools array: ${JSON.stringify(tools.map(t => t.toolSpec.name))}`);

                        // --- PROMPT ENGINEERING: Inject Tool Instructions ---
                        // AWS Models usually need explicit instructions to use tools reliably.
                        const toolInstructions = tools
                            .map(t => t.instruction)
                            .filter(i => i) // Remove undefined
                            .join('\n');

                        // CONDITIONAL NATIVE TOOL INSTRUCTION - only if tools are enabled
                        const nativeToolInstruction = tools.length > 0 ? `
You have access to helpful tools. Available tools: ${tools.map(t => t.toolSpec.name).join(', ')}. 

CRITICAL TOOL USAGE RULE: 
- ONLY use a tool if the user's request EXPLICITLY requires it or if the current workflow instruction DEMANDS it.
- DO NOT use tools for general conversation or greetings.
- If the user did not ask for the information provided by a tool, DO NOT call it.

When you do use a tool, wait patiently for the result.
` : `
You do not have access to any tools. Answer questions directly based on your knowledge and maintain your personality.
`;


                        if (toolInstructions || nativeToolInstruction) {
                            parsed.config.systemPrompt = (parsed.config.systemPrompt || "") + "\n" + nativeToolInstruction + "\n\nAlso follow these tool use guidelines:\n" + (toolInstructions || "");
                            console.log('[Server] Injected tool instructions into System Prompt.');
                        }

                        // --- WORKFLOW INJECTION (System Prompt Append) ---
                        // Append to System Prompt if we are in RAW NOVA mode (Brain Mode)
                        if (session.brainMode === 'raw_nova' && workflowSystemPrompt) {
                            const basePrompt = parsed.config.systemPrompt || "";
                            // Stronger header
                            const strictHeader = "\n\n########## CRITICAL WORKFLOW OVERRIDE ##########\nYOU MUST IGNORE PREVIOUS CONVERSATIONAL GUIDELINES AND STRICTLY FOLLOW THIS STATE MACHINE:\n";
                            parsed.config.systemPrompt = basePrompt + strictHeader + workflowSystemPrompt;
                            console.log(`[WorkflowDebug] FINAL SYSTEM PROMPT LENGTH: ${parsed.config.systemPrompt.length}`); // DEBUG
                        } else {
                            console.log(`[WorkflowDebug] SKIPPED INJECTION. Mode: ${session.brainMode}, HasWorkflow: ${!!workflowSystemPrompt}`); // DEBUG
                        }
                        // --- WORKFLOW INJECTION END ---

                        // Pass other config to SonicClient
                        // Explicitly include tool definitions in the update (mapped to AWS Tool Interface)
                        // CRITICAL FIX: Nova Sonic expects tools wrapped in toolSpec objects (per AWS sample)
                        const mappedTools = tools.map(t => ({ toolSpec: t.toolSpec }));
                        parsed.config.tools = mappedTools;
                        logWithTimestamp('[Server]', `Passing ${mappedTools.length} tools to SonicClient: ${JSON.stringify(mappedTools.map(t => t.toolSpec.name))}`);
                        logWithTimestamp('[Server]', `Full mapped tools: ${JSON.stringify(mappedTools, null, 2)}`);
                        console.log('[Server] COMPLETE CONFIG BEING SENT TO SONIC:', JSON.stringify(parsed.config, null, 2));
                        sonicClient.updateSessionConfig(parsed.config);

                        // Send System Info to Debug Panel
                        ws.send(JSON.stringify({
                            type: 'debugInfo',
                            data: {
                                sessionId: session.sessionId,
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

                        // Filler cache prewarming removed - Nova 2 Sonic handles filler natively

                        // CRITICAL: If session is already active, we MUST stop it to apply the new System Prompt.
                        // The System Prompt is only sent at the beginning of the session (in createInputStream).
                        if (sonicClient.getSessionId()) {
                            console.log('[Server] Configuration updated while session active. Restarting session to apply new System Prompt...');
                            await sonicClient.stopSession();
                        }

                        // Start session if not already started (or if we just stopped it)
                        if (!sonicClient.getSessionId()) {
                            await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));

                            // AI SPEAKS FIRST: Send initial greeting trigger (only for raw Nova mode)
                            // In Banking Bot mode, the agent will send its own greeting
                            if (session.brainMode !== 'bedrock_agent') {
                                // Clear any pending greeting timer to prevent double-speak if config is resent
                                if (session.initialGreetingTimer) {
                                    clearTimeout(session.initialGreetingTimer);
                                    session.initialGreetingTimer = null;
                                }

                                console.log('[Server] Triggering initial AI greeting...');
                                session.initialGreetingTimer = setTimeout(async () => {
                                    session.initialGreetingTimer = null; // Timer fired, clear ref
                                    // Check if user has already spoken (Smart Start)
                                    // Check if user has already spoken (Smart Start)
                                    if (sonicClient.getSessionId() && !session.lastUserTranscript) {
                                        // Changed "Hi" to a system instruction to force the Start Node execution
                                        // This prevents the model from just saying "Hi" back and missing the workflow start.
                                        await sonicClient.sendText("[SYSTEM: User Connected. Execute the Start Node of the workflow now.]");
                                        console.log('[Server] Initial greeting trigger sent to AI');
                                    } else if (session.lastUserTranscript) {
                                        console.log('[Server] User already spoke, skipping initial greeting (Smart Start active)');
                                    }
                                }, 1000); // Increased delay slightly to 1000ms to ensure stability
                            } else {
                                // CRITICAL: Clear any pending greeting timer if we switched TO bedrock_agent
                                if (session.initialGreetingTimer) {
                                    clearTimeout(session.initialGreetingTimer);
                                    session.initialGreetingTimer = null;
                                    console.log('[Server] Cleared pending initial greeting (switched to Agent Mode)');
                                }
                                console.log('[Server] Banking Bot mode - skipping initial AI greeting (agent will provide greeting)');
                            }
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
                                // Wait a moment for session to be fully established
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }

                            if (sonicClient.getSessionId()) {
                                await sonicClient.sendText(parsed.text);
                            } else {
                                console.error('[Server] Failed to start Nova Sonic session for text input');
                            }
                        }
                        return;
                    } else if (parsed.type === 'awsConfig') {
                        console.log('[Server] Received AWS Configuration update');
                        const { accessKeyId, secretAccessKey, region, agentCoreRuntimeArn, modelId } = parsed.config;
                        if (accessKeyId && secretAccessKey && region) {
                            sonicClient.updateCredentials(accessKeyId, secretAccessKey, region, agentCoreRuntimeArn, modelId);
                            if (agentCoreGatewayClient) {
                                agentCoreGatewayClient.updateCredentials(accessKeyId, secretAccessKey, region);
                            }

                            // Update Global Clients
                            console.log('[Server] Re-initializing global AWS clients with new credentials');
                            const newConfig: any = {
                                region: region,
                                credentials: {
                                    accessKeyId: accessKeyId,
                                    secretAccessKey: secretAccessKey
                                }
                            };

                            // Re-initialize clients
                            agentCoreClient = new BedrockAgentCoreClient(newConfig);
                            bedrockClient = new BedrockClient(newConfig);
                            bedrockAgentRuntimeClient = new BedrockAgentRuntimeClient(newConfig);

                            ws.send(JSON.stringify({ type: 'status', message: 'AWS Credentials Updated' }));
                        } else {
                            ws.send(JSON.stringify({ type: 'error', message: 'Invalid AWS Configuration' }));
                        }
                        return;
                    } else {
                        // Not a valid JSON message, treat as binary data
                        // Fall through to audio processing
                    }
                }
            }

            // Validate binary data for audio
            if (!Buffer.isBuffer(data)) {
                // If it was JSON, we already handled it. If it was invalid JSON, we ignore it.
                // But if it's NOT a buffer and NOT handled as JSON, we should probably return.
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
                    const VAD_THRESHOLD = 100; // Lowered significantly to detect quiet speech

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
                            console.log(`[Server] Starting transcription of ${fullAudio.length} bytes...`);

                            // Analyze audio quality
                            const rms = calculateRMS(fullAudio);
                            console.log(`[Server] Audio RMS level: ${rms} (threshold: 800)`);

                            // Lower the threshold for testing - the current threshold might be too high
                            if (rms < 5) {
                                console.log('[Server] Audio appears to be silent or very quiet - skipping transcription');
                                return;
                            }

                            console.log(`[Server] Audio passed RMS check (${rms}), proceeding with transcription...`);

                            console.log(`[Server] Calling transcription service with ${fullAudio.length} bytes...`);
                            const text = await session.transcribeClient.transcribe(fullAudio);
                            console.log(`[Server] Transcription result: "${text}" (length: ${text.length})`);

                            if (!text || text.length === 0) {
                                console.log('[Server] Transcription returned empty - this might be an audio format issue');
                                console.log(`[Server] Audio buffer info: ${fullAudio.length} bytes, RMS: ${rms}`);
                            }
                            if (text) {
                                let finalText = text;
                                try {
                                    finalText = formatUserTranscript(text);
                                } catch (e) {
                                    console.warn('[Server] Error formatting transcript:', e);
                                }

                                console.log(`[Server] User said (Formatted): "${finalText}"`);
                                ws.send(JSON.stringify({ type: 'transcript', role: 'user', text: finalText, isFinal: true }));
                                session.transcript.push({ role: 'user', text: finalText, timestamp: Date.now() });

                                // 4. Invoke Agent
                                try {
                                    console.log('[Server] Calling Agent...');
                                    const { completion: agentReply, trace } = await callBankAgent(
                                        finalText,
                                        session.sessionId,
                                        session.agentId,
                                        session.agentAliasId,
                                        {
                                            accessKeyId: session.awsAccessKeyId,
                                            secretAccessKey: session.awsSecretAccessKey,
                                            sessionToken: session.awsSessionToken,
                                            region: session.awsRegion
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
                                            sessionId: session.sessionId,
                                            transcript: text,
                                            agentReply,
                                            trace
                                        }
                                    }));

                                    ws.send(JSON.stringify({ type: 'transcript', role: 'assistant', text: agentReply, isFinal: true }));
                                    session.transcript.push({ role: 'assistant', text: agentReply, timestamp: Date.now() });

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

                                    // Ensure session is started and active
                                    if (!sonicClient.getSessionId()) {
                                        console.log('[Server] Starting Nova Sonic session for Banking Bot response...');
                                        await sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));
                                        // Wait a moment for session to be fully established
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                    }

                                    // Double-check session is active before sending text
                                    if (sonicClient.getSessionId()) {
                                        // CRITICAL FIX: Clean text before sending to Nova Sonic to prevent markdown hangs
                                        const cleanAgentReply = cleanTextForSonic(agentReply);
                                        console.log('[Server] Sending clean text to Sonic:', cleanAgentReply);

                                        await sonicClient.sendText(cleanAgentReply);
                                    } else {
                                        console.error('[Server] Nova Sonic session failed to start for Banking Bot response');
                                        ws.send(JSON.stringify({
                                            type: 'transcript',
                                            role: 'system',
                                            text: 'TTS Error: Could not start voice session',
                                            isFinal: true
                                        }));
                                    }

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
                            } else {
                                console.log('[Server] Transcription returned empty text - ignoring audio chunk');
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

        } catch (error: any) {
            console.error('[Server] Error processing message:', error);

            // Check for specific AWS Auth errors
            if (error.name === 'UnrecognizedClientException' || error.name === 'InvalidSignatureException' || (error.message && error.message.includes('security token'))) {
                ws.send(JSON.stringify({
                    type: 'error',
                    code: 'invalid_credentials',
                    message: 'Invalid AWS Credentials. Please check your settings.'
                }));
            } else {
                ws.send(JSON.stringify({ type: 'error', message: `Server error: ${error.message}` }));
            }
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

            // Save Chat History
            saveTranscript(session);

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
// --- Text Cleaning Helper for Nova Sonic ---
function cleanTextForSonic(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let clean = text;
    // Remove markdown formatting while preserving spaces
    // First, handle bold and italic (preserve the text, remove markers)
    clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');  // **text** -> text
    clean = clean.replace(/\*([^*]+)\*/g, '$1');      // *text* -> text
    clean = clean.replace(/_([^_]+)_/g, '$1');        // _text_ -> text
    // Remove remaining markdown (headers, code blocks)
    clean = clean.replace(/[#`]/g, '');
    // Collapse newlines
    clean = clean.replace(/\n{3,}/g, '\n\n');

    // Extract just the time information for cleaner speech if present
    const timeMatch = clean.match(/current time.*?is[:\s]+([^.\n]+)/i);
    if (timeMatch) {
        return `The current time is ${timeMatch[1].trim()}`;
    }

    return clean;
}

// --- User Transcript Formatting Helper ---
function formatUserTranscript(text: string): string {
    if (!text) return text;

    let formatted = text;

    // Simple textual number to digit mapping
    const numberMap: { [key: string]: string } = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
        'eleven': '11', 'twelve': '12', 'twenty': '20', 'thirty': '30',
        'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
        'eighty': '80', 'ninety': '90', 'double': 'double', 'triple': 'triple'
    };

    // Pre-processing: Split concatenated number words (e.g. "seveneight" -> "seven eight", "onetwo" -> "one two")
    // Use a specific regex built from number words
    const numKeys = Object.keys(numberMap).filter(k => k !== 'double' && k !== 'triple').join('|');
    // Regex matches instances where two number words are adjacent with NO space
    const concatRegex = new RegExp(`(${numKeys})(${numKeys})`, 'gi');

    // Apply multiple times to handle overlaps (e.g. onetwothree -> one two three)
    let prevText = '';
    while (formatted !== prevText) {
        prevText = formatted;
        formatted = formatted.replace(concatRegex, '$1 $2');
    }

    // Regex to capture "£word point word" pattern
    // e.g. "£three point fifty" -> "£3.50"
    formatted = formatted.replace(/£([a-z]+)\s+point\s+([a-z]+)/gi, (match, p1, p2) => {
        const whole = numberMap[p1.toLowerCase()];
        const fraction = numberMap[p2.toLowerCase()];

        if (whole && fraction) {
            // "point fifty" (50) vs "point five" (5)
            // If fraction is single digit like '5' (from 'five'), it might mean 0.5 or 0.50? 
            // Usually "point five" = .5, "point fifty" = .50
            return `£${whole}.${fraction}`;
        }
        return match;
    });

    // Handle "£word" (e.g. "£five")
    formatted = formatted.replace(/£([a-z]+)/gi, (match, p1) => {
        const num = numberMap[p1.toLowerCase()];
        return num ? `£${num}` : match;
    });

    // Handle "three pounds fifty" -> "£3.50"
    formatted = formatted.replace(/([a-z]+)\s+pounds?\s+([a-z]+)/gi, (match, p1, p2) => {
        const whole = numberMap[p1.toLowerCase()];
        const fraction = numberMap[p2.toLowerCase()];
        if (whole && fraction) {
            return `£${whole}.${fraction}`;
        }
        return match;
    });

    // Handle generic number sequences (e.g. "one two three four" -> "1234", "one, two" -> "12")
    const numberWords = Object.keys(numberMap).join('|');
    // Allow spaces, commas, dots, dashes as separators between number words
    const separatorRegex = /[\s,.-]+/;
    const sequenceRegex = new RegExp(`\\b(${numberWords})([\\s,.-]+(${numberWords}))+\\b`, 'gi');

    formatted = formatted.replace(sequenceRegex, (match) => {
        // Split but capture separators so we can ignore them
        const parts = match.split(/([\s,.-]+)/);
        let result = '';
        let pendingMultiplier = 1;
        let pendingTens = 0; // Track if we have a "ty" number awaiting a single digit

        for (const part of parts) {
            // Check if it is a separator - if so, IGNORE it (collapse to contiguous digits)
            if (separatorRegex.test(part)) {
                continue;
            }

            const lower = part.toLowerCase();
            if (lower === 'double') {
                pendingMultiplier = 2;
                continue;
            }
            if (lower === 'triple') {
                pendingMultiplier = 3;
                continue;
            }

            const digit = numberMap[lower];
            if (digit) {
                // Check if this is a "ty" number (20, 30, 40, etc.) that should combine with next digit
                const isTyNumber = ['20', '30', '40', '50', '60', '70', '80', '90'].includes(digit);
                const isSingleDigit = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(digit);

                // If we have a pending tens value and current is a single digit, combine them
                if (pendingTens > 0 && isSingleDigit) {
                    result += (pendingTens + parseInt(digit)).toString();
                    pendingTens = 0;
                    pendingMultiplier = 1;
                }
                // If this is a ty number, store it to potentially combine with next digit
                else if (isTyNumber) {
                    // First flush any pending tens that weren't combined
                    if (pendingTens > 0) {
                        result += pendingTens.toString();
                    }
                    pendingTens = parseInt(digit);
                    // Don't add to result yet, wait to see if next digit combines
                }
                // Regular case
                else {
                    // First flush any pending tens that weren't combined
                    if (pendingTens > 0) {
                        result += pendingTens.toString();
                        pendingTens = 0;
                    }

                    // Apply multiplier
                    let digits = '';
                    for (let i = 0; i < pendingMultiplier; i++) digits += digit;

                    result += digits;
                    pendingMultiplier = 1; // Reset
                }
            } else {
                // Flush pending tens if any non-number word appears
                if (pendingTens > 0) {
                    result += pendingTens.toString();
                    pendingTens = 0;
                }
                // Fallback (unlikely)
                result += part;
            }
        }

        // Flush any remaining pending tens at end of sequence
        if (pendingTens > 0) {
            result += pendingTens.toString();
        }

        return result;
    });

    return formatted;
}

// --- Workflow Injection Helper ---
function convertWorkflowToText(workflow: any): string {
    if (!workflow || !workflow.nodes || !Array.isArray(workflow.nodes)) return "";

    let text = "### WORKFLOW INSTRUCTIONS\n";
    text += "You must follow this strictly defined process flow. \n";
    text += "CRITICAL: The descriptions below are INSTRUCTIONS for your behavior/persona. DO NOT read them aloud to the user.\n\n";

    // 1. Map Nodes
    workflow.nodes.forEach((node: any) => {
        text += `STEP [${node.id}] (${node.type}):\n   INSTRUCTION: ${node.label || 'No instruction'}\n`;

        // Tool Config
        if (node.type === 'tool' && node.toolName) {
            text += `   -> ACTION: Call Tool "${node.toolName}"\n`;
        }

        // Transitions
        const edges = workflow.edges.filter((e: any) => e.from === node.id);
        if (edges.length > 0) {
            text += "   TRANSITIONS:\n";
            edges.forEach((edge: any) => {
                const condition = edge.label ? `IF "${edge.label}"` : "NEXT";
                text += `   - ${condition} -> GOTO [${edge.to}]\n`;
            });
        } else if (node.type === 'end') {
            text += "   -> PROCESS ENDS HERE.\n";
        }
        text += "\n";
    });

    return text;
}

async function handleSonicEvent(ws: WebSocket, event: SonicEvent, session: ClientSession) {
    // If interrupted or intercepting, drop audio packets
    if ((session.isInterrupted || session.isIntercepting) && event.type === 'audio') {
        return;
    }

    // Helper to check if tool is enabled - Moved to top scope for access in all handlers
    const isToolEnabled = (name: string) => {
        // Check server-side allowed list first
        if (session.allowedTools) {
            return session.allowedTools.includes(name);
        }
        // Fallback to session.tools (backward compatibility)
        if (!session.tools) return false;
        return session.tools.some(t => t.toolSpec?.name === name);
    };

    switch (event.type) {

        case 'contentStart':
            if (event.data.role === 'assistant') {
                console.log('[Server] Assistant Turn Started');
                // No buffering - audio flows immediately
            }
            break;

        case 'audio':
            // Forward audio data as binary WebSocket message
            if (event.data.audio) {
                // If we are interrupted, drop audio
                if (session.isInterrupted) return;

                const audioBuffer = Buffer.isBuffer(event.data.audio)
                    ? event.data.audio
                    : Buffer.from(event.data.audio);

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(audioBuffer);
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
            // Store user transcript for debug context
            const role = event.data.role || 'assistant';

            // CRITICAL FIX: Format user numbers (e.g. "one two three" -> "123")
            if (role === 'user' && event.data.transcript) {
                event.data.transcript = formatUserTranscript(event.data.transcript);
            }

            if (role === 'user') {
                session.lastUserTranscript = event.data.transcript;
                session.transcript.push({ role: 'user', text: event.data.transcript, timestamp: Date.now() });
            } else if (role === 'assistant' || role === 'model') {
                const stage = event.data.stage;
                const isSpeculative = stage === 'SPECULATIVE';

                if (event.data.isFinal || isSpeculative) {
                    const entry: any = {
                        role: 'assistant',
                        text: event.data.transcript,
                        timestamp: Date.now()
                    };

                    if (isSpeculative) {
                        entry.type = 'speculative';
                    } else if (event.data.isFinal) {
                        entry.type = 'final';
                    }

                    session.transcript.push(entry);
                }
            }

            // Send Debug Info for Raw Nova Mode - Show ALL updates for debugging
            if (ws.readyState === WebSocket.OPEN) {
                // If it's an assistant reply, send debug info with context
                if (role === 'assistant' || role === 'model') {
                    ws.send(JSON.stringify({
                        type: 'debugInfo',
                        data: {
                            sessionId: session.sessionId,
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

                // NATIVE-FIRST APPROACH: Prefer native Nova Sonic tools, use heuristic as fallback
                // Native tools are now working 100%, but keep heuristic for compatibility
                const hasJson = false; // Native tools are primary, heuristic disabled for now

                // Original heuristic detection (commented out for native testing):
                // const hasJson = (
                //     (!!text.match(/payments[_\s]*agent/i) && isToolEnabled('payments_agent')) ||
                //     (!!text.match(/"name":\s*"get[_\s]*server[_\s]*time"/i) && isToolEnabled('get_server_time')) ||
                //     (!!text.match(/get[_\s]*server[_\s]*time/i) && isToolEnabled('get_server_time'))
                // );



                console.log(`[DEBUG] Transcript received: "${text}"`);

                // CRITICAL FIX: Apply response parsing immediately for assistant responses
                let processedText = text;
                if (role === 'assistant') {
                    // First, remove internal duplication within the same response
                    processedText = removeInternalDuplication(text);
                    console.log(`[InternalDedup] Applied to text: "${processedText.substring(0, 50)}..."`);

                    // Then, apply cross-response deduplication if we have previous responses
                    if (session.recentAgentReplies && session.recentAgentReplies.length > 0) {
                        const previousResponses = session.recentAgentReplies.map(r => r.text);
                        const newContent = extractNewContent(processedText, previousResponses);

                        // Only use new content if it's substantial
                        if (newContent.length > 3 && newContent.trim().length > 0) {
                            processedText = newContent;
                            console.log(`[ResponseParser] Cross-response parsing applied: "${processedText.substring(0, 50)}..."`);
                        }
                    }
                }

                console.log(`[DEBUG] hasJson: ${hasJson}, Enabled Tools: ${JSON.stringify(session.tools?.map(t => t.toolSpec.name))}`);

                // VERBOSE DEBUGGING
                if (hasJson || isFinal) {
                    console.log(`[Server] Transcript Debug - Final: ${isFinal}, HasJSON: ${hasJson}, Text Preview: ${processedText.substring(0, 50)}...`);
                }

                // Check for COMPLETE JSON object even if not final
                // This allows eager execution while the model is still streaming silence or padding
                const hasCompleteJson = hasJson && processedText.includes('}') && processedText.indexOf('{') < processedText.lastIndexOf('}');

                if (hasCompleteJson || (hasJson && isFinal)) {
                    console.log('[Server] Detected Potential JSON Tool Call (Strategy: Eager/Final):', processedText);
                    try {
                        let jsonStr = "";

                        // PRIORITY 1: Check for "name": field (Nova's native format)
                        if (processedText.includes('"name":')) {
                            console.log('[Server] JSON using "name" field. Attempting recovery.');
                            const nameIndex = processedText.indexOf('"name":');

                            // Try to find the last brace after "name"
                            let lastBrace = processedText.lastIndexOf('}');
                            let extracted = "";

                            if (lastBrace !== -1 && lastBrace > nameIndex) {
                                // Complete JSON found
                                extracted = "{" + processedText.substring(nameIndex, lastBrace + 1) + "}";
                            } else {
                                // Incomplete JSON - try to reconstruct
                                console.log('[Server] Incomplete JSON detected, attempting reconstruction...');

                                // Extract from "name" to end of arguments field or end of processedText
                                const nameMatch = processedText.match(/"name":\s*"([^"]+)"/);
                                const argsMatch = processedText.match(/"arguments":\s*(\{[^}]*\}|\{\}|""|\s*)/);

                                if (nameMatch) {
                                    const toolName = nameMatch[1];
                                    let args = "{}";

                                    if (argsMatch && argsMatch[1]) {
                                        const argStr = argsMatch[1].trim();
                                        if (argStr.startsWith('{') && argStr.endsWith('}')) {
                                            args = argStr;
                                        } else if (argStr === '""' || argStr === '') {
                                            args = "{}";
                                        }
                                    }

                                    extracted = `{"name": "${toolName}", "arguments": ${args}}`;
                                    console.log('[Server] Reconstructed JSON:', extracted);
                                }
                            }

                            if (extracted) {
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

                            // Heuristic filler handling removed - Nova 2 Sonic handles filler natively
                            console.log('[Server] Repaired JSON Candidate:', jsonStr);

                            const toolCall = JSON.parse(jsonStr);
                            console.log('[Server] Parsed Tool Call:', toolCall);

                            if (toolCall.tool) {
                                let toolName = toolCall.tool.toLowerCase();
                                if (toolName.includes('getservertime') || toolName.includes('get_server_time')) {
                                    toolName = 'get_server_time';
                                }

                                if (toolName === 'get_server_time') {
                                    console.log(`[Server] Heuristic detected tool: ${toolName} - checking if native handler processed it...`);

                                    const toolDef = loadTools().find(t => t.toolSpec.name === toolName);
                                    let agentPayload = {};

                                    if (toolDef && toolDef.agentPrompt) {
                                        let promptToUse = toolDef.agentPrompt;

                                        // Check if agentPrompt is a filename (ends with .txt)
                                        if (promptToUse.endsWith('.txt')) {
                                            promptToUse = loadPrompt(promptToUse);
                                        }

                                        promptToUse = promptToUse.replace('{{USER_LOCATION}}', session.userLocation || "Unknown Location");
                                        promptToUse = promptToUse.replace('{{USER_TIMEZONE}}', session.userTimezone || "UTC");
                                        console.log(`[Server] Using configured agentPrompt for ${toolName}`);
                                        agentPayload = { prompt: promptToUse };
                                    }

                                    const result = await callAgentCore(session, toolName, agentPayload);
                                    console.log('[Server] AgentCore Result (Heuristic Fallback):', result);

                                    // Reset intercepting flag to allow audio again
                                    session.isIntercepting = false;

                                    // Send clean result
                                    let cleanData = result.data || result;

                                    // Handle object results by converting to string first
                                    if (typeof cleanData === 'object') {
                                        // Check if it's an error object
                                        if (cleanData.status === 'error') {
                                            console.log('[Server] AgentCore returned error, skipping UI display:', cleanData.message);
                                            return; // Don't show error to user, let it retry
                                        }
                                        cleanData = JSON.stringify(cleanData);
                                    }

                                    if (typeof cleanData === 'string') {
                                        // Remove markdown while preserving spaces  
                                        cleanData = cleanData.replace(/\*\*([^*]+)\*\*/g, '$1');  // **text** -> text
                                        cleanData = cleanData.replace(/\*([^*]+)\*/g, '$1');      // *text* -> text
                                        const timeMatch = cleanData.match(/time.*?is[:\s]+([^.\n]+)/i);
                                        if (timeMatch) {
                                            cleanData = timeMatch[1].trim();
                                        }
                                    }

                                    const systemInjection = `The current time is ${cleanData}`;
                                    if (session.sonicClient && session.sonicClient.getSessionId()) {
                                        console.log('[Server] Injecting clean time result:', systemInjection);
                                        await session.sonicClient.sendText(systemInjection);
                                    } else {
                                        console.log('[Server] Skipping time result injection - Nova Sonic session not active');
                                    }

                                    // CRITICAL: Also send the time result to the UI so user can see it
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({
                                            type: 'transcript',
                                            role: 'assistant',
                                            text: systemInjection,
                                            isFinal: true
                                        }));
                                    }
                                } else if (toolCall.parameters) {
                                    // Execute AgentCore tools
                                    console.log(`[Server] Executing intercepted tool call: ${toolCall.tool}`);
                                    if (session.sonicClient && session.sonicClient.getSessionId()) {
                                        await session.sonicClient.sendText("Processing your request...");
                                    }

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
                    // --- HEURISTIC INTERCEPTOR (Updated for AgentCore Gateway) ---
                    // Matches: XML hallucinations <tool_ call...> ONLY.
                    // NOTE: get_server_time now handled via AgentCore Gateway like other tools
                    if (displayText.includes('<tool') && event.data.isFinal) {
                        console.log('[Server] Heuristic Interceptor: Detected XML tool tag. Tools now handled via native tool use events and AgentCore Gateway.');

                        // Prevent original tool text from being sent to frontend/speech
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

                    // CRITICAL FIX: Apply response parsing to displayText for assistant responses
                    if (role === 'assistant') {
                        // Store the original response before any processing for cross-response comparison
                        const originalDisplayText = displayText;

                        // First, remove internal duplication within the same response
                        displayText = removeInternalDuplication(displayText);
                        console.log(`[InternalDedup] Applied to displayText: "${displayText.substring(0, 50)}..."`);

                        // Then apply cross-response deduplication if we have previous responses
                        if (session.recentAgentReplies && session.recentAgentReplies.length > 0) {
                            const previousResponses = session.recentAgentReplies.map(r => r.originalText || r.text);
                            const newContent = extractNewContent(originalDisplayText, previousResponses);

                            // Only use new content if it's substantial
                            if (newContent.length > 3 && newContent.trim().length > 0) {
                                displayText = newContent;
                                console.log(`[ResponseParser] Applied to displayText: "${displayText.substring(0, 50)}..."`);
                            }
                        }
                    }

                    // Handle streaming transcripts
                    if (event.data.isStreaming) {
                        // Apply deduplication to streaming transcripts too
                        const now = Date.now();
                        let isDuplicateStreaming = false;

                        if (session.recentAgentReplies) {
                            for (const recentMsg of session.recentAgentReplies) {
                                if (recentMsg.text === displayText ||
                                    areSimilarMessages(recentMsg.text, displayText)) {
                                    isDuplicateStreaming = true;
                                    break;
                                }
                            }
                        }

                        if (!isDuplicateStreaming) {
                            // Send streaming updates to show text appearing in real-time
                            ws.send(JSON.stringify({
                                type: 'transcript',
                                role: role,
                                text: displayText,
                                isFinal: false,
                                isStreaming: true
                            }));
                            console.log(`[Server] Sent streaming transcript: "${displayText.substring(0, 50)}..."`);
                        } else {
                            console.log(`[Dedup] SKIPPED streaming transcript (duplicate): "${displayText.substring(0, 50)}..."`);
                        }
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
                        // Enhanced deduplication: Check against recent messages (not just the last one)
                        const now = Date.now();

                        console.log(`[Dedup] Processing message: "${displayText.substring(0, 50)}..."`);
                        console.log(`[Dedup] Recent messages count: ${session.recentAgentReplies?.length || 0}`);

                        // Clean up old messages (older than 15 seconds)
                        if (session.recentAgentReplies) {
                            session.recentAgentReplies = session.recentAgentReplies.filter(msg =>
                                (now - msg.time) < 15000
                            );
                        }

                        // Check against all recent messages
                        let isDuplicateOrSimilar = false;
                        let skipReason = '';

                        if (session.recentAgentReplies) {
                            for (const recentMsg of session.recentAgentReplies) {
                                // Exact duplicate
                                if (recentMsg.text === displayText) {
                                    isDuplicateOrSimilar = true;
                                    skipReason = 'exact duplicate';
                                    break;
                                }

                                // Shorter version
                                if (displayText.length <= recentMsg.text.length &&
                                    recentMsg.text.startsWith(displayText)) {
                                    isDuplicateOrSimilar = true;
                                    skipReason = 'shorter version';
                                    break;
                                }

                                // Overlapping content
                                if (recentMsg.text.includes(displayText.trim()) &&
                                    displayText.trim().length > 20) {
                                    isDuplicateOrSimilar = true;
                                    skipReason = 'overlapping content';
                                    break;
                                }

                                // Similar content - TEMPORARILY DISABLED FOR DEBUGGING
                                // if (areSimilarMessages(recentMsg.text, displayText)) {
                                //     isDuplicateOrSimilar = true;
                                //     skipReason = 'similar content';
                                //     break;
                                // }
                            }
                        }

                        if (!isDuplicateOrSimilar) {
                            // CRITICAL FIX: Extract new content from accumulated Nova Sonic responses
                            let finalText = displayText;
                            if (role === 'assistant' && session.recentAgentReplies && session.recentAgentReplies.length > 0) {
                                const previousResponses = session.recentAgentReplies.map(r => r.text);
                                const newContent = extractNewContent(displayText, previousResponses);

                                // Only use new content if it's substantial (not just punctuation/whitespace)
                                if (newContent.length > 3 && newContent.trim().length > 0) {
                                    finalText = newContent;
                                    console.log(`[ResponseParser] Using extracted content: "${finalText.substring(0, 50)}..."`);
                                } else {
                                    console.log(`[ResponseParser] New content too short, using full response`);
                                }
                            }

                            ws.send(JSON.stringify({
                                type: 'transcript',
                                role: role,
                                text: finalText,
                                isFinal: true,
                                isStreaming: false
                            }));

                            // Track message for deduplication (store original full response)
                            if (role === 'assistant') {
                                session.lastAgentReply = displayText; // Store full response for context
                                session.lastAgentReplyTime = now;

                                // Add to recent messages list
                                if (!session.recentAgentReplies) {
                                    session.recentAgentReplies = [];
                                }
                                session.recentAgentReplies.push({
                                    text: finalText, // Store processed response
                                    originalText: displayText, // Store original response for cross-response comparison
                                    time: now
                                });
                            }
                            console.log(`[Server] Sent final transcript: "${finalText.substring(0, 50)}..."`);
                        } else {
                            console.log(`[Dedup] SKIPPED transcript (${skipReason}): "${displayText.substring(0, 50)}..."`);
                        }
                    }
                }
            }
            break;

        case 'toolUse': {
            // Native AWS Bedrock Tool Use Event
            // PRODUCTION: Native Nova 2 Sonic Tool Use Detected
            const toolStartTime = Date.now();
            console.log(`[DEBUG] ===== TOOL USE CASE HANDLER CALLED AT ${new Date().toISOString()} =====`);
            logWithTimestamp('[Server]', `🔧 NATIVE TOOL USE: ${event.data.toolName || event.data.name} (ID: ${event.data.toolUseId})`);
            console.log('[Server] 🔧 Native Tool Use Event:', JSON.stringify(event.data, null, 2));
            const toolUse = event.data;
            // Validate tool use structure
            const actualToolName = toolUse.toolName || toolUse.name;
            console.log(`[Server] Processing native tool call: ${actualToolName}`);
            console.log(`[DEBUG] Tool use validation:`);
            console.log(`[DEBUG] - toolUse exists:`, !!toolUse);
            console.log(`[DEBUG] - has name/toolName:`, !!(toolUse.name || toolUse.toolName));
            console.log(`[DEBUG] - has input/content:`, !!(toolUse.input !== undefined || toolUse.content !== undefined));
            console.log(`[DEBUG] - toolUse.input:`, toolUse.input);
            console.log(`[DEBUG] - toolUse.content:`, toolUse.content);

            if (toolUse && (toolUse.name || toolUse.toolName) && (toolUse.input !== undefined || toolUse.content !== undefined)) {

                // CRITICAL FIX: Graceful handling of Disabled Tools
                // If a user asks for a tool that is unchecked in the UI, we must NOT fail silently.
                // We send a tool result instructing the model to apologize.
                if (!isToolEnabled(actualToolName)) {
                    console.log(`[Server] 🛑 Blocked execution of DISABLED tool: ${actualToolName}`);

                    if (session.sonicClient && session.sonicClient.getSessionId()) {
                        // Send a "successful" tool result but with content that tells the model it failed/was denied.
                        // This is better than an error which might cause a crash or generic error voice.
                        // effectively "Grounding" the refusal.
                        await session.sonicClient.sendToolResult(
                            toolUse.toolUseId,
                            {
                                text: `[SYSTEM] Tool execution denied: The tool '${actualToolName}' is currently disabled or not available. User's request cannot be fulfilled. You MUST reply exactly with: "I'm sorry, but that request cannot be fulfilled at the moment. Is there anything else I can help with today?"`
                            },
                            false // Not an API error, just a logical refusal
                        );
                        logWithTimestamp('[Server]', `Sent disabled tool rejection to Nova Sonic for: ${actualToolName}`);
                    }
                    return;
                }

                // Execute the tool call against AWS AgentCore
                console.log(`[Server] Executing native tool call: ${actualToolName}`);

                // Notify UI of tool usage (Visual Feedback)
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'debugInfo',
                        data: {
                            toolUse: {
                                name: actualToolName,
                                toolName: actualToolName,
                                input: toolUse.content || toolUse.input,
                                toolUseId: toolUse.toolUseId
                            }
                        }
                    }));
                }

                // Add Tool Use to Transcript History
                session.transcript.push({
                    role: 'tool_use',
                    text: `Tool Invoked: ${actualToolName}`,
                    timestamp: Date.now(),
                    // @ts-ignore - Adding custom fields for history
                    toolName: actualToolName,
                    toolInput: toolUse.content || toolUse.input
                });

                try {
                    let result: any;

                    // Check if this is an AgentCore Gateway tool
                    // DYNAMIC TOOL ROUTING: Check if tool has gatewayTarget
                    const toolDef = loadTools().find(t => t.toolSpec.name === actualToolName);
                    const isAgentCoreGatewayTool = (toolDef && toolDef.gatewayTarget) ||
                        // Legacy Fallback checks
                        actualToolName === 'agentcore_balance' ||
                        actualToolName === 'agentcore_transactions' ||
                        actualToolName === 'get_account_transactions' ||
                        actualToolName === 'perform_idv_check' ||
                        actualToolName === 'lookup_merchant_alias' ||
                        actualToolName === 'create_dispute_case' ||
                        actualToolName === 'manage_recent_interactions' ||
                        actualToolName === 'update_dispute_case' ||
                        actualToolName === 'get_server_time';

                    if (isAgentCoreGatewayTool && agentCoreGatewayClient) {

                        console.log(`[Server] Executing AgentCore Gateway tool: ${actualToolName}`);

                        // Extract parameters from tool use
                        const toolParams = toolUse.content ? JSON.parse(toolUse.content) : toolUse.input;
                        console.log(`[Server] Tool parameters:`, toolParams);

                        try {
                            const gatewayTarget = toolDef ? toolDef.gatewayTarget : undefined;
                            const gatewayResult = await agentCoreGatewayClient.callTool(actualToolName, toolParams, gatewayTarget);
                            result = {
                                status: "success",
                                data: gatewayResult
                            };
                            console.log(`[Server] AgentCore Gateway result: ${gatewayResult}`);
                        } catch (error: any) {
                            console.error(`[Server] AgentCore Gateway error:`, error);
                            result = {
                                status: "error",
                                message: `Failed to execute ${actualToolName}: ${error.message}`
                            };
                        }
                    } else {
                        // Original AgentCore logic for other tools
                        console.log(`[Server] Executing standard AgentCore tool: ${actualToolName}`);

                        // DYNAMIC PROMPT: Check if this tool has a specific 'agentPrompt' defined
                        const toolDef = loadTools().find(t => t.toolSpec.name === actualToolName);

                        // Use content field (Nova Sonic format) or input field (fallback)
                        let agentPayload = toolUse.content ? JSON.parse(toolUse.content) : toolUse.input;

                        if (toolDef && toolDef.agentPrompt) {
                            let promptToUse = toolDef.agentPrompt;

                            // Check if agentPrompt is a filename (ends with .txt)
                            if (promptToUse.endsWith('.txt')) {
                                promptToUse = loadPrompt(promptToUse);
                            }

                            // DYNAMIC INJECTION
                            promptToUse = promptToUse.replace('{{USER_LOCATION}}', session.userLocation || "Unknown Location");
                            promptToUse = promptToUse.replace('{{USER_TIMEZONE}}', session.userTimezone || "UTC");

                            console.log(`[Server] Using configured agentPrompt for ${toolUse.name}`);
                            agentPayload = { prompt: promptToUse };
                        }

                        // Call AgentCore using the existing client
                        result = await callAgentCore(
                            session,
                            actualToolName,
                            agentPayload
                        );
                    }

                    console.log('[Server] AgentCore Result (Native):', result);

                    // HYBRID APPROACH: Try native tool result processing, fallback to direct delivery
                    const toolResult = result.status === "success" ? result.data : result.message;
                    console.log(`[Server] Processing tool result: "${toolResult.substring(0, 100)}..."`);
                    console.log(`[Server] Delivering tool result via Nova Sonic native response`);
                    console.log(`[Server] Full Tool Result Length: ${toolResult.length}`);
                    console.log(`[Server] Tool Result Preview: "${toolResult.substring(0, 200)}..."`);

                    // Send tool result back to Nova Sonic for natural speech synthesis
                    try {
                        console.log('[Server] Sending tool result back to Nova Sonic for natural speech...');

                        // Clean up the tool result for better speech
                        let cleanResult = toolResult;
                        if (typeof cleanResult === 'string') {
                            cleanResult = cleanTextForSonic(cleanResult);
                        }

                        console.log(`[Server] Sending cleaned result to Nova Sonic: "${cleanResult}"`);

                        // Send the tool result back to Nova Sonic using the native tool result mechanism
                        if (session.sonicClient && session.sonicClient.getSessionId()) {
                            // Send RAW STRING to avoid JSON nesting confusion
                            await session.sonicClient.sendToolResult(
                                toolUse.toolUseId,
                                cleanResult,
                                false
                            );
                            const toolEndTime = Date.now();
                            const toolDuration = toolEndTime - toolStartTime;
                            logWithTimestamp('[Server]', `Tool result sent to Nova Sonic: ${actualToolName} (Duration: ${toolDuration}ms)`);

                        } else {
                            console.log('[Server] Nova Sonic session not active - attempting to restart...');
                            // Try to restart the session and send the result
                            try {
                                await session.sonicClient.startSession((event: SonicEvent) => handleSonicEvent(ws, event, session));
                                await new Promise(resolve => setTimeout(resolve, 500)); // Wait for session to establish
                                if (session.sonicClient.getSessionId()) {
                                    await session.sonicClient.sendToolResult(
                                        toolUse.toolUseId,
                                        cleanResult,
                                        false
                                    );
                                    const toolEndTime = Date.now();
                                    const toolDuration = toolEndTime - toolStartTime;
                                    logWithTimestamp('[Server]', `Tool result sent to Nova Sonic after restart: ${actualToolName} (Duration: ${toolDuration}ms)`);
                                }
                            } catch (restartError) {
                                console.log('[Server] Failed to restart Nova Sonic session:', restartError);
                            }
                        }
                    } catch (ttsError) {
                        console.log('[Server] Failed to send tool result to Nova Sonic:', ttsError);
                    }

                    // 3. Don't send anything back to main Nova Sonic session (prevents retry loops)

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

                } catch (error) {
                    console.error('[Server] Tool execution failed:', error);
                    if (session.sonicClient && session.sonicClient.getSessionId()) {
                        await session.sonicClient.sendToolResult(
                            toolUse.toolUseId,
                            { text: "Error executing tool." },
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
            break;

        case 'interactionTurnEnd':
            // Reset flow state for next interaction
            session.hasFlowedAudio = false;
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
