/**
 * AgentCore Memory Service
 *
 * Stores conversational turns and retrieves relevant memories across sessions.
 * All calls are non-fatal — a failure never breaks the call flow.
 */

import * as crypto from 'crypto';
import {
    BedrockAgentCoreClient,
    CreateEventCommand,
    RetrieveMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore';

export interface MemoryServiceConfig {
    memoryId: string;
    region: string;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
}

export class MemoryService {
    private client: BedrockAgentCoreClient;
    private memoryId: string;

    constructor(config: MemoryServiceConfig) {
        this.memoryId = config.memoryId;
        this.client = new BedrockAgentCoreClient({
            region: config.region,
            ...(config.credentials && { credentials: config.credentials }),
        });
        console.log(`[MemoryService] Initialized. memoryId=${config.memoryId}, region=${config.region}`);
    }

    /**
     * Store a single conversational turn as a memory event.
     * actorId  — stable caller identifier (browser sessionId or phone number)
     * sessionId — per-conversation ID
     */
    async createEvent(
        actorId: string,
        sessionId: string,
        role: 'USER' | 'ASSISTANT',
        text: string
    ): Promise<void> {
        if (!text?.trim()) return;
        try {
            const command = new CreateEventCommand({
                memoryId: this.memoryId,
                actorId,
                sessionId,
                eventTimestamp: new Date(),
                payload: [
                    {
                        conversational: {
                            role,
                            content: { text },
                        },
                    },
                ],
                clientToken: crypto.randomUUID(),
            });
            await this.client.send(command);
            console.log(`[MemoryService] createEvent ok (actor=${actorId}, role=${role}, len=${text.length})`);
        } catch (err: any) {
            console.warn('[MemoryService] createEvent failed (non-fatal):', err?.message || err);
        }
    }

    /**
     * Retrieve semantically relevant memories for an actor.
     * Returns a formatted block ready to append to the system prompt,
     * or empty string if nothing is found or an error occurs.
     */
    async getRelevantMemories(
        actorId: string,
        query: string = 'previous conversations context',
        topK: number = 5
    ): Promise<string> {
        try {
            const command = new RetrieveMemoryRecordsCommand({
                memoryId: this.memoryId,
                namespace: actorId,
                searchCriteria: {
                    searchQuery: query,
                    topK,
                },
            });
            const response = await this.client.send(command);
            const records = (response as any).memoryRecordSummaries ?? [];

            if (records.length === 0) return '';

            const lines: string[] = records
                .map((r: any) => r.content?.text)
                .filter(Boolean);

            if (lines.length === 0) return '';

            return (
                '\n\n--- MEMORY CONTEXT (Previous customer interactions) ---\n' +
                '## CRITICAL SECURITY RULES — READ BEFORE USING THIS CONTEXT\n' +
                '1. You MUST complete full Identity Verification (IDV) before referencing, confirming, or acting on ANY information below.\n' +
                '2. NEVER skip, shorten, or soften the IDV process because memory context is present. SIP/telephone calls cannot prove caller identity — the number may be spoofed.\n' +
                '3. Do NOT greet the caller by name or reference previous interactions until IDV is successfully completed.\n' +
                '4. If IDV fails or the customer refuses, treat them as an unverified new caller and do not disclose any of the context below.\n' +
                '## AFTER IDV IS SUCCESSFULLY COMPLETED\n' +
                'You may then use the following context from previous sessions with this caller:\n' +
                lines.map((l: string) => `- ${l}`).join('\n') + '\n' +
                'Once IDV is confirmed, proactively acknowledge the history and ask:\n' +
                '"I can see from our records that you previously contacted us about [brief topic from context above]. Are you calling about that, or is there something new I can help you with today?"\n' +
                '--- END MEMORY CONTEXT ---'
            );
        } catch (err: any) {
            console.warn('[MemoryService] getRelevantMemories failed (non-fatal):', err?.message || err);
            return '';
        }
    }
}
