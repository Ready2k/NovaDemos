'use strict';
/**
 * ProcessBotTurn — called by Amazon Connect after GetParticipantInput completes.
 *
 * Flow:
 *   1. Load session state (conversation history, last KVS fragment) from DynamoDB.
 *   2. Read caller audio from Kinesis Video Streams (MKV container, G.711 μ-law @ 8 kHz).
 *   3. Decode G.711 → PCM16 and upsample 8 kHz → 16 kHz.
 *   4. Open a single-turn Nova Sonic bidirectional stream, send audio, collect response.
 *   5. Store response audio (LPCM 24 kHz) in S3.
 *   6. Persist updated history and KVS fragment position back to DynamoDB.
 *   7. Return { intent, responseText, responseAudioKey } to the contact flow.
 *
 * The contact flow then speaks responseText via Polly TTS (MessageParticipant block)
 * and branches on intent (continue → loop, transfer → queue, end → disconnect).
 */

const { randomUUID }                                               = require('crypto');
const { DynamoDBClient, GetItemCommand, UpdateItemCommand }        = require('@aws-sdk/client-dynamodb');
const { KinesisVideoClient, GetDataEndpointCommand }               = require('@aws-sdk/client-kinesis-video');
const { KinesisVideoMediaClient, GetMediaCommand }                 = require('@aws-sdk/client-kinesis-video-media');
const { BedrockRuntimeClient,
        InvokeModelWithBidirectionalStreamCommand }                = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, PutObjectCommand }                               = require('@aws-sdk/client-s3');

const ddb = new DynamoDBClient({});
const s3  = new S3Client({});

const SESSION_TABLE   = process.env.SESSION_TABLE;
const RESPONSE_BUCKET = process.env.RESPONSE_BUCKET;
const MODEL_ID        = process.env.NOVA_SONIC_MODEL_ID || 'amazon.nova-2-sonic-v1:0';
const REGION          = process.env.AWS_REGION || 'us-east-1';

// Recent Interactions config (can be overridden via environment variables)
const RI_HOURS_WINDOW = parseInt(process.env.RECENT_INTERACTIONS_HOURS_WINDOW || '48', 10);
const RI_MAX_COUNT    = parseInt(process.env.RECENT_INTERACTIONS_MAX_COUNT    || '7',  10);

// AgentCore Gateway URL for tool execution (optional — tool calls silently no-op if not set)
const AGENT_GATEWAY_URL = process.env.AGENT_GATEWAY_URL || '';

// 100 ms of silence at 16 kHz PCM16 — used to prime Nova Sonic's audio buffer.
const SILENCE_FRAME   = Buffer.alloc(3200, 0);
// Send audio to Nova Sonic in 4 096-sample (8 192-byte) chunks.
const AUDIO_CHUNK     = 8192;
// Stop reading from KVS after 10 s of audio (16 kHz × 2 bytes × 10 s).
const MAX_KVS_BYTES   = 16000 * 2 * 10;

// ─── EBML / MKV helpers ───────────────────────────────────────────────────────

/**
 * Read an EBML variable-length integer (VINT) from buf at position pos.
 * Returns { val, len } where len is the number of bytes consumed.
 */
function readVint(buf, pos) {
    const b = buf[pos];
    let mask, len;
    if      (b >= 0x80) { mask = 0x7F; len = 1; }
    else if (b >= 0x40) { mask = 0x3F; len = 2; }
    else if (b >= 0x20) { mask = 0x1F; len = 3; }
    else if (b >= 0x10) { mask = 0x0F; len = 4; }
    else if (b >= 0x08) { mask = 0x07; len = 5; }
    else if (b >= 0x04) { mask = 0x03; len = 6; }
    else if (b >= 0x02) { mask = 0x01; len = 7; }
    else                { mask = 0x00; len = 8; }
    let val = b & mask;
    for (let i = 1; i < len; i++) val = val * 256 + buf[pos + i];
    return { val, len };
}

/**
 * Scan buf for MKV SimpleBlock (0xA3) and Block (0xA1) elements and
 * concatenate the raw audio payloads.
 *
 * SimpleBlock / Block layout (after the element ID byte):
 *   DataSize (VINT) | TrackNumber (VINT) | Timecode (2 bytes) | Flags (1 byte) | Payload
 */
function extractAudioFromMkv(buf) {
    const frames = [];
    let pos = 0;
    while (pos < buf.length - 4) {
        const id = buf[pos];
        if (id === 0xA3 || id === 0xA1) {
            pos++;
            if (pos >= buf.length) break;
            const sz        = readVint(buf, pos);
            pos            += sz.len;
            const blockStart = pos;
            const track     = readVint(buf, pos);
            const headerLen = track.len + 3;          // track vint + 2-byte timecode + 1-byte flags
            const payloadLen = sz.val - headerLen;
            if (payloadLen > 0 && payloadLen < 65536) {
                frames.push(buf.slice(blockStart + headerLen, blockStart + sz.val));
            }
            pos = blockStart + sz.val;
        } else {
            pos++;
        }
    }
    return frames.length ? Buffer.concat(frames) : Buffer.alloc(0);
}

// ─── Audio conversion ─────────────────────────────────────────────────────────

/** G.711 μ-law byte → 16-bit linear PCM sample. */
function ulawToSample(u) {
    u = ~u & 0xFF;
    const sign     = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0F;
    let sample     = ((mantissa << 3) + 0x84) << (exponent + 1);
    return sign ? -sample : sample;
}

/** Convert a G.711 μ-law buffer (8 kHz) to PCM16 LE (still 8 kHz). */
function ulawToLinear16(ulaw) {
    const pcm = Buffer.alloc(ulaw.length * 2);
    for (let i = 0; i < ulaw.length; i++) {
        const s = Math.max(-32768, Math.min(32767, ulawToSample(ulaw[i])));
        pcm.writeInt16LE(s, i * 2);
    }
    return pcm;
}

/**
 * Upsample PCM16 LE from 8 kHz to 16 kHz using linear interpolation.
 * Each input sample pair produces two output samples (doubles the buffer size).
 */
function resample8to16kHz(pcm8) {
    const frames = Math.floor(pcm8.length / 2);
    if (frames === 0) return Buffer.alloc(0);
    const out    = Buffer.alloc(frames * 4);
    for (let i = 0; i < frames - 1; i++) {
        const s0 = pcm8.readInt16LE(i * 2);
        const s1 = pcm8.readInt16LE((i + 1) * 2);
        out.writeInt16LE(s0,                         i * 4);
        out.writeInt16LE(Math.round((s0 + s1) / 2), i * 4 + 2);
    }
    const last = pcm8.readInt16LE((frames - 1) * 2);
    out.writeInt16LE(last, (frames - 1) * 4);
    out.writeInt16LE(last, (frames - 1) * 4 + 2);
    return out;
}

// ─── KVS audio reader ─────────────────────────────────────────────────────────

async function readKvsAudio(streamArn, startFragment, startTimestamp) {
    // Derive the KVS region from the stream ARN (may differ from Lambda region).
    const regionMatch = streamArn.match(/^arn:aws:kinesisvideo:([^:]+):/);
    const kvsRegion   = regionMatch ? regionMatch[1] : REGION;

    const kvs = new KinesisVideoClient({ region: kvsRegion });
    const { DataEndpoint } = await kvs.send(new GetDataEndpointCommand({
        StreamARN: streamArn,
        APIName:   'GET_MEDIA',
    }));

    const kvsMedia = new KinesisVideoMediaClient({ region: kvsRegion, endpoint: DataEndpoint });
    // On the first turn startFragment is the StartFragmentNumber (stream start),
    // so use PRODUCER_TIMESTAMP to reliably find the caller's audio.
    // On subsequent turns startFragment is the StopFragmentNumber from the previous
    // turn, so AfterFragmentNumber correctly picks up where we left off.
    let selector;
    if (!startFragment) {
        selector = { StartSelectorType: 'EARLIEST' };
    } else if (startTimestamp) {
        selector = { StartSelectorType: 'PRODUCER_TIMESTAMP', ProducerStartTimestamp: new Date(parseInt(startTimestamp, 10)) };
    } else {
        selector = { StartSelectorType: 'FRAGMENT_NUMBER', AfterFragmentNumber: startFragment };
    }

    const resp = await kvsMedia.send(new GetMediaCommand({
        StreamARN:     streamArn,
        StartSelector: selector,
    }));

    const rawChunks = [];
    let totalBytes  = 0;
    try {
        for await (const chunk of resp.Payload) {
            if (chunk.PayloadChunk?.Payload) {
                rawChunks.push(Buffer.from(chunk.PayloadChunk.Payload));
                totalBytes += chunk.PayloadChunk.Payload.byteLength;
                if (totalBytes >= MAX_KVS_BYTES) break;
            } else if (chunk.EndOfShard) {
                break;
            }
        }
    } catch (e) {
        // The stream may close naturally once the user's speech ends.
        console.log('KVS stream ended:', e.message);
    }

    const raw   = Buffer.concat(rawChunks);
    const audio = extractAudioFromMkv(raw);   // raw MKV → audio payload bytes
    const pcm8  = ulawToLinear16(audio);       // G.711 μ-law → PCM16 @ 8 kHz
    const pcm16 = resample8to16kHz(pcm8);      // 8 kHz → 16 kHz
    console.log(`KVS: ${raw.length} raw bytes → ${audio.length} audio bytes → ${pcm16.length} PCM16@16kHz bytes`);
    return pcm16;
}

// ─── Nova Sonic single-turn exchange ──────────────────────────────────────────

/**
 * Open a fresh Nova Sonic bidirectional stream, send the caller's audio in
 * one complete turn (sessionStart → promptStart → system prompt → user audio
 * → promptEnd → sessionEnd), then drain the output stream to collect the
 * assistant's audio and text response.
 *
 * @param {Buffer} audioBuffer  PCM16 LE @ 16 kHz mono caller audio.
 * @param {string} systemPrompt Full system prompt text (includes history).
 * @returns {{ audio: Buffer, text: string }}
 */
async function callNovaSonic(audioBuffer, systemPrompt) {
    const bedrock    = new BedrockRuntimeClient({ region: REGION });
    const promptName = `prompt-${Date.now()}`;
    const sysName    = `system-${Date.now()}`;
    const audioName  = `audio-${Date.now()}`;

    /** Wrap a plain event payload in the SDK's chunk envelope. */
    function ev(payload) {
        return { chunk: { bytes: Buffer.from(JSON.stringify({ event: payload })) } };
    }

    // Slice audio into chunks that match the browser WebSocket chunk size.
    const chunks = [];
    for (let off = 0; off < audioBuffer.length; off += AUDIO_CHUNK) {
        chunks.push(audioBuffer.slice(off, off + AUDIO_CHUNK));
    }

    const inputStream = (async function* () {
        // 1. Session start — match inferenceConfiguration used in sonic-client.ts.
        yield ev({
            sessionStart: {
                inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
                turnDetectionConfiguration: { endpointingSensitivity: 'HIGH' },
            },
        });

        // 2. Prompt start — request both text and 24 kHz LPCM audio output, with tool definitions.
        yield ev({
            promptStart: {
                promptName,
                textOutputConfiguration: { mediaType: 'text/plain' },
                audioOutputConfiguration: {
                    mediaType:        'audio/lpcm',
                    sampleRateHertz:  24000,
                    sampleSizeBits:   16,
                    channelCount:     1,
                    voiceId:          'matthew',
                    encoding:         'base64',
                    audioType:        'SPEECH',
                },
                toolConfiguration: {
                    tools: [
                        {
                            toolSpec: {
                                name: 'manage_recent_interactions',
                                description: 'Retrieves history/disputes or publishes summary. Use only when instructed.',
                                inputSchema: {
                                    json: JSON.stringify({
                                        type: 'object',
                                        properties: {
                                            action:        { type: 'string', enum: ['RETRIEVE', 'PUBLISH'] },
                                            accountNumber: { type: 'string' },
                                            sortCode:      { type: 'string' },
                                            hoursWindow:   { type: 'number' },
                                            maxCount:      { type: 'number' },
                                            summary:       { type: 'string' },
                                            outcome:       { type: 'string' },
                                        },
                                        required: ['action', 'accountNumber', 'sortCode'],
                                    }),
                                },
                            },
                        },
                    ],
                },
            },
        });

        // 3. System prompt content block.
        yield ev({ contentStart: { promptName, contentName: sysName, type: 'TEXT', interactive: false, role: 'SYSTEM', textInputConfiguration: { mediaType: 'text/plain' } } });
        yield ev({ textInput:    { promptName, contentName: sysName, content: systemPrompt } });
        yield ev({ contentEnd:   { promptName, contentName: sysName } });

        // 4. User audio content block.
        yield ev({
            contentStart: {
                promptName, contentName: audioName,
                type: 'AUDIO', interactive: true, role: 'USER',
                audioInputConfiguration: {
                    mediaType:       'audio/lpcm',
                    sampleRateHertz: 16000,
                    sampleSizeBits:  16,
                    channelCount:    1,
                    audioType:       'SPEECH',
                    encoding:        'base64',
                },
            },
        });
        // Prime the audio buffer with silence (required by Nova Sonic).
        yield ev({ audioInput: { promptName, contentName: audioName, content: SILENCE_FRAME.toString('base64') } });
        // Send caller audio in chunks.
        for (const chunk of chunks) {
            yield ev({ audioInput: { promptName, contentName: audioName, content: chunk.toString('base64') } });
        }
        yield ev({ contentEnd: { promptName, contentName: audioName } });

        // 5. End prompt and session.
        yield ev({ promptEnd:   { promptName } });
        yield ev({ sessionEnd:  {} });
    })();

    const cmd      = new InvokeModelWithBidirectionalStreamCommand({ modelId: MODEL_ID, body: inputStream });
    const response = await bedrock.send(cmd);

    const audioFrames = [];
    let   responseText = '';

    for await (const event of response.body) {
        if (!event.chunk?.bytes) continue;
        const raw  = JSON.parse(Buffer.from(event.chunk.bytes).toString());
        const data = raw.event || raw;

        if (data.audioOutput?.content) {
            audioFrames.push(Buffer.from(data.audioOutput.content, 'base64'));
        }
        if (data.textOutput?.content) {
            responseText += data.textOutput.content;
        }

        // Tool call handling: forward to AgentCore Gateway if configured.
        if (data.toolUse && AGENT_GATEWAY_URL) {
            const { toolUseId, name, input } = data.toolUse;
            console.log(`[Lambda] Tool call: ${name}`, JSON.stringify(input));
            let toolResult = '{"error":"Gateway not available"}';
            try {
                const gwResponse = await fetch(`${AGENT_GATEWAY_URL}/invoke`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toolName: name, toolInput: input }),
                });
                toolResult = await gwResponse.text();
                console.log(`[Lambda] Tool result for ${name}:`, toolResult.substring(0, 200));
            } catch (err) {
                console.error(`[Lambda] Tool call failed for ${name}:`, err.message);
            }
            // Note: in a single-turn Lambda call the tool result cannot be fed back into the
            // same stream. Log it for observability; a multi-turn pattern would be needed to
            // deliver it back to Nova Sonic. Callers requiring tool execution should use the
            // WebSocket server path instead.
        }
    }

    return {
        audio: audioFrames.length ? Buffer.concat(audioFrames) : Buffer.alloc(0),
        text:  responseText.trim(),
    };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
    console.log('ProcessBotTurn event:', JSON.stringify(event));

    const cd        = event.Details?.ContactData ?? {};
    const contactId = cd.ContactId ?? event.ContactId ?? 'unknown';
    const sessionId = `connect-${contactId}`;
    const audio     = cd.MediaStreams?.Customer?.Audio ?? {};
    const streamArn = audio.StreamARN ?? '';

    // ── 1. Load session state ────────────────────────────────────────────────
    let history      = [];
    let lastFragment = audio.StartFragmentNumber ?? '';
    try {
        const { Item } = await ddb.send(new GetItemCommand({
            TableName: SESSION_TABLE,
            Key: { sessionId: { S: sessionId } },
        }));
        if (Item) {
            history      = JSON.parse(Item.history?.S ?? '[]');
            lastFragment = Item.lastFragment?.S || lastFragment;
        }
    } catch (e) {
        console.warn('Session load failed:', e.message);
    }

    // ── 2. Read caller audio from KVS ────────────────────────────────────────
    // Pass StartTimestamp only on the first turn (when lastFragment === StartFragmentNumber)
    // so readKvsAudio uses PRODUCER_TIMESTAMP for a reliable start position.
    const isFirstTurn   = lastFragment === (audio.StartFragmentNumber ?? '');
    const startTimestamp = isFirstTurn ? (audio.StartTimestamp ?? null) : null;

    let callerAudio = Buffer.alloc(0);
    if (streamArn) {
        try {
            callerAudio = await readKvsAudio(streamArn, lastFragment, startTimestamp);
        } catch (e) {
            console.error('KVS read failed:', e);
        }
    } else {
        console.warn('No KVS streamArn in contact data; skipping audio read');
    }

    // Guard: < 100 ms of audio suggests silence or a flow error — skip the turn.
    if (callerAudio.length < 3200) {
        console.warn('Insufficient audio (<100 ms), returning continue');
        return { intent: 'continue', responseText: '' };
    }

    // ── 3. Build system prompt with conversation history ─────────────────────
    const historyContext = history.length
        ? '\n\nConversation so far:\n' + history.map(h => `${h.role}: ${h.text}`).join('\n')
        : '';
    const systemPrompt =
        'You are a helpful voice assistant for a banking customer service centre. ' +
        'Respond naturally and concisely in one or two sentences. ' +
        'If the caller wants to end the call, include the word GOODBYE in your response. ' +
        'If the caller wants to speak to a human agent, include the word TRANSFER in your response.\n\n' +
        'After identity verification succeeds, immediately call the manage_recent_interactions tool ' +
        `with action=RETRIEVE, hoursWindow=${RI_HOURS_WINDOW}, maxCount=${RI_MAX_COUNT}. ` +
        'Do NOT announce this call. Review the results and if there are open or unresolved interactions ' +
        'within the configured window, use your judgment to assess whether this is the likely reason for ' +
        'the current call. If confident, re-affirm naturally — for example: "I can see you were recently ' +
        'in touch about X — is that what you\'re calling about today?" Only re-affirm for open interactions.\n\n' +
        `[RECENT INTERACTIONS CONFIG — HIDDEN]\n` +
        `hoursWindow=${RI_HOURS_WINDOW}, maxCount=${RI_MAX_COUNT}` +
        historyContext;

    // ── 4. Call Nova Sonic ───────────────────────────────────────────────────
    const { audio: responseAudio, text: responseText } =
        await callNovaSonic(callerAudio, systemPrompt);
    console.log(`Nova Sonic: "${responseText}" (${responseAudio.length} audio bytes)`);

    // ── 5. Determine intent from response text ───────────────────────────────
    const upper  = responseText.toUpperCase();
    let   intent = 'continue';
    if (upper.includes('GOODBYE') || upper.includes('BYE')) intent = 'end';
    if (upper.includes('TRANSFER') || upper.includes('AGENT')) intent = 'transfer';

    // ── 6. Store response audio in S3 ────────────────────────────────────────
    let responseAudioKey = '';
    if (responseAudio.length > 0 && RESPONSE_BUCKET) {
        responseAudioKey = `turns/${sessionId}/${Date.now()}.lpcm`;
        await s3.send(new PutObjectCommand({
            Bucket:      RESPONSE_BUCKET,
            Key:         responseAudioKey,
            Body:        responseAudio,
            ContentType: 'audio/lpcm',
        }));
        console.log(`Stored response audio: s3://${RESPONSE_BUCKET}/${responseAudioKey}`);
    }

    // ── 7. Update session history and KVS fragment pointer ───────────────────
    if (responseText) history.push({ role: 'assistant', text: responseText });
    if (history.length > 10) history = history.slice(-10); // rolling 10-turn window

    try {
        await ddb.send(new UpdateItemCommand({
            TableName: SESSION_TABLE,
            Key: { sessionId: { S: sessionId } },
            UpdateExpression: 'SET history = :h, lastFragment = :f, #ttl = :t',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: {
                ':h':  { S: JSON.stringify(history) },
                ':f':  { S: audio.StopFragmentNumber ?? lastFragment },
                ':t':  { N: String(Math.floor(Date.now() / 1000) + 7200) },
            },
        }));
    } catch (e) {
        console.warn('Session update failed:', e.message);
    }

    return { intent, responseText, responseAudioKey, sessionId };
};
