import {
    TranscribeStreamingClient,
    StartStreamTranscriptionCommand,
    AudioStream
} from "@aws-sdk/client-transcribe-streaming";

export class TranscribeClientWrapper {
    private client: TranscribeStreamingClient;
    private region: string;

    constructor(region: string = 'us-east-1') {
        this.region = region;
        this.client = new TranscribeStreamingClient({ region });
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
            let fullText = "";

            for await (const event of response.TranscriptResultStream || []) {
                if (event.TranscriptEvent) {
                    const results = event.TranscriptEvent.Transcript?.Results;
                    if (results && results.length > 0) {
                        if (!results[0].IsPartial) {
                            fullText += results[0].Alternatives?.[0]?.Transcript + " ";
                        }
                    }
                }
            }
            return fullText.trim();
        } catch (error) {
            console.error('[Transcribe] Error:', error);
            return "";
        }
    }
}
