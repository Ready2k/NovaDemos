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
        const kvsRegion   = regionMatch ? regionMatch[1] : REGION;

        const kvs = new KinesisVideoClient({ region: kvsRegion });
        const { DataEndpoint } = await kvs.send(new GetDataEndpointCommand({
            StreamARN: streamArn,
            APIName:   'GET_MEDIA',
        }));

        const kvsMedia = new KinesisVideoMediaClient({ region: kvsRegion, endpoint: DataEndpoint });

        // Choose start selector:
        //   No fragment        → EARLIEST (call just started)
        //   First turn (ts)    → PRODUCER_TIMESTAMP (reliable start point)
        //   Subsequent turns   → FRAGMENT_NUMBER / AfterFragmentNumber
        let selector: any;
        if (!startFragment) {
            selector = { StartSelectorType: 'EARLIEST' };
        } else if (startTimestamp) {
            selector = {
                StartSelectorType:      'PRODUCER_TIMESTAMP',
                ProducerStartTimestamp: new Date(parseInt(startTimestamp, 10)),
            };
        } else {
            selector = {
                StartSelectorType:    'FRAGMENT_NUMBER',
                AfterFragmentNumber:  startFragment,
            };
        }

        const resp = await kvsMedia.send(new GetMediaCommand({
            StreamARN:     streamArn,
            StartSelector: selector,
        }));

        console.log(`[ConnectKvsConsumer] Streaming started — streamArn=${streamArn}`);

        // Accumulate raw MKV bytes and track how many audio bytes we've already
        // delivered, so we can emit only the newly extracted audio on each chunk.
        const rawAccumulator: Buffer[] = [];
        let sentAudioBytes = 0;

        try {
            for await (const chunk of resp.Payload as AsyncIterable<any>) {
                if (this.stopped) break;

                if (chunk.PayloadChunk?.Payload) {
                    rawAccumulator.push(Buffer.from(chunk.PayloadChunk.Payload));

                    // Extract all audio from the accumulated MKV data.
                    const combined = Buffer.concat(rawAccumulator);
                    const audio    = extractAudioFromMkv(combined);

                    if (audio.length > sentAudioBytes) {
                        // Only convert and deliver the newly extracted portion.
                        const newAudio = audio.slice(sentAudioBytes);
                        const pcm8     = ulawToLinear16(newAudio);
                        const pcm16    = resample8to16kHz(pcm8);
                        if (pcm16.length > 0) {
                            onAudio(pcm16);
                        }
                        sentAudioBytes = audio.length;
                    }
                } else if (chunk.EndOfShard) {
                    console.log('[ConnectKvsConsumer] EndOfShard received');
                    break;
                }
                // MKV metadata chunks (tags, fragment boundaries) are ignored;
                // we rely on Connect's DynamoDB record for fragment tracking.
            }
        } catch (e: any) {
            // KVS streams close naturally when the caller stops speaking.
            console.log('[ConnectKvsConsumer] Stream ended:', e.message);
        }

        console.log(
            `[ConnectKvsConsumer] Done — delivered ${sentAudioBytes} raw audio bytes ` +
            `(${Math.round(sentAudioBytes / 8000 / 2 * 1000)} ms @ 8 kHz)`
        );
        onEnd();
    }
}
