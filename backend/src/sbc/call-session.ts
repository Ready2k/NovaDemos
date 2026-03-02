/**
 * call-session.ts — Per-call orchestrator for the SBC.
 *
 * Lifecycle:
 *   1. Created on SipUa 'call' event.
 *   2. Fetches config from main backend (voice, persona, workflow).
 *   3. Loads persona prompt + workflow → assembles system prompt.
 *   4. Loads all tools from /tools/ and formats them for Nova Sonic.
 *   5. Starts a SonicClient session.
 *   6. Bridges RTP audio ↔ Nova Sonic bidirectional stream.
 *   7. Dispatches tool calls via AgentCoreGatewayClient.
 *   8. Destroyed on SipUa 'hangup' event → stopSession().
 */

import * as fs   from 'fs';
import * as path from 'path';

import { SonicClient, SonicEvent } from '../sonic-client';
import { AgentCoreGatewayClient }  from '../agentcore-gateway-client';
import { RtpSession }              from './rtp-session';
import { CallMeta }                from './sip-ua';
import { SbcEventBridge }         from './sbc-event-bridge';
import {
    ulawToLinear16,
    resample8to16kHz,
    resample24to8kHz,
    linear16ToUlaw,
} from './audio-codec';

// ─── Path constants ────────────────────────────────────────────────────────────

// __dirname is backend/dist/sbc at runtime; source files are one level up.
// Prompts and tools are mounted by the Dockerfile at predictable relative paths.
const BASE_DIR     = path.resolve(__dirname, '..', '..', '..'); // project root inside container
const PROMPTS_DIR  = path.join(BASE_DIR, 'backend', 'prompts');
const TOOLS_DIR    = path.join(BASE_DIR, 'tools');
const SRC_DIR      = path.join(__dirname, '..');   // backend/dist/ at runtime

// ─── SBC Config ───────────────────────────────────────────────────────────────

interface SbcConfig {
    voice:        string;
    persona:      string;
    workflow:     string;
    enabledTools: string[];
}

const CONFIG_DEFAULTS: SbcConfig = {
    voice:        'amy',
    persona:      'BankingDisputes',
    workflow:     'disputes',
    enabledTools: [],
};

// ─── Workflow → text (mirrors server.ts convertWorkflowToText) ─────────────────

function convertWorkflowToText(workflow: any): string {
    if (!workflow || !workflow.nodes || !Array.isArray(workflow.nodes)) return '';

    let text = '### WORKFLOW INSTRUCTIONS\n';
    text += 'You are executing a STRICT workflow. You represent a state machine.\n';
    text += 'CRITICAL RULE: You MUST begin EVERY single response with the tag [STEP: node_id].\n';
    text += 'This tag tells the UI where you are. Without it, the interface BREAKS.\n';
    text += 'Format: [STEP: node_id] Your response text...\n';
    text += 'DO NOT FORGET THIS TAG. IT IS MANDATORY FOR EVERY TURN.\n';
    text += 'SILENCE INSTRUCTION: The [STEP: ...] tag is for system control only. DO NOT SPEAK IT ALOUD. Keep it silent.\n\n';

    const startNode = workflow.nodes.find((n: any) => n.type === 'start');
    if (startNode) {
        text += `ENTRY POINT: Begin execution at step [${startNode.id}]. Start your first response with [STEP: ${startNode.id}].\n`;
    }

    workflow.nodes.forEach((node: any) => {
        text += `STEP [${node.id}] (${node.type}):\n   INSTRUCTION: ${node.label || 'No instruction'}\n`;

        if (node.type === 'tool' && node.toolName) {
            text += `   -> ACTION REQUIRED: You MUST call the tool "${node.toolName}" after completing your verbal response.\n`;
        }

        if (node.type === 'workflow' && node.workflowId) {
            text += `   -> SUB-PROCESS REQUIRED: You must load the "${node.workflowId}" workflow to proceed.\n`;
            text += `   -> ACTION: Call Tool "start_workflow" with workflowId="${node.workflowId}"\n`;
            text += `   -> WAIT for the system to reload with new instructions.\n`;
        }

        const edges = (workflow.edges || []).filter((e: any) => e.from === node.id);
        if (edges.length > 0) {
            text += '   TRANSITIONS:\n';
            edges.forEach((edge: any) => {
                const condition = edge.label ? `IF "${edge.label}"` : 'NEXT';
                text += `   - ${condition} -> GOTO [${edge.to}]\n`;
            });
        } else if (node.type === 'end') {
            text += '   -> PROCESS ENDS.\n';
        }
        text += '\n';
    });

    return text;
}

// ─── Tool loader (mirrors server.ts loadTools) ────────────────────────────────

interface ToolSpec {
    toolSpec: {
        name:        string;
        description: string;
        inputSchema: { json: string };
    };
    gatewayTarget?: string;
}

function loadTools(): ToolSpec[] {
    try {
        if (!fs.existsSync(TOOLS_DIR)) {
            console.warn(`[CallSession] Tools directory not found: ${TOOLS_DIR}`);
            return [];
        }
        const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
        return files.map(f => {
            try {
                const raw     = fs.readFileSync(path.join(TOOLS_DIR, f), 'utf-8');
                const toolDef = JSON.parse(raw);
                const schema  = toolDef.input_schema || toolDef.inputSchema || toolDef.parameters;

                let finalDescription = toolDef.description || '';
                if (toolDef.instruction) {
                    finalDescription += `\n\n[INSTRUCTION]: ${toolDef.instruction}`;
                }

                return {
                    toolSpec: {
                        name:        toolDef.name,
                        description: finalDescription,
                        inputSchema: {
                            json: JSON.stringify(schema || { type: 'object', properties: {}, required: [] })
                        },
                    },
                    gatewayTarget: toolDef.gatewayTarget,
                };
            } catch (e) {
                console.error(`[CallSession] Failed to load tool ${f}:`, e);
                return null;
            }
        }).filter((t) => t !== null) as ToolSpec[];
    } catch (err) {
        console.error('[CallSession] Failed to list tools:', err);
        return [];
    }
}

// ─── System prompt assembly ───────────────────────────────────────────────────

function buildSystemPrompt(config: SbcConfig): string {
    // 1. Load persona
    let persona = '';
    const personaFile = `persona-${config.persona}.txt`;
    try {
        persona = fs.readFileSync(path.join(PROMPTS_DIR, personaFile), 'utf-8').trim();
    } catch (e) {
        console.error(`[CallSession] Failed to load persona ${personaFile}:`, e);
        persona = 'You are a professional UK banking assistant specialising in disputes.';
    }

    // 2. Load workflow
    let workflowText = '';
    try {
        const wfFilename = `workflow-${config.workflow}.json`;
        let wfPath = path.join(SRC_DIR, wfFilename);
        if (!fs.existsSync(wfPath)) {
            wfPath = path.join(__dirname, '..', wfFilename);
        }
        const wfJson = JSON.parse(fs.readFileSync(wfPath, 'utf-8'));
        workflowText = convertWorkflowToText(wfJson);
    } catch (e) {
        console.warn(`[CallSession] Could not load workflow-${config.workflow}.json:`, e);
    }

    // 3. Load guardrails (optional)
    let guardrails = '';
    try {
        guardrails = fs.readFileSync(path.join(PROMPTS_DIR, 'core-guardrails.txt'), 'utf-8').trim();
    } catch (_) { /* not critical */ }

    const parts = [persona];
    if (workflowText) parts.push(workflowText);
    if (guardrails)   parts.push(guardrails);

    return parts.join('\n\n');
}

// ─── CallSession ──────────────────────────────────────────────────────────────

export class CallSession {
    private callId:         string;
    private from:           string;
    private sonic:          SonicClient;
    private gateway:        AgentCoreGatewayClient;
    private rtp:            RtpSession;
    private bridge:         SbcEventBridge;
    private tools:          ToolSpec[];
    private ended:          boolean = false;
    private startTime:      number  = Date.now();

    // Tracks toolUseIds currently awaiting a gateway response.
    // Cleared on barge-in so stale results from interrupted turns are discarded
    // rather than sent to Nova Sonic (which closes the stream on unexpected results).
    private _activeToolIds: Set<string> = new Set();

    // Carry buffer: holds leftover bytes when a Nova Sonic audio chunk is not a
    // multiple of 6 bytes (3 samples × 2 bytes) needed for 3:1 decimation.
    private _audioCarry:    Buffer  = Buffer.alloc(0);

    // Playout FIFO + clock: Nova Sonic delivers audio in bursts (many tiny chunks
    // per response).  A 20 ms interval timer drains exactly one 160-byte RTP frame
    // per tick, producing a steady packet stream regardless of when Bedrock delivers.
    private _rtpFifo:       Buffer  = Buffer.alloc(0);
    private _playoutTimer:  ReturnType<typeof setInterval> | null = null;

    constructor(rtpSession: RtpSession, meta: CallMeta, bridge: SbcEventBridge) {
        this.callId  = meta.callId;
        this.from    = meta.from;
        this.rtp     = rtpSession;
        this.bridge  = bridge;
        this.sonic   = new SonicClient();
        this.gateway = new AgentCoreGatewayClient();
        this.tools   = loadTools();

        console.log(`[CallSession:${this.callId}] Starting — ${this.tools.length} tools loaded`);

        // Audio bridge is wired AFTER startSession() completes to avoid
        // "Session not started" errors caused by RTP arriving before Bedrock connects.
        this._start().catch(err => {
            console.error(`[CallSession:${this.callId}] Failed to start:`, err);
        });
    }

    private async _fetchConfig(): Promise<SbcConfig> {
        const backendUrl = process.env.SBC_BACKEND_URL || 'http://localhost:8080';
        try {
            const res = await fetch(`${backendUrl}/api/sbc-config`, {
                signal: AbortSignal.timeout(3000),
            });
            if (res.ok) {
                const cfg = await res.json() as SbcConfig;
                console.log(`[CallSession:${this.callId}] Config fetched: voice=${cfg.voice}, persona=${cfg.persona}, workflow=${cfg.workflow}`);
                return cfg;
            }
        } catch (e) {
            console.warn(`[CallSession:${this.callId}] Could not fetch SBC config, using defaults:`, e);
        }
        return { ...CONFIG_DEFAULTS };
    }

    private async _start(): Promise<void> {
        const config       = await this._fetchConfig();
        const systemPrompt = buildSystemPrompt(config);

        // Nova Sonic expects tools wrapped as { toolSpec: ... }
        const mappedTools = this.tools.map(t => ({ toolSpec: t.toolSpec }));

        this.sonic.setConfig({
            systemPrompt,
            voiceId: config.voice,
            tools:   mappedTools,
        });

        await this.sonic.startSession(
            (event: SonicEvent) => this._onSonicEvent(event),
            `sbc-${this.callId}`
        );

        console.log(`[CallSession:${this.callId}] Nova Sonic session started — wiring RTP audio bridge`);

        // Emit call start event to frontend
        this.bridge.emit({
            type:     'sbc_call_start',
            callId:   this.callId,
            from:     this.from,
            voice:    config.voice,
            persona:  config.persona,
            workflow: config.workflow,
        }).catch(() => {});

        // Wire RTP → Nova Sonic only now that the session is open
        this.rtp.on('audio', (g711: Buffer) => this._onRtpAudio(g711));

        // Start the 20 ms playout clock.  Drains exactly one 160-byte RTP frame per
        // tick so the outbound stream is steady regardless of Nova Sonic burst timing.
        this._playoutTimer = setInterval(() => this._drainRtpFifo(), 20);

        // Trigger initial greeting
        setTimeout(() => {
            if (!this.ended) {
                console.log(`[CallSession:${this.callId}] Injecting greeting trigger`);
                this.sonic.sendText('[CALL CONNECTED] Please deliver your opening greeting now.').catch(() => {});
            }
        }, 500);
    }

    // ── Playout clock ──────────────────────────────────────────────────────────

    private _drainRtpFifo(): void {
        if (this.ended || this._rtpFifo.length < 160) return;
        this.rtp.send(this._rtpFifo.slice(0, 160));
        this._rtpFifo = this._rtpFifo.slice(160);
    }

    // ── RTP → Nova Sonic ───────────────────────────────────────────────────────

    private _onRtpAudio(g711: Buffer): void {
        if (this.ended) return;

        // G.711 @8kHz → PCM16 @8kHz → PCM16 @16kHz
        const pcm8  = ulawToLinear16(g711);
        const pcm16 = resample8to16kHz(pcm8);

        this.sonic.sendAudioChunk({ buffer: pcm16, timestamp: Date.now() }).catch(() => {
            // Ignore — session may have ended; end() will be called by the error handler.
        });
    }

    // ── Nova Sonic → RTP ──────────────────────────────────────────────────────

    private _onSonicEvent(event: SonicEvent): void {
        if (this.ended) return;

        switch (event.type) {

            case 'audio': {
                // LPCM @24kHz → PCM16 @8kHz → G.711 μ-law → playout FIFO
                // sonic-client emits: { type: 'audio', data: { audio: Buffer } }
                const raw   = event.data?.audio ?? event.data;
                const chunk = Buffer.isBuffer(raw)
                    ? raw
                    : Buffer.from(raw, 'base64');

                // Prepend any leftover bytes so the 3:1 decimation always operates
                // on complete 6-byte triplets (3 samples × 2 bytes/sample).
                const lpcm24 = this._audioCarry.length > 0
                    ? Buffer.concat([this._audioCarry, chunk])
                    : chunk;

                const usable = Math.floor(lpcm24.length / 6) * 6;
                this._audioCarry = usable < lpcm24.length
                    ? lpcm24.slice(usable)
                    : Buffer.alloc(0);

                if (usable === 0) break;

                const pcm8 = resample24to8kHz(lpcm24.slice(0, usable));
                const g711 = linear16ToUlaw(pcm8);

                // Feed the playout FIFO; the 20 ms timer drains it at the right pace.
                this._rtpFifo = Buffer.concat([this._rtpFifo, g711]);
                break;
            }

            case 'toolUse': {
                // Register the toolUseId as active before dispatching so the
                // interrupt handler (transcript case below) can cancel it.
                const toolId = event.data?.toolUseId || event.data?.id;
                if (toolId) this._activeToolIds.add(toolId);

                const toolName = event.data?.toolName || event.data?.name;
                let args: any = {};
                try {
                    const raw = event.data?.content || event.data?.input || '{}';
                    args = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } catch { /* ignore parse errors here; handled fully in _handleToolUse */ }

                this.bridge.emit({
                    type:     'sbc_tool_use',
                    callId:   this.callId,
                    toolName,
                    args,
                }).catch(() => {});

                this._handleToolUse(event.data).catch(err => {
                    console.error(`[CallSession:${this.callId}] Unhandled tool error:`, err);
                });
                break;
            }

            case 'error': {
                console.error(`[CallSession:${this.callId}] Nova Sonic error:`, event.data);
                // End the call cleanly so the caller doesn't hear silence forever.
                this.end();
                break;
            }

            case 'transcript': {
                // sonic-client emits: { type: 'transcript', data: { transcript, role, isFinal, ... } }
                const text = event.data?.transcript || event.data?.text;
                if (text) {
                    // When the assistant is barged-in on, Nova Sonic abandons the
                    // current turn (including any pending tool calls).  Clear the
                    // active-tool set so we don't send stale results back, and flush
                    // the outbound RTP FIFO so the caller stops hearing Amy immediately.
                    if (event.data?.role === 'assistant' && text.includes('"interrupted"')) {
                        console.log(`[CallSession:${this.callId}] Barge-in detected — flushing audio + discarding ${this._activeToolIds.size} pending tool result(s)`);
                        this._rtpFifo = Buffer.alloc(0);
                        this._activeToolIds.clear();
                    }
                    const role = event.data?.role || 'unknown';
                    console.log(`[CallSession:${this.callId}] [${role}] ${text}`);

                    // Emit transcript event to frontend
                    this.bridge.emit({
                        type:   'sbc_transcript',
                        callId: this.callId,
                        role:   role === 'assistant' ? 'assistant' : 'user',
                        text,
                    }).catch(() => {});

                    // Parse workflow step tag from assistant responses
                    if (role === 'assistant') {
                        const stepMatch = text.match(/\[STEP:\s*([^\]]+)\]/);
                        if (stepMatch) {
                            this.bridge.emit({
                                type:    'sbc_workflow_step',
                                callId:  this.callId,
                                stepId:  stepMatch[1].trim(),
                            }).catch(() => {});
                        }
                    }
                }
                break;
            }

            case 'usageEvent': {
                const total = event.data?.details?.total;
                if (total) {
                    const inputTokens  = (total.input?.speechTokens  || 0) + (total.input?.textTokens  || 0);
                    const outputTokens = (total.output?.speechTokens || 0) + (total.output?.textTokens || 0);
                    this.bridge.emit({
                        type:         'sbc_usage',
                        callId:       this.callId,
                        inputTokens,
                        outputTokens,
                    }).catch(() => {});
                }
                break;
            }

            case 'latency_update': {
                this.bridge.emit({
                    type:       'sbc_latency',
                    callId:     this.callId,
                    ttft_ms:    event.data?.ttft_ms,
                    latency_ms: event.data?.latency_ms,
                }).catch(() => {});
                break;
            }

            default:
                // Other events (session_start, metadata, etc.) are informational
                break;
        }
    }

    // ── Tool dispatch ──────────────────────────────────────────────────────────

    private async _handleToolUse(data: any): Promise<void> {
        // Nova Sonic native toolUse event shape: { toolName, toolUseId, content }
        const toolName = data?.toolName || data?.toolSpec?.name || data?.name;
        const toolId   = data?.toolUseId || data?.id || `tool-${Date.now()}`;

        // Parse input — Nova Sonic sends it as a JSON string in 'content'
        let args: any = {};
        try {
            const raw = data?.content || data?.input || '{}';
            args = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {
            console.warn(`[CallSession:${this.callId}] Could not parse tool input for ${toolName}:`, e);
        }

        console.log(`[CallSession:${this.callId}] Tool call: ${toolName}`, args);

        // Find gateway target from tool definition
        const toolDef       = this.tools.find(t => t.toolSpec.name === toolName);
        const gatewayTarget = toolDef?.gatewayTarget;

        // Call the gateway (may take 1-3s)
        let result: string;
        let isError = false;
        try {
            result  = await this.gateway.callTool(toolName, args, gatewayTarget);
            console.log(`[CallSession:${this.callId}] Tool result for ${toolName}:`, result);
        } catch (err: any) {
            console.error(`[CallSession:${this.callId}] Gateway error for ${toolName}:`, err.message);
            result  = `Tool error: ${err.message}`;
            isError = true;
        }

        // Emit tool result to frontend
        this.bridge.emit({
            type:     'sbc_tool_result',
            callId:   this.callId,
            toolName,
            result,
        }).catch(() => {});

        // If a barge-in happened while the gateway was in-flight, this toolUseId
        // was removed from _activeToolIds.  Sending a result for a cancelled tool
        // call causes Nova Sonic to close the stream, so we discard it instead.
        if (this.ended || !this._activeToolIds.has(toolId)) {
            console.log(`[CallSession:${this.callId}] Tool result discarded (interrupted/ended): ${toolName}`);
            return;
        }

        this._activeToolIds.delete(toolId);

        try {
            await this.sonic.sendToolResult(toolId, result, isError);
        } catch (err: any) {
            // sendToolResult failing means the Nova Sonic stream has already died.
            // End the call cleanly rather than hanging.
            console.error(`[CallSession:${this.callId}] sendToolResult failed for ${toolName}:`, err.message);
            this.end();
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    end(): void {
        if (this.ended) return;
        this.ended = true;
        const durationMs = Date.now() - this.startTime;
        console.log(`[CallSession:${this.callId}] Ending call (${durationMs}ms)`);

        if (this._playoutTimer) {
            clearInterval(this._playoutTimer);
            this._playoutTimer = null;
        }

        // Emit call end event to frontend
        this.bridge.emit({
            type:       'sbc_call_end',
            callId:     this.callId,
            durationMs,
        }).catch(() => {});

        this.sonic.stopSession().catch(err => {
            console.error(`[CallSession:${this.callId}] stopSession error:`, err);
        });
        this.rtp.close();
    }
}
