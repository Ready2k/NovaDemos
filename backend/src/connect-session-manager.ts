/**
 * connect-session-manager.ts
 * Manages long-lived Nova Sonic sessions for Amazon Connect PSTN calls.
 *
 * One ConnectPhoneSession per active call:
 *   1. Opens a persistent Nova Sonic bidirectional stream.
 *   2. Feeds caller audio from KVS in real time.
 *   3. On each interactionTurnEnd: encodes response audio as WAV, uploads to S3,
 *      and updates DynamoDB so GetBotResult Lambda can poll and return it to Connect.
 *   4. Keeps the Nova Sonic session open for the next utterance (no reconnect latency).
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SonicClient, SonicEvent } from './sonic-client';
import { ConnectKvsConsumer } from './connect-kvs-consumer';
import { downsample24to8kHz, encodeWav } from './audio-converter';

const SESSION_TABLE = process.env.SESSION_TABLE || '';
const RESPONSE_BUCKET = process.env.RESPONSE_BUCKET || '';

// Send caller audio to Nova Sonic in 4096-sample (8192-byte) chunks.
const AUDIO_CHUNK_BYTES = 8192;

export interface ConnectSessionOptions {
    contactId: string;
    sessionId: string;   // e.g. "connect-<contactId>"
    streamArn: string;
    startFragment: string;
    startTimestamp: string | null;
    instanceArn: string;
}

// ─── Per-call session ─────────────────────────────────────────────────────────

class ConnectPhoneSession {
    private sonicClient: SonicClient;
    private kvsConsumer: ConnectKvsConsumer;
    private audioFrames: Buffer[] = [];
    private responseText: string = '';
    private history: Array<{ role: string; text: string }> = [];

    private readonly ddb = new DynamoDBClient({});
    private readonly s3 = new S3Client({});

    constructor(private readonly opts: ConnectSessionOptions) {
        this.sonicClient = new SonicClient();
        this.kvsConsumer = new ConnectKvsConsumer();
    }

    async start(): Promise<void> {
        console.log(`[ConnectPhoneSession:${this.opts.contactId}] Starting session`);

        this.sonicClient.setConfig({
            systemPrompt: this.buildSystemPrompt(),
            voiceId: 'Matthew',
        });

        await this.sonicClient.startSession(
            (event: SonicEvent) => this.handleSonicEvent(event),
            this.opts.sessionId,
        );

        // Set DynamoDB status to "processing" so GetBotResult knows a turn is active.
        await this.updateDdbStatus('processing');

        // Trigger the greeting — Nova Sonic speaks first without waiting for caller audio.
        // This fires interactionTurnEnd, which runs processTurnEnd and marks status=ready.
        console.log(`[ConnectPhoneSession:${this.opts.contactId}] Triggering greeting`);
        await this.sonicClient.sendText('Greet the customer and ask how you can help them today.');

        // Begin streaming KVS audio to Nova Sonic for subsequent caller turns.
        // startStreaming() is async but we don't await it here — it runs concurrently.
        this.kvsConsumer.startStreaming(
            this.opts.streamArn,
            this.opts.startFragment,
            this.opts.startTimestamp,
            (pcm16: Buffer) => this.forwardAudioToSonic(pcm16),
            () => console.log(`[ConnectPhoneSession:${this.opts.contactId}] KVS stream ended`),
        ).catch(e => console.error(`[ConnectPhoneSession:${this.opts.contactId}] KVS error:`, e));
    }

    async end(): Promise<void> {
        this.kvsConsumer.stop();
        await this.sonicClient.stopSession();
        console.log(`[ConnectPhoneSession:${this.opts.contactId}] Session ended`);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private buildSystemPrompt(): string {
        const historyContext = this.history.length
            ? '\n\nConversation so far:\n' + this.history.map(h => `${h.role}: ${h.text}`).join('\n')
            : '';
        return (
            'You are a helpful voice assistant for a banking customer service centre. ' +
            'Respond naturally and concisely in one or two sentences. ' +
            'If the caller wants to end the call, include the word GOODBYE in your response. ' +
            'If the caller wants to speak to a human agent, include the word TRANSFER in your response.' +
            historyContext
        );
    }

    private forwardAudioToSonic(pcm16: Buffer): void {
        for (let off = 0; off < pcm16.length; off += AUDIO_CHUNK_BYTES) {
            const slice = pcm16.slice(off, Math.min(off + AUDIO_CHUNK_BYTES, pcm16.length));
            this.sonicClient.sendAudioChunk({ buffer: slice, timestamp: Date.now() })
                .catch(e => console.error(`[ConnectPhoneSession:${this.opts.contactId}] sendAudioChunk:`, e));
        }
    }

    private handleSonicEvent(event: SonicEvent): void {
        switch (event.type) {
            case 'audio':
                if (event.data?.audio) {
                    const isBuf = Buffer.isBuffer(event.data.audio);
                    if (isBuf) {
                        this.audioFrames.push(event.data.audio);
                    } else {
                        console.warn(`[ConnectPhoneSession:${this.opts.contactId}] Received non-Buffer audio: ${typeof event.data.audio}, constructor: ${event.data.audio?.constructor?.name}`);
                        // Emergency conversion if it's a Uint8Array
                        if (event.data.audio instanceof Uint8Array) {
                            this.audioFrames.push(Buffer.from(event.data.audio));
                        }
                    }
                }
                break;

            case 'transcript':
                if (typeof event.data?.transcript === 'string') {
                    console.log(`[ConnectPhoneSession:${this.opts.contactId}] Transcript: "${event.data.transcript}" (Role: ${event.data.role}, Final: ${event.data.isFinal})`);
                    if (event.data.role === 'assistant' || event.data.role === 'ASSISTANT') {
                        this.responseText = event.data.transcript;
                    }
                }
                break;

            case 'contentStart':
                console.log(`[ConnectPhoneSession:${this.opts.contactId}] ContentStart: role=${event.data?.role}, type=${event.data?.type}`);
                if (event.data?.role === 'assistant' || event.data?.role === 'ASSISTANT') {
                    console.log(`[ConnectPhoneSession:${this.opts.contactId}] Marking session as processing in DDB`);
                    this.updateDdbStatus('processing').catch(e =>
                        console.error(`[ConnectPhoneSession:${this.opts.contactId}] DDB update failed:`, e)
                    );
                }
                break;

            case 'contentEnd':
                console.log(`[ConnectPhoneSession:${this.opts.contactId}] ContentEnd: stopReason=${event.data?.stopReason}`);
                if (event.data?.stopReason === 'END_TURN') {
                    this.processTurnEnd().catch(e =>
                        console.error(`[ConnectPhoneSession:${this.opts.contactId}] Error in processTurnEnd:`, e)
                    );
                }
                break;

            default:
                // Only log transcript/audio at debug level to avoid spam
                const etype = event.type as any;
                if (etype !== 'transcript' && etype !== 'audio') {
                    console.log(`[ConnectPhoneSession:${this.opts.contactId}] Event: ${event.type}`);
                }
                break;
        }
    }

    private async processTurnEnd(): Promise<void> {
        // Snapshot and reset per-turn accumulators atomically.
        const frames = this.audioFrames.splice(0);
        const text = this.responseText;
        this.responseText = '';

        if (frames.length === 0 && text.length === 0) {
            console.log(`[ConnectPhoneSession:${this.opts.contactId}] Turn end skipped — no content gathered in this turn`);
            return;
        }

        const lpcm24 = frames.length ? Buffer.concat(frames) : Buffer.alloc(0);
        console.log(
            `[ConnectPhoneSession:${this.opts.contactId}] Turn end — processing ${lpcm24.length} audio bytes, text="${text}"`
        );

        // ── Determine intent from response text ──────────────────────────────
        const upper = text.toUpperCase();
        let intent: 'continue' | 'transfer' | 'end' = 'continue';
        if (upper.includes('GOODBYE') || upper.includes('BYE')) intent = 'end';
        if (upper.includes('TRANSFER') || upper.includes('AGENT')) intent = 'transfer';

        // ── Store response audio as WAV in S3 ────────────────────────────────
        let audioKey = '';
        if (lpcm24.length > 0 && RESPONSE_BUCKET) {
            try {
                const pcm8k = downsample24to8kHz(lpcm24);
                const wavData = encodeWav(pcm8k);
                audioKey = `turns/${this.opts.sessionId}/${Date.now()}.wav`;

                await this.s3.send(new PutObjectCommand({
                    Bucket: RESPONSE_BUCKET,
                    Key: audioKey,
                    Body: wavData,
                    ContentType: 'audio/wav',
                }));
                console.log(`[ConnectPhoneSession:${this.opts.contactId}] WAV uploaded → s3://${RESPONSE_BUCKET}/${audioKey}`);
            } catch (e) {
                console.error(`[ConnectPhoneSession:${this.opts.contactId}] S3 upload failed:`, e);
            }
        }

        // ── Update rolling conversation history ──────────────────────────────
        if (text) {
            this.history.push({ role: 'assistant', text });
            if (this.history.length > 10) this.history = this.history.slice(-10);
        }

        // ── Update DynamoDB: status=ready so GetBotResult can return the audio ─
        if (SESSION_TABLE) {
            try {
                await this.ddb.send(new UpdateItemCommand({
                    TableName: SESSION_TABLE,
                    Key: { sessionId: { S: this.opts.sessionId } },
                    UpdateExpression:
                        'SET #s = :s, audioKey = :a, intent = :i, history = :h, #ttl = :t',
                    ExpressionAttributeNames: {
                        '#s': 'status',
                        '#ttl': 'ttl',
                    },
                    ExpressionAttributeValues: {
                        ':s': { S: 'ready' },
                        ':a': { S: audioKey },
                        ':i': { S: intent },
                        ':h': { S: JSON.stringify(this.history) },
                        ':t': { N: String(Math.floor(Date.now() / 1000) + 7200) },
                    },
                }));
                console.log(`[ConnectPhoneSession:${this.opts.contactId}] DDB updated: status=ready intent=${intent}`);
            } catch (e) {
                console.error(`[ConnectPhoneSession:${this.opts.contactId}] DDB update failed:`, e);
            }
        }
    }

    private async updateDdbStatus(status: string): Promise<void> {
        if (!SESSION_TABLE) return;
        try {
            await this.ddb.send(new UpdateItemCommand({
                TableName: SESSION_TABLE,
                Key: { sessionId: { S: this.opts.sessionId } },
                UpdateExpression: 'SET #s = :s',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: { ':s': { S: status } },
            }));
        } catch (e) {
            console.warn(`[ConnectPhoneSession:${this.opts.contactId}] DDB status update failed:`, e);
        }
    }
}

// ─── Session manager ──────────────────────────────────────────────────────────

export class ConnectSessionManager {
    private sessions = new Map<string, ConnectPhoneSession>();

    async createSession(opts: ConnectSessionOptions): Promise<void> {
        if (this.sessions.has(opts.contactId)) {
            console.warn(`[ConnectSessionManager] Session already exists for contactId=${opts.contactId}`);
            return;
        }

        const session = new ConnectPhoneSession(opts);
        this.sessions.set(opts.contactId, session);

        try {
            await session.start();
            console.log(`[ConnectSessionManager] Session created — contactId=${opts.contactId}`);
        } catch (e) {
            this.sessions.delete(opts.contactId);
            throw e;
        }
    }

    async endSession(contactId: string): Promise<void> {
        const session = this.sessions.get(contactId);
        if (!session) {
            console.warn(`[ConnectSessionManager] No session found for contactId=${contactId}`);
            return;
        }
        this.sessions.delete(contactId);
        await session.end();
    }

    hasSession(contactId: string): boolean {
        return this.sessions.has(contactId);
    }

    activeCount(): number {
        return this.sessions.size;
    }
}
