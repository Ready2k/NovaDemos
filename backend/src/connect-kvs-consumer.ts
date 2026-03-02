/**
 * connect-kvs-consumer.ts
 * Real-time KVS audio consumer for Amazon Connect calls.
 *
 * Streams caller audio from Kinesis Video Streams (MKV/G.711 μ-law 8 kHz)
 * and delivers decoded PCM16 16 kHz chunks to a callback as they arrive,
 * enabling Nova Sonic to start processing before the caller finishes speaking.
 */

import { KinesisVideoClient, GetDataEndpointCommand } from '@aws-sdk/client-kinesis-video';
import { KinesisVideoMediaClient, GetMediaCommand } from '@aws-sdk/client-kinesis-video-media';
import { extractAudioFromMkv, ulawToLinear16, resample8to16kHz } from './audio-converter';

const REGION = process.env.AWS_REGION || 'us-east-1';

export class ConnectKvsConsumer {
    private stopped = false;
    private lastFragment = '';

    /** Signal the consumer to stop reading from KVS on the next iteration. */
    stop(): void {
        this.stopped = true;
    }

    /**
     * The last KVS fragment number seen, updated as MKV metadata arrives.
     * Useful for subsequent turns to resume from where this one left off.
     */
    getLastFragment(): string {
        return this.lastFragment;
    }

    /**
     * Begin streaming caller audio from KVS.
     *
     * @param streamArn       KVS stream ARN from Connect media streaming data.
     * @param startFragment   Fragment number to start from (empty = earliest).
     * @param startTimestamp  Producer timestamp for first-turn PRODUCER_TIMESTAMP selector.
     * @param onAudio         Called with each decoded PCM16 16 kHz Buffer chunk.
     * @param onEnd           Called once when the stream ends or stop() is called.
     */
    async startStreaming(
        streamArn: string,
        startFragment: string,
        startTimestamp: string | null,
        onAudio: (pcm16: Buffer) => void,
        onEnd: () => void,
    ): Promise<void> {
        // Derive KVS region from the stream ARN (may differ from the ECS region).
        const regionMatch = streamArn.match(/^arn:aws:kinesisvideo:([^:]+):/);
        const kvsRegion = regionMatch ? regionMatch[1] : REGION;

        const kvs = new KinesisVideoClient({ region: kvsRegion });
        const { DataEndpoint } = await kvs.send(new GetDataEndpointCommand({
            StreamARN: streamArn,
            APIName: 'GET_MEDIA',
        }));

        const kvsMedia = new KinesisVideoMediaClient({ region: kvsRegion, endpoint: DataEndpoint });

        // Choose start selector:
        //   No fragment  → EARLIEST (Connect only starts the KVS stream when
        //                  media streaming is enabled, so EARLIEST = call start)
        //   Has fragment → FRAGMENT_NUMBER (resume after the given fragment)
        //
        // PRODUCER_TIMESTAMP is avoided: the AWS SDK v3 serialises the Date
        // incorrectly for some KVS stream configurations, causing a 400 error.
        const selector: any = startFragment
            ? { StartSelectorType: 'FRAGMENT_NUMBER', AfterFragmentNumber: startFragment }
            : { StartSelectorType: 'EARLIEST' };

        const resp = await kvsMedia.send(new GetMediaCommand({
            StreamARN: streamArn,
            StartSelector: selector,
        }));

        console.log(`[ConnectKvsConsumer] Streaming started — streamArn=${streamArn}`);

        // Accumulate raw MKV bytes and track how many audio bytes we've already
        // delivered, so we can emit only the newly extracted audio on each chunk.
        const rawAccumulator: Buffer[] = [];
        let sentAudioBytes = 0;
        let totalChunks = 0;
        let payloadChunks = 0;

        try {
            for await (const chunk of resp.Payload as AsyncIterable<any>) {
                if (this.stopped) break;
                totalChunks++;

                let data: Uint8Array | undefined;
                if (chunk.PayloadChunk?.Payload) {
                    payloadChunks++;
                    data = chunk.PayloadChunk.Payload;
                } else if (chunk.EndOfShard) {
                    console.log('[ConnectKvsConsumer] EndOfShard received');
                    break;
                } else if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk) || (chunk && typeof chunk === 'object' && 'length' in chunk)) {
                    // Broad check for raw bytes (Uint8Array, Buffer, or array-like from SDK stream)
                    payloadChunks++;
                    data = chunk as Uint8Array;
                }

                if (data) {
                    rawAccumulator.push(Buffer.from(data));

                    // Extract all audio from the accumulated MKV data.
                    const combined = Buffer.concat(rawAccumulator);
                    const audio = extractAudioFromMkv(combined);

                    if (audio.length > sentAudioBytes) {
                        const newAudio = audio.slice(sentAudioBytes);
                        const pcm8 = ulawToLinear16(newAudio);
                        const pcm16 = resample8to16kHz(pcm8);
                        if (pcm16.length > 0) {
                            onAudio(pcm16);
                        }
                        sentAudioBytes = audio.length;
                    }
                } else {
                    console.log('[ConnectKvsConsumer] Unknown chunk type:', chunk?.constructor?.name || typeof chunk, JSON.stringify(Object.keys(chunk || {})));
                }
            }
        } catch (e: any) {
            // KVS streams close naturally when the caller stops speaking.
            console.log('[ConnectKvsConsumer] Stream ended:', e.message);
        }

        const accumulatedBytes = rawAccumulator.reduce((n, b) => n + b.length, 0);
        console.log(
            `[ConnectKvsConsumer] Loop done — totalChunks=${totalChunks} payloadChunks=${payloadChunks} ` +
            `accumulatedBytes=${accumulatedBytes} extractedAudioBytes=${sentAudioBytes}`
        );

        console.log(
            `[ConnectKvsConsumer] Done — delivered ${sentAudioBytes} raw audio bytes ` +
            `(${Math.round(sentAudioBytes / 8000 / 2 * 1000)} ms @ 8 kHz)`
        );
        onEnd();
    }
}
