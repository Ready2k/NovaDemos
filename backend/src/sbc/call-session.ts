/**
 * call-session.ts — Per-call orchestrator for the SBC.
 *
 * Lifecycle:
 *   1. Created on SipUa 'call' event.
 *   2. Loads BankingDisputes persona + disputes workflow → assembles system prompt.
 *   3. Loads all tools from /tools/ and formats them for Nova Sonic.
 *   4. Starts a SonicClient session (voice: amy, UK English).
 *   5. Bridges RTP audio ↔ Nova Sonic bidirectional stream.
 *   6. Dispatches tool calls via AgentCoreGatewayClient.
 *   7. Destroyed on SipUa 'hangup' event → stopSession().
 */

import * as fs   from 'fs';
import * as path from 'path';

import { SonicClient, SonicEvent } from '../sonic-client';
import { AgentCoreGatewayClient }  from '../agentcore-gateway-client';
import { RtpSession }              from './rtp-session';
import { CallMeta }                from './sip-ua';
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

function buildSystemPrompt(): string {
    // 1. Load BankingDisputes persona
    let persona = '';
    try {
        persona = fs.readFileSync(path.join(PROMPTS_DIR, 'persona-BankingDisputes.txt'), 'utf-8').trim();
    } catch (e) {
        console.error('[CallSession] Failed to load BankingDisputes persona:', e);
        persona = 'You are a professional UK banking assistant specialising in disputes.';
    }

    // 2. Load disputes workflow
    let workflowText = '';
    try {
        // Try runtime dist path first (Dockerfile copies workflow JSON to dist/)
        let wfPath = path.join(SRC_DIR, 'workflow-disputes.json');
        if (!fs.existsSync(wfPath)) {
            // Fall back to source tree
            wfPath = path.join(__dirname, '..', 'workflow-disputes.json');
        }
        const wfJson = JSON.parse(fs.readFileSync(wfPath, 'utf-8'));
        workflowText = convertWorkflowToText(wfJson);
    } catch (e) {
        console.warn('[CallSession] Could not load workflow-disputes.json:', e);
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
    private callId:    string;
    private sonic:     SonicClient;
    private gateway:   AgentCoreGatewayClient;
    private rtp:       RtpSession;
    private tools:     ToolSpec[];
    private ended:     boolean = false;

    constructor(rtpSession: RtpSession, meta: CallMeta) {
        this.callId  = meta.callId;
        this.rtp     = rtpSession;
        this.sonic   = new SonicClient();
        this.gateway = new AgentCoreGatewayClient();
        this.tools   = loadTools();

        console.log(`[CallSession:${this.callId}] Starting — ${this.tools.length} tools loaded`);

        // Wire up audio bridge: RTP → Nova Sonic
        this.rtp.on('audio', (g711: Buffer) => this._onRtpAudio(g711));

        this._start().catch(err => {
            console.error(`[CallSession:${this.callId}] Failed to start:`, err);
        });
    }

    private async _start(): Promise<void> {
        const systemPrompt = buildSystemPrompt();

        // Nova Sonic expects tools wrapped as { toolSpec: ... }
        const mappedTools = this.tools.map(t => ({ toolSpec: t.toolSpec }));

        this.sonic.setConfig({
            systemPrompt,
            voiceId: 'amy',
            tools:   mappedTools,
        });

        await this.sonic.startSession(
            (event: SonicEvent) => this._onSonicEvent(event),
            `sbc-${this.callId}`
        );

        console.log(`[CallSession:${this.callId}] Nova Sonic session started`);
    }

    // ── RTP → Nova Sonic ───────────────────────────────────────────────────────

    private _onRtpAudio(g711: Buffer): void {
        if (this.ended) return;

        // G.711 @8kHz → PCM16 @8kHz → PCM16 @16kHz
        const pcm8  = ulawToLinear16(g711);
        const pcm16 = resample8to16kHz(pcm8);

        this.sonic.sendAudioChunk({ buffer: pcm16, timestamp: Date.now() }).catch(err => {
            console.error(`[CallSession:${this.callId}] sendAudioChunk error:`, err);
        });
    }

    // ── Nova Sonic → RTP ──────────────────────────────────────────────────────

    private _onSonicEvent(event: SonicEvent): void {
        if (this.ended) return;

        switch (event.type) {

            case 'audio': {
                // LPCM @24kHz → PCM16 @8kHz → G.711 μ-law → RTP
                const lpcm24 = Buffer.isBuffer(event.data)
                    ? event.data
                    : Buffer.from(event.data, 'base64');

                const pcm8  = resample24to8kHz(lpcm24);
                const g711  = linear16ToUlaw(pcm8);
                this.rtp.send(g711);
                break;
            }

            case 'toolUse': {
                this._handleToolUse(event.data).catch(err => {
                    console.error(`[CallSession:${this.callId}] Tool execution error:`, err);
                    // Best-effort: send error result back to Nova Sonic
                    const toolId = event.data?.toolUseId || event.data?.id || 'unknown';
                    this.sonic.sendToolResult(toolId, `Error: ${err.message}`, true).catch(() => {});
                });
                break;
            }

            case 'error': {
                console.error(`[CallSession:${this.callId}] Nova Sonic error:`, event.data);
                break;
            }

            case 'transcript': {
                const text = event.data?.text || event.data;
                if (text) {
                    console.log(`[CallSession:${this.callId}] Transcript: ${text}`);
                }
                break;
            }

            default:
                // Other events (session_start, metadata, etc.) are informational
                break;
        }
    }

    // ── Tool dispatch ──────────────────────────────────────────────────────────

    private async _handleToolUse(data: any): Promise<void> {
        // Tool use event from Nova Sonic native mode
        const toolName = data?.toolSpec?.name || data?.name;
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
        const toolDef      = this.tools.find(t => t.toolSpec.name === toolName);
        const gatewayTarget = toolDef?.gatewayTarget;

        try {
            const result = await this.gateway.callTool(toolName, args, gatewayTarget);
            console.log(`[CallSession:${this.callId}] Tool result for ${toolName}:`, result);
            await this.sonic.sendToolResult(toolId, result);
        } catch (err: any) {
            console.error(`[CallSession:${this.callId}] Gateway error for ${toolName}:`, err.message);
            await this.sonic.sendToolResult(toolId, `Tool error: ${err.message}`, true);
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    end(): void {
        if (this.ended) return;
        this.ended = true;
        console.log(`[CallSession:${this.callId}] Ending call`);

        this.sonic.stopSession().catch(err => {
            console.error(`[CallSession:${this.callId}] stopSession error:`, err);
        });
        this.rtp.close();
    }
}
