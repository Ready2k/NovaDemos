
import { WebSocket } from 'ws';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { SonicClient, SonicEvent } from '../sonic-client';
import { TranscribeClientWrapper } from '../transcribe-client';

import { AgentService } from './agent-service';
import { PromptService } from './prompt-service';
import { ToolService } from './tool-service';
import { ClientSession, Tool } from '../types';
import {
    cleanTextForSonic,
    cleanAssistantDisplay,
    formatUserTranscript,
    convertWorkflowToText,
    removeInternalDuplication,
    extractNewContent,
    calculateStringSimilarity,
    calculateRMS
} from '../utils/server-utils';

// Determine if running in Docker or locally
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const HISTORY_DIR = path.join(BASE_DIR, 'history');
const FILLER_PHRASES = [
    "Hmm...", "Erm...", "Ok...", "Let me see...", "Just waiting for the system...", "One moment...", "Bear with me..."
];

export class SonicService {
    public session: ClientSession;
    private toolService: ToolService;
    private promptService: PromptService;
    private agentService: AgentService;


    // Helper map for pending feedback (if needed, or moved to DB later)
    private static pendingFeedback = new Map<string, any>();

    constructor(
        ws: WebSocket,
        agentService: AgentService,
        promptService: PromptService,
        toolService: ToolService,
        sessionId?: string
    ) {
        this.agentService = agentService;
        this.promptService = promptService;
        this.toolService = toolService;


        const effectiveSessionId = sessionId || crypto.randomUUID();
        const sonicClient = new SonicClient();
        const transcribeClient = new TranscribeClientWrapper(process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1');

        this.session = {
            ws,
            sonicClient,
            sessionId: effectiveSessionId,
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
            activeWorkflowStepId: 'start',
            currentWorkflowId: 'Banking (General)',
            workflowChecks: {},
            transcript: []
        };

        // Ensure History Dir Exists
        if (!fs.existsSync(HISTORY_DIR)) {
            fs.mkdirSync(HISTORY_DIR, { recursive: true });
        }
    }

    async handleSonicEvent(event: SonicEvent) {
        const { ws, sessionId } = this.session;

        // If interrupted or intercepting, drop audio packets
        if ((this.session.isInterrupted || this.session.isIntercepting) && event.type === 'audio') {
            return;
        }

        switch (event.type) {
            case 'metadata':
                console.log('[SonicService] Forwarding metadata event to client:', JSON.stringify(event.data));
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'metadata', data: event.data }));
                }
                break;

            case 'session_start':
                console.log('[SonicService] Forwarding session_start event to client:', JSON.stringify(event.data));
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'session_start',
                        sessionId: event.data.sessionId,
                        timestamp: new Date().toISOString()
                    }));
                }
                break;

            case 'workflow_update':
                console.log(`[SonicService] Forwarding workflow update: ${event.data.currentStep}`);
                {
                    const stepId = event.data.currentStep;
                    if (stepId && stepId !== this.session.activeWorkflowStepId) {
                        this.session.activeWorkflowStepId = stepId;
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'workflow_update', currentStep: stepId }));
                        }
                        // PERSISTENCE: Save to transcript
                        this.session.transcript.push({
                            role: 'system',
                            type: 'workflow_step',
                            text: `Active Workflow Step: ${stepId}`,
                            timestamp: Date.now(),
                            metadata: { stepId }
                        });
                    }
                }
                break;

            case 'contentStart':
                if (event.data.role === 'assistant') {
                    console.log('[SonicService] Assistant Turn Started');
                }
                break;

            case 'audio':
                if (event.data.audio) {
                    if (this.session.isInterrupted) return;
                    const audioBuffer = Buffer.isBuffer(event.data.audio) ? event.data.audio : Buffer.from(event.data.audio);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(audioBuffer);
                    }
                }
                break;

            case 'transcript':
                await this.handleTranscript(event);
                break;

            case 'toolUse':
                await this.handleToolUse(event);
                break;

            case 'metadata':
                if (ws.readyState === WebSocket.OPEN && event.data.metrics) {
                    ws.send(JSON.stringify({ type: 'debugInfo', data: { metrics: event.data.metrics } }));
                }
                break;

            case 'interruption':
                if (ws.readyState === WebSocket.OPEN) {
                    // CRITICAL FIX: Suppress interruptions if we are in the middle of a tool call
                    if (this.session.toolsCalledThisTurn && this.session.toolsCalledThisTurn.length > 0) {
                        console.log(`[SonicService] 🛡️ ALERT: Suppressing Interruption Signal during Tool Execution (${this.session.toolsCalledThisTurn.join(', ')})`);
                        return;
                    }
                    ws.send(JSON.stringify({ type: 'interruption' }));
                    console.log('[SonicService] Sent interruption signal to client');
                }
                break;

            case 'error':
                console.error('[SonicService] Nova Sonic error:', event.data);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Nova Sonic streaming error', details: event.data }));
                }
                break;

            case 'usageEvent':
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'usage', data: event.data }));
                }
                break;

            case 'interactionTurnEnd':
                this.session.hasFlowedAudio = false;
                this.session.toolsCalledThisTurn = [];
                break;
        }
    }

    private async handleTranscript(event: SonicEvent) {
        const { ws } = this.session;

        // Extract dialect detection from transcript if present
        let processedText = event.data.transcript || "";
        const dialectMatch = processedText.match(/\[DIALECT:\s*([a-z]{2}-[A-Z]{2})\|(\d*\.?\d+)\]/i);

        if (dialectMatch) {
            const detectedLocale = dialectMatch[1];
            const confidence = parseFloat(dialectMatch[2]);
            console.log(`[DialectDetection] Detected: ${detectedLocale} (confidence: ${confidence.toFixed(2)})`);

            // Send metadata to frontend
            if (ws.readyState === WebSocket.OPEN) {
                const metadataPayload = {
                    type: 'metadata',
                    data: { detectedLanguage: detectedLocale, languageConfidence: confidence }
                };
                ws.send(JSON.stringify(metadataPayload));
                console.log(`[DialectDetection] Sent metadata to frontend:`, JSON.stringify(metadataPayload));
            }

            // Remove dialect tag from text
            processedText = processedText.replace(/\[DIALECT:\s*[a-z]{2}-[A-Z]{2}\|\d*\.?\d+\]/gi, '').trim();
            event.data.transcript = processedText;
        }

        if (this.session.brainMode === 'bedrock_agent') {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'ttsOutput',
                    text: event.data.transcript,
                    isFinal: event.data.isFinal
                }));
                if (event.data.isFinal && this.session.sonicClient) {
                    ws.send(JSON.stringify({
                        type: 'token_usage',
                        inputTokens: this.session.sonicClient.getSessionInputTokens(),
                        outputTokens: this.session.sonicClient.getSessionOutputTokens()
                    }));
                }
            }
            return;
        }

        if (this.session.brainMode === 'langgraph') {
            if (event.data.isFinal) {
                const input = event.data.transcript || "";
                // Default to 'banking-master' if no ID set
                const wfId = this.session.currentWorkflowId || 'banking-master';
                const workflowId = this.session.activeWorkflowStepId === 'start' ? wfId.toLowerCase() : wfId.toLowerCase();

                console.log(`[SonicService] 🧠 Invoking LangGraph: ${workflowId} with input: "${input}"`);

                // Stream events
                const stream = this.agentService.runGraph(this.session, workflowId, input);

                let finalOutput = "";

                for await (const graphEvent of stream) {
                    console.log('[SonicService] Graph Event:', JSON.stringify(graphEvent));

                    // 1. Send Debug/Viz Info to Frontend
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'graph_event',
                            data: graphEvent
                        }));
                    }

                    // 2. Process specific events
                    const eventObj = graphEvent as any;
                    const nodeName = Object.keys(eventObj)[0];
                    const nodeData = eventObj[nodeName];

                    if (nodeData && nodeData.lastOutcome && typeof nodeData.lastOutcome === 'string') {
                        // Simple heuristic: if outcome looks like speech, speak it
                        // For now, let's assume 'assistant' node output is speech
                        // In our banking workflow, we don't have explicit 'assistant' nodes yet, just 'end' or 'decision' outcomes.
                    }
                }

                // For now, simulate a response acknowledging the graph ran
                finalOutput = "I have processed that step in the workflow.";
                if (this.session.sonicClient) {
                    await this.session.sonicClient.sendText(finalOutput);
                }
            }
            return;
        }

        const role = event.data.role || 'assistant';
        if (role === 'user' && event.data.transcript) {
            event.data.transcript = formatUserTranscript(event.data.transcript);
        }

        if (role === 'user') {
            // NEW TURN START: Reset per-turn state
            this.session.toolsCalledThisTurn = [];

            // FILLER SYSTEM: Ignore hidden instructions
            if (event.data.transcript && event.data.transcript.startsWith('[HIDDEN]')) {
                return;
            }

            this.session.lastUserTranscript = event.data.transcript;
            this.session.transcript.push({ role: 'user', text: event.data.transcript, timestamp: Date.now() });

            // Debug Info
            if (ws.readyState === WebSocket.OPEN) {
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

        } else if (role === 'assistant' || role === 'model') {
            // FILLER SYSTEM: Filter out assistant filler phrases
            const text = event.data.transcript || "";
            if (text.length < 50) {
                const cleanText = text.replace(/[.,!?:;]/g, '').trim().toLowerCase();
                const isFiller = FILLER_PHRASES.some(phrase => {
                    const cleanFiller = phrase.replace(/[.,!?:;]/g, '').trim().toLowerCase();
                    return cleanText === cleanFiller || cleanText.includes(cleanFiller);
                });
                if (isFiller) {
                    console.log(`[SonicService] 🙈 Hiding assistant filler from transcript: "${text}"`);
                    return;
                }
            }

            if (event.data.isFinal || event.data.stage === 'SPECULATIVE') {
                const rawText = event.data.transcript || "";
                let sentiment: number | undefined;
                const sentimentMatch = rawText.match(/\[SENTIMENT:\s*(-?\d*\.?\d+)\]/i);
                if (sentimentMatch) {
                    sentiment = parseFloat(sentimentMatch[1]);
                }

                const entry: any = {
                    role: 'assistant',
                    text: rawText,
                    timestamp: Date.now(),
                    sentiment: sentiment,
                    type: event.data.stage === 'SPECULATIVE' ? 'speculative' : (event.data.isFinal ? 'final' : undefined)
                };
                this.session.transcript.push(entry);

                // Debug Info
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'debugInfo',
                        data: {
                            sessionId: this.session.sessionId,
                            transcript: this.session.lastUserTranscript || '(No user transcript)',
                            agentReply: event.data.transcript,
                            isFinal: event.data.isFinal,
                            stage: event.data.isFinal ? 'FINAL' : 'STREAMING',
                            trace: []
                        }
                    }));
                }
            }
            // Send token usage
            if (event.data.isFinal && this.session.sonicClient && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'token_usage',
                    inputTokens: this.session.sonicClient.getSessionInputTokens(),
                    outputTokens: this.session.sonicClient.getSessionOutputTokens()
                }));
            }
        }


        // --- Transcript Formatting & Deduplication for UI ---
        let displayText = event.data.transcript || "";

        // Remove JSON markers
        const jsonMarkerMatch = displayText.match(/(`*json|\[?payments[_\s]*agent)/i);
        if (jsonMarkerMatch && jsonMarkerMatch.index !== undefined) {
            displayText = displayText.substring(0, jsonMarkerMatch.index).trim();
            displayText = displayText.replace(/`+$/, '').trim();
            displayText = displayText.replace(/\[$/, '').trim();
        }

        if (displayText) {
            if (role === 'assistant') {
                displayText = cleanAssistantDisplay(displayText);
            } else {
                displayText = displayText.replace(/\[STEP:\s*[^\]]+\]\s*/gi, '');
                displayText = displayText.replace(/\[DIALECT:\s*[a-z]{2}-[A-Z]{2}\|\d*\.?\d+\]\s*/gi, '').trim();
            }

            // Heuristic Interceptor for XML
            if (displayText.includes('<tool') && event.data.isFinal) {
                displayText = '';
            }

            if (displayText.includes('"interrupted"') || displayText.includes('interrupted')) return;
            if (displayText.trim().length === 0) return;

            // Deduplication Logic
            if (role === 'assistant') {
                const originalDisplayText = displayText;
                displayText = removeInternalDuplication(displayText);

                if (this.session.recentAgentReplies && this.session.recentAgentReplies.length > 0) {
                    const previousResponses = this.session.recentAgentReplies.map(r => r.originalText || r.text);
                    const newContent = extractNewContent(originalDisplayText, previousResponses);
                    if (newContent.length > 3 && newContent.trim().length > 0) {
                        displayText = newContent;
                    }
                }
            }

            if (ws.readyState === WebSocket.OPEN) {
                if (event.data.isStreaming && role !== 'user') {
                    // Check streaming duplicate
                    let isDuplicateStreaming = false;
                    if (this.session.recentAgentReplies) {
                        for (const recent of this.session.recentAgentReplies) {
                            if (recent.text === displayText || calculateStringSimilarity(recent.text, displayText) > 0.9) {
                                isDuplicateStreaming = true; break;
                            }
                        }
                    }
                    if (!isDuplicateStreaming) {
                        ws.send(JSON.stringify({
                            type: 'transcript', role, text: displayText, isFinal: false, isStreaming: true
                        }));
                    }
                } else if (event.data.isCancelled) {
                    ws.send(JSON.stringify({ type: 'transcriptCancelled', role }));
                } else if (event.data.isFinal) {
                    // Final Transcript Deduplication
                    const now = Date.now();
                    // Clean up old messages
                    if (this.session.recentAgentReplies) {
                        this.session.recentAgentReplies = this.session.recentAgentReplies.filter(msg => (now - msg.time) < 15000);
                    }

                    let isDuplicate = false;
                    if (this.session.recentAgentReplies) {
                        for (const recent of this.session.recentAgentReplies) {
                            if (recent.text === displayText && (now - recent.time) < 3000) { isDuplicate = true; break; }
                            if (displayText.length <= recent.text.length && recent.text.startsWith(displayText) && (now - recent.time) < 3000) { isDuplicate = true; break; }
                            if (recent.text.includes(displayText.trim()) && displayText.trim().length > 20) { isDuplicate = true; break; }
                        }
                    }

                    if (!isDuplicate) {
                        // Extract New Content
                        let finalText = displayText;
                        if (role === 'assistant' && this.session.recentAgentReplies && this.session.recentAgentReplies.length > 0) {
                            const previousResponses = this.session.recentAgentReplies.map(r => r.text);
                            const newContent = extractNewContent(displayText, previousResponses);
                            if (newContent.length > 3 && newContent.trim().length > 0) finalText = newContent;
                        }

                        let messageSentiment: number | undefined;
                        const sentimentMatch = displayText.match(/\[SENTIMENT:\s*(-?\d*\.?\d+)\]/i);
                        if (sentimentMatch) messageSentiment = parseFloat(sentimentMatch[1]);

                        ws.send(JSON.stringify({
                            type: 'transcript', role, text: finalText, isFinal: true, isStreaming: false, sentiment: messageSentiment
                        }));

                        if (role === 'assistant') {
                            this.session.lastAgentReply = displayText;
                            this.session.lastAgentReplyTime = now;
                            if (!this.session.recentAgentReplies) this.session.recentAgentReplies = [];
                            this.session.recentAgentReplies.push({ text: finalText, originalText: displayText, time: now });
                        }
                    }
                }
            }
        }
    }

    private async handleToolUse(event: SonicEvent) {
        const { ws } = this.session;
        const toolUse = event.data;
        const actualToolName = toolUse.toolName || toolUse.name;

        const toolStartTime = Date.now();
        console.log(`[SonicService] 🔧 TOOL USE: ${actualToolName} (ID: ${toolUse.toolUseId})`);

        if (!this.session.processedToolIds) this.session.processedToolIds = new Set();
        if (toolUse.toolUseId && this.session.processedToolIds.has(toolUse.toolUseId)) {
            console.log(`[SonicService] ♻️ SKIPPING DUPLICATE TOOL EXECUTION: ${actualToolName}`);
            return;
        }

        // Aggressive Debounce
        if (this.session.toolsCalledThisTurn && this.session.toolsCalledThisTurn.includes(actualToolName)) {
            console.log(`[SonicService] 🛡️ AGGRESSIVE DEBOUNCE: Tool ${actualToolName} already called this turn.`);
            if (this.session.sonicClient && this.session.sonicClient.getSessionId()) {
                await this.session.sonicClient.sendToolResult(
                    toolUse.toolUseId,
                    { text: `[SYSTEM] Duplicate tool invocation skipped.` },
                    false
                );
                if (this.session.processedToolIds) this.session.processedToolIds.add(toolUse.toolUseId);
            }
            return;
        }

        if (toolUse.toolUseId) this.session.processedToolIds.add(toolUse.toolUseId);
        if (!this.session.toolsCalledThisTurn) this.session.toolsCalledThisTurn = [];
        this.session.toolsCalledThisTurn.push(actualToolName);

        // Handle start_workflow
        if (actualToolName === 'start_workflow') {
            await this.handleStartWorkflow(toolUse);
            return;
        }

        // Check if disabled
        if (!this.isToolEnabled(actualToolName)) {
            console.log(`[SonicService] 🛑 Blocked execution of DISABLED tool: ${actualToolName}`);
            if (this.session.sonicClient && this.session.sonicClient.getSessionId()) {
                await this.session.sonicClient.sendToolResult(
                    toolUse.toolUseId,
                    { text: `[SYSTEM] Tool '${actualToolName}' is disabled. Reply: "I'm sorry, that feature is not available."` },
                    false
                );
            }
            return;
        }

        // Notify UI
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'debugInfo',
                data: { toolUse: { name: actualToolName, toolName: actualToolName, input: toolUse.content || toolUse.input, toolUseId: toolUse.toolUseId } }
            }));
        }
        this.session.transcript.push({
            role: 'tool_use',
            text: `Tool Invoked: ${actualToolName}`,
            timestamp: Date.now(),
            // @ts-ignore
            toolName: actualToolName,
            toolInput: toolUse.content || toolUse.input
        });

        try {
            let result: any;
            const toolDef = this.toolService.loadTools().find((t: any) => t.toolSpec.name === actualToolName);
            const isAgentCoreGatewayTool = (toolDef && toolDef.gatewayTarget) ||
                ['agentcore_balance', 'agentcore_transactions', 'get_account_transactions', 'perform_idv_check',
                    'lookup_merchant_alias', 'create_dispute_case', 'manage_recent_interactions', 'update_dispute_case', 'get_server_time'].includes(actualToolName);

            if (isAgentCoreGatewayTool && this.agentService.gatewayClient) {
                const toolParams = toolUse.content ? JSON.parse(toolUse.content) : toolUse.input;
                const gatewayTarget = toolDef ? toolDef.gatewayTarget : undefined;
                let gatewayResult = await this.agentService.gatewayClient.callTool(actualToolName, toolParams, gatewayTarget);

                // Guardrails
                if (actualToolName === 'perform_idv_check') {
                    const parsed = typeof gatewayResult === 'string' ? JSON.parse(gatewayResult) : gatewayResult;
                    if (parsed.verified === true || parsed.auth_status === 'VERIFIED') {
                        this.session.isAuthenticated = true;
                        if (!this.session.workflowChecks) this.session.workflowChecks = {};
                        this.session.workflowChecks['ID&V Status'] = 'Verified ✅';
                        this.broadcastWorkflowStatus();
                    } else {
                        if (!this.session.workflowChecks) this.session.workflowChecks = {};
                        this.session.workflowChecks['ID&V Status'] = 'Failed ❌';
                        this.broadcastWorkflowStatus();
                    }
                    if (parsed.customer_name) { delete parsed.customer_name; gatewayResult = JSON.stringify(parsed); }
                }
                result = { status: "success", data: gatewayResult };

                // Sanitize TFL
                if (typeof gatewayResult === 'string' && gatewayResult.includes('Transport for London')) {
                    result.data = JSON.stringify({ interactions: [], message: "No recent interactions found." });
                }
            } else {
                // Use AgentService
                let agentPayload = toolUse.content ? JSON.parse(toolUse.content) : toolUse.input;
                if (toolDef && toolDef.agentPrompt) {
                    let prompt = toolDef.agentPrompt;
                    if (prompt.endsWith('.txt')) prompt = await this.promptService.loadPrompt(prompt);
                    prompt = prompt.replace('{{USER_LOCATION}}', this.session.userLocation || "Unknown").replace('{{USER_TIMEZONE}}', this.session.userTimezone || "UTC");
                    agentPayload = { prompt };
                }
                result = await this.agentService.callAgentCore(this.session, actualToolName, agentPayload);
            }

            const toolResult = result.status === "success" ? result.data : result.message;
            let cleanResult = typeof toolResult === 'string' ? cleanTextForSonic(toolResult) : toolResult;

            if (this.session.sonicClient && this.session.sonicClient.getSessionId()) {
                await this.session.sonicClient.sendToolResult(toolUse.toolUseId, cleanResult, false);
                const duration = Date.now() - toolStartTime;
                console.log(`[SonicService] Tool result sent (${duration}ms): ${actualToolName}`);

                this.session.transcript.push({
                    role: 'tool_result',
                    text: `Tool Result: ${typeof cleanResult === 'string' ? cleanResult : JSON.stringify(cleanResult)}`,
                    timestamp: Date.now(),
                    // @ts-ignore
                    toolName: actualToolName,
                    result: cleanResult
                });
            } else {
                // Restart if needed logic omitted for brevity/stability, usually handled by main loop
                console.log('[SonicService] Session unavailable for tool result.');
            }

        } catch (error) {
            console.error('[SonicService] Tool execution failed:', error);
            if (this.session.sonicClient && this.session.sonicClient.getSessionId()) {
                await this.session.sonicClient.sendToolResult(toolUse.toolUseId, { text: "Error executing tool." }, true);
            }
        }
    }

    private async handleStartWorkflow(toolUse: any) {
        const workflowId = toolUse.input?.workflowId || (toolUse.content && toolUse.content[0]?.json?.workflowId);
        if (!workflowId) return;
        console.log(`[SonicService] 🔄 CONTEXT SWITCH: Loading workflow "${workflowId}"...`);

        if (this.session.currentWorkflowId !== workflowId) {
            this.session.currentWorkflowId = workflowId.charAt(0).toUpperCase() + workflowId.slice(1);
            this.session.workflowChecks = {};
            this.broadcastWorkflowStatus();
        }

        const filename = `workflow-${workflowId}.json`;
        const localPath = path.join(__dirname, '../../', filename); // Assuming workflows are in backend root
        const srcPath = path.join(__dirname, '../', filename);

        let wfData;
        if (fs.existsSync(srcPath)) wfData = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
        else if (fs.existsSync(localPath)) wfData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));

        if (wfData) {
            const workflowText = convertWorkflowToText({ nodes: wfData.nodes, edges: wfData.edges });
            const strictHeader = "\n\n########## CRITICAL WORKFLOW OVERRIDE ##########\nYOU MUST IGNORE PREVIOUS CONVERSATIONAL GUIDELINES AND STRICTLY FOLLOW THIS STATE MACHINE:\n";
            const newSystemPrompt = strictHeader + workflowText;

            const currentConfig = this.session.sonicClient.getSessionConfig() || {};
            let basePrompt = currentConfig.systemPrompt || "";
            if (basePrompt.includes("########## CRITICAL WORKFLOW OVERRIDE")) {
                basePrompt = basePrompt.split("########## CRITICAL WORKFLOW OVERRIDE")[0];
            }

            this.session.sonicClient.updateSessionConfig({ systemPrompt: basePrompt + newSystemPrompt });

            if (this.session.sonicClient.getSessionId()) {
                await this.session.sonicClient.stopSession();
            }
            await this.session.sonicClient.startSession((event) => this.handleSonicEvent(event), this.session.sessionId);

            setTimeout(async () => {
                if (this.session.sonicClient.getSessionId()) {
                    await this.session.sonicClient.sendText(`[SYSTEM] The user has entered the "${workflowId}" workflow. Please begin the process immediately according to step [${workflowId.toUpperCase()}_start].`);
                }
            }, 1500);
        }
    }

    private isToolEnabled(name: string): boolean {
        if (this.session.allowedTools) return this.session.allowedTools.includes(name);
        if (this.session.tools) return this.session.tools.some(t => t.toolSpec.name === name);
        return false;
    }

    public broadcastWorkflowStatus() {
        if (this.session.ws.readyState === WebSocket.OPEN) {
            this.session.ws.send(JSON.stringify({
                type: 'workflowStatus',
                data: {
                    workflowName: this.session.currentWorkflowId || 'Not Started',
                    checks: this.session.workflowChecks || {}
                }
            }));
        }
    }

    public saveTranscript() {
        const { session } = this;
        console.log(`[SonicService] saveTranscript called for session ${session.sessionId}, transcript length: ${session.transcript?.length || 0}`);
        if (!session.transcript || session.transcript.length === 0) {
            console.log(`[SonicService] Skipping save - empty transcript for session ${session.sessionId}`);
            return;
        }

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `session_${timestamp}_${session.sessionId}.json`;
            const filePath = path.join(HISTORY_DIR, filename);

            let totalSentiment = 0;
            let sentimentCount = 0;
            session.transcript.forEach((msg: any) => {
                if (msg.sentiment !== undefined) {
                    totalSentiment += typeof msg.sentiment === 'number' ? msg.sentiment : (msg.sentiment.score || 0);
                    sentimentCount++;
                }
            });
            const averageSentiment = sentimentCount > 0 ? totalSentiment / sentimentCount : 0;

            const inputTokens = session.sonicClient?.getSessionInputTokens() || 0;
            const outputTokens = session.sonicClient?.getSessionOutputTokens() || 0;
            const finalCost = (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;

            const data = {
                sessionId: session.sessionId,
                startTime: session.transcript[0]?.timestamp || Date.now(),
                endTime: Date.now(),
                brainMode: session.brainMode,
                transcript: session.transcript,
                tools: session.allowedTools || [],
                usage: { inputTokens, outputTokens, totalTokens: session.sonicClient?.getSessionTotalTokens() || 0, cost: finalCost, sentiment: averageSentiment },
                feedback: session.feedback || SonicService.pendingFeedback.get(session.sessionId)
            };

            if (SonicService.pendingFeedback.has(session.sessionId)) SonicService.pendingFeedback.delete(session.sessionId);

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`[SonicService] Saved chat history to ${filename}`);

            if (session.isTest) {
                const testLogsDir = path.join(__dirname, '../../test_logs');
                if (!fs.existsSync(testLogsDir)) fs.mkdirSync(testLogsDir, { recursive: true });
                const testFilename = `test_${timestamp}_${session.testResult || 'UNKNOWN'}_${session.userResult || 'UNKNOWN'}_${session.sessionId}.json`;
                fs.writeFileSync(path.join(testLogsDir, testFilename), JSON.stringify(data, null, 2));
            }

        } catch (err) {
            console.error('[SonicService] Failed to save chat history:', err);
        }
    }

    public async handleClientMessage(data: any, isBinary: boolean) {
        const { ws, sessionId } = this.session;

        if (!isBinary) {
            let parsed: any;
            try {
                const text = data.toString();
                if (text === 'ping') {
                    if (ws.readyState === WebSocket.OPEN) ws.send('pong');
                    return;
                }
                parsed = JSON.parse(text);
            } catch (e) {
                // Not JSON, fall through to binary check if needed, or ignore
            }

            if (parsed) {
                if (parsed.type === 'update_sentiment') {
                    // Sent by frontend purely for visual sync logging if needed
                    return;
                }

                if (parsed.type === 'test_config') {
                    this.session.isTest = true;
                    this.session.testName = parsed.testName;
                    console.log(`[SonicService] 🧪 TEST START: ${parsed.testName}`);
                    return;
                }

                if (parsed.type === 'sessionConfig') {
                    console.log(`[SonicService] Received session config for ${sessionId}`);

                    if (parsed.config.inputMode === 'text' && !this.session.sonicClient.getSessionId()) {
                        console.log('[SonicService] Pre-initializing session for text mode...');
                        await this.session.sonicClient.startSession((event) => this.handleSonicEvent(event), sessionId);
                    }

                    if (parsed.config.brainMode) {
                        this.session.brainMode = parsed.config.brainMode;
                        console.log(`[SonicService] 🧠 Brain Mode set to: ${this.session.brainMode}`);
                    }

                    if (parsed.config.agentId) {
                        this.session.agentId = parsed.config.agentId;
                        this.session.agentAliasId = parsed.config.agentAliasId;
                    }

                    if (parsed.config.awsConfig) {
                        const { accessKeyId, secretAccessKey, sessionToken, region, agentCoreRuntimeArn } = parsed.config.awsConfig;
                        this.session.awsAccessKeyId = accessKeyId;
                        this.session.awsSecretAccessKey = secretAccessKey;
                        this.session.awsSessionToken = sessionToken;
                        this.session.awsRegion = region;
                        this.session.agentCoreRuntimeArn = agentCoreRuntimeArn;

                        // Update Sonic Client Credentials
                        this.session.sonicClient.updateCredentials(accessKeyId, secretAccessKey, region, agentCoreRuntimeArn);

                        // Gateway Client Update
                        if (this.agentService.gatewayClient) {
                            this.agentService.gatewayClient.updateCredentials(accessKeyId, secretAccessKey, region);
                        }
                    }

                    // Tool Loading from Config
                    if (parsed.config.tools) {
                        const requestedTools = parsed.config.tools; // Array of tool names
                        const allTools = this.toolService.loadTools();
                        this.session.tools = allTools.filter((t: any) => requestedTools.includes(t.toolSpec.name));
                        this.session.allowedTools = requestedTools;
                        console.log(`[SonicService] Configured ${this.session.tools?.length} tools.`);
                    } else if (parsed.config.defaultTools) {
                        // Load defaults if specified
                        this.session.tools = this.toolService.loadTools();
                        this.session.allowedTools = this.session.tools?.map((t: any) => t.toolSpec.name);
                    }

                    // Workflow Injection
                    if (parsed.config.workflowId) {
                        await this.handleStartWorkflow({ input: { workflowId: parsed.config.workflowId } });
                    }

                    // Trace config
                    if (parsed.config.langfuseTraceId) {
                        // Can't easily resume trace object here without Langfuse dependency, 
                        // but we can set metadata
                    }

                    // System Prompt Update
                    if (parsed.config.systemPrompt) {
                        this.session.sonicClient.updateSessionConfig({ systemPrompt: parsed.config.systemPrompt });
                    }

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'config_applied', success: true }));
                    }

                    // Eagerly start session if not started, to allow model to speak first
                    if (!this.session.sonicClient.getSessionId()) {
                        console.log('[SonicService] Eagerly starting session for proactive greeting...');
                        // Use this.session.sessionId 
                        await this.session.sonicClient.startSession((event) => this.handleSonicEvent(event), this.session.sessionId);

                        // Send a hidden text input to trigger the greeting
                        // We do NOT add this to the transcript so it remains hidden from history
                        await new Promise(r => setTimeout(r, 500)); // Brief pause to ensure connection stability
                        await this.session.sonicClient.sendText("Please greet the user.");
                    }
                    return;
                }

                if (parsed.type === 'textInput') {
                    console.log(`[SonicService] ⌨️ Received text input: "${parsed.text}"`);
                    if (!parsed.text) return;

                    this.session.transcript.push({ role: 'user', text: parsed.text, timestamp: Date.now() });
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'transcript', role: 'user', text: parsed.text, isFinal: true }));
                    }

                    if (!this.session.sonicClient.getSessionId()) {
                        await this.session.sonicClient.startSession((event) => this.handleSonicEvent(event), sessionId);
                        await new Promise(r => setTimeout(r, 500));
                    }

                    if (this.session.sonicClient.getSessionId()) {
                        await this.session.sonicClient.sendText(parsed.text);
                    }
                    return;
                }

                if (parsed.type === 'awsConfig') {
                    console.log('[SonicService] Received dynamic AWS Config update');
                    const { accessKeyId, secretAccessKey, region, agentCoreRuntimeArn } = parsed.config;
                    this.session.awsAccessKeyId = accessKeyId;
                    this.session.awsSecretAccessKey = secretAccessKey;
                    this.session.awsRegion = region;
                    this.session.agentCoreRuntimeArn = agentCoreRuntimeArn;

                    this.session.sonicClient.updateCredentials(accessKeyId, secretAccessKey, region, agentCoreRuntimeArn);
                    if (this.agentService.gatewayClient) {
                        this.agentService.gatewayClient.updateCredentials(accessKeyId, secretAccessKey, region);
                    }
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'status', message: 'AWS Credentials Updated' }));
                    return;
                }

                if (parsed.type === 'session_feedback') {
                    this.session.feedback = { score: parsed.score, comment: parsed.comment };
                    // If using Langfuse trace in session, score it here
                    return;
                }
            }
        }

        // Binary Audio Handling
        if (isBinary || Buffer.isBuffer(data)) {
            const audioBuffer = Buffer.from(data as any);

            if (this.session.brainMode === 'bedrock_agent') {
                // Classic Agent Mode (VAD + Transcribe + Agent)
                await this.handleAgentModeAudio(audioBuffer);
            } else {
                // Raw Nova Sonic Mode
                if (audioBuffer.length % 2 !== 0) return; // Drop invalid PCM
                if (!this.session.sonicClient.getSessionId()) {
                    await this.session.sonicClient.startSession((event) => this.handleSonicEvent(event), sessionId);
                }
                await this.session.sonicClient.sendAudioChunk({ buffer: audioBuffer, timestamp: Date.now() });
            }
        }
    }

    private async handleAgentModeAudio(audioBuffer: Buffer) {
        // Simple VAD & buffering logic from server.ts
        this.session.agentBuffer.push(audioBuffer);
        const rms = calculateRMS(audioBuffer);
        const VAD_THRESHOLD = 100;

        if (rms > VAD_THRESHOLD) {
            if (this.session.silenceTimer) {
                clearTimeout(this.session.silenceTimer);
                this.session.silenceTimer = null;
            }
            if (!this.session.isInterrupted) {
                this.session.isInterrupted = true;
                if (this.session.ws.readyState === WebSocket.OPEN) {
                    this.session.ws.send(JSON.stringify({ type: 'interruption' }));
                }
            }
        }

        if (!this.session.silenceTimer) {
            this.session.silenceTimer = setTimeout(async () => {
                this.session.silenceTimer = null;
                if (this.session.agentBuffer.length === 0) return;
                const fullAudio = Buffer.concat(this.session.agentBuffer);
                this.session.agentBuffer = [];

                // Transcribe & Call Agent
                console.log(`[SonicService] Processing ${fullAudio.length} bytes for specific Agent...`);
                const text = await this.session.transcribeClient.transcribe(fullAudio);
                if (!text) return;

                const finalText = formatUserTranscript(text);
                this.session.transcript.push({ role: 'user', text: finalText, timestamp: Date.now() });
                if (this.session.ws.readyState === WebSocket.OPEN) {
                    this.session.ws.send(JSON.stringify({ type: 'transcript', role: 'user', text: finalText, isFinal: true }));
                }

                // Invoke Agent via AgentService
                const result = await this.agentService.callAgentCore(this.session, 'main_agent', { prompt: finalText });

                if (result.status === 'success' && typeof result.data === 'string') {
                    const agentReply = result.data;
                    this.session.isInterrupted = false; // Reset interruption
                    this.session.transcript.push({ role: 'assistant', text: agentReply, timestamp: Date.now() });
                    if (this.session.ws.readyState === WebSocket.OPEN) {
                        this.session.ws.send(JSON.stringify({ type: 'transcript', role: 'assistant', text: agentReply, isFinal: true }));
                    }

                    // Synthesize reply via Sonic (TTS only)
                    if (!this.session.sonicClient.getSessionId()) {
                        await this.session.sonicClient.startSession((event) => this.handleSonicEvent(event), this.session.sessionId);
                        await new Promise(r => setTimeout(r, 500));
                    }
                    await this.session.sonicClient.sendText(cleanTextForSonic(agentReply));
                }

            }, 1500);
        }
    }

    public async stop() {
        if (this.session.sonicClient.isActive()) {
            await this.session.sonicClient.stopSession();
        }
        this.saveTranscript();
    }
}
