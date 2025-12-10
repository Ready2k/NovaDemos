import {
    TranscribeStreamingClient,
    StartStreamTranscriptionCommand,
    AudioStream
} from "@aws-sdk/client-transcribe-streaming";
import * as dotenv from 'dotenv';

dotenv.config();

export class TranscribeClientWrapper {
    private client: TranscribeStreamingClient;
    private region: string;

    constructor(region: string = 'us-east-1') {
        this.region = region;
        
        // Use the same credential configuration as other AWS services
        const clientConfig: any = { region };
        
        if (process.env.NOVA_AWS_ACCESS_KEY_ID && process.env.NOVA_AWS_SECRET_ACCESS_KEY) {
            clientConfig.credentials = {
                accessKeyId: process.env.NOVA_AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
            };
        } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            clientConfig.credentials = {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            };
        }
        
        this.client = new TranscribeStreamingClient(clientConfig);
    }

    /**
     * Transcribes a buffer of audio (PCM 16kHz)
     * Note: For true streaming, we'd keep the stream open. 
     * For this demo, we'll do a "shot" transcription of the accumulated buffer.
     */
    async transcribe(audioBuffer: Buffer): Promise<string> {
        if (audioBuffer.length === 0) return "";

        // Create an async generator for the audio stream
        async function* audioStream() {
            const chunkSize = 16000; // 1 second chunks roughly
            for (let i = 0; i < audioBuffer.length; i += chunkSize) {
                yield { AudioEvent: { AudioChunk: audioBuffer.subarray(i, i + chunkSize) } };
            }
        }

        const command = new StartStreamTranscriptionCommand({
            LanguageCode: "en-US",
            MediaEncoding: "pcm",
            MediaSampleRateHertz: 16000,
            AudioStream: audioStream()
        });

        try {
            const response = await this.client.send(command);
            let lastTranscript = "";
            let fullText = "";

            for await (const event of response.TranscriptResultStream || []) {
                if (event.TranscriptEvent) {
                    const results = event.TranscriptEvent.Transcript?.Results;
                    if (results && results.length > 0) {
                        const transcript = results[0].Alternatives?.[0]?.Transcript;
                        if (transcript) {
                            lastTranscript = transcript;
                        }

                        if (!results[0].IsPartial) {
                            fullText += transcript + " ";
                        }
                    }
                }
            }
            // Fallback: If no final segment was received, use the last partial
            if (!fullText.trim() && lastTranscript) {
                console.log('[Transcribe] Using partial result as fallback');
                fullText = lastTranscript;
            }

            return fullText.trim();
        } catch (error) {
            console.error('[Transcribe] Error:', error);
            return "";
        }
    }
}
