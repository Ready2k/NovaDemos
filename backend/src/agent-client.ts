import {
    TranscribeStreamingClient,
    StartStreamTranscriptionCommand,
    AudioStream
} from "@aws-sdk/client-transcribe-streaming";
import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand
} from "@aws-sdk/client-bedrock-agent-runtime";
import {
    BedrockRuntimeClient,
    InvokeModelWithResponseStreamCommand
} from "@aws-sdk/client-bedrock-runtime";

export class AgentClient {
    private transcribeClient: TranscribeStreamingClient;
    private agentClient: BedrockAgentRuntimeClient;
    private bedrockClient: BedrockRuntimeClient;

    private sessionId: string;
    private agentId: string;
    private agentAliasId: string;
    private region: string;

    // Audio State
    private audioBuffer: Buffer[] = [];
    private isTranscribing = false;
    private silenceThreshold = 500; // ms
    private lastAudioTime = 0;
    private silenceTimer: NodeJS.Timeout | null = null;

    constructor(config: any) {
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.agentId = config.agentId || process.env.AGENT_ID;
        this.agentAliasId = config.agentAliasId || process.env.AGENT_ALIAS_ID;

        this.transcribeClient = new TranscribeStreamingClient({ region: this.region, credentials: config.credentials });
        this.agentClient = new BedrockAgentRuntimeClient({ region: this.region, credentials: config.credentials });
        this.bedrockClient = new BedrockRuntimeClient({ region: this.region, credentials: config.credentials });

        this.sessionId = `session-${Date.now()}`;
    }

    async processAudio(chunk: Buffer, onAudioOutput: (audio: Buffer) => void, onTranscript: (text: string, role: string) => void) {
        // 1. Accumulate Audio (Simplification: We'll need a proper stream for Transcribe)
        // For a real-time system, we should have a persistent Transcribe stream open.
        // However, handling the async generator for Transcribe input while receiving chunks is complex.

        // Let's implement a VAD (Voice Activity Detection) trigger.
        // If we receive audio, we push to a buffer.
        // If silence is detected (no chunks for X ms), we send the buffer to Transcribe -> Agent -> TTS.

        this.audioBuffer.push(chunk);
        this.lastAudioTime = Date.now();

        if (this.silenceTimer) clearTimeout(this.silenceTimer);

        this.silenceTimer = setTimeout(async () => {
            await this.flushAndProcess(onAudioOutput, onTranscript);
        }, this.silenceThreshold);
    }

    private async flushAndProcess(onAudioOutput: (audio: Buffer) => void, onTranscript: (text: string, role: string) => void) {
        if (this.audioBuffer.length === 0) return;

        const fullAudio = Buffer.concat(this.audioBuffer);
        this.audioBuffer = []; // Clear buffer

        console.log(`[AgentClient] Processing ${fullAudio.length} bytes of audio...`);

        try {
            // 1. Transcribe (Audio -> Text)
            // Note: For short commands, non-streaming Transcribe might be easier, but streaming is faster.
            // Let's use a simple "Transcribe This Buffer" approach for now using the streaming client but as a single shot.
            const text = await this.transcribeAudio(fullAudio);
            if (!text) return;

            onTranscript(text, 'user');
            console.log(`[AgentClient] User said: ${text}`);

            // 2. Agent (Text -> Text)
            const agentResponse = await this.invokeAgent(text);
            onTranscript(agentResponse, 'assistant');
            console.log(`[AgentClient] Agent replied: ${agentResponse}`);

            // 3. TTS (Text -> Audio)
            await this.synthesizeSpeech(agentResponse, onAudioOutput);

        } catch (error) {
            console.error('[AgentClient] Error processing turn:', error);
        }
    }

    private async transcribeAudio(audio: Buffer): Promise<string> {
        // Create an async generator for the audio stream
        async function* audioStream() {
            // Yield the audio in chunks (max 32KB for Transcribe)
            const chunkSize = 16000;
            for (let i = 0; i < audio.length; i += chunkSize) {
                yield { AudioEvent: { AudioChunk: audio.subarray(i, i + chunkSize) } };
            }
        }

        const command = new StartStreamTranscriptionCommand({
            LanguageCode: "en-US",
            MediaEncoding: "pcm",
            MediaSampleRateHertz: 16000,
            AudioStream: audioStream()
        });

        const response = await this.transcribeClient.send(command);
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
    }

    private async invokeAgent(text: string): Promise<string> {
        const command = new InvokeAgentCommand({
            agentId: this.agentId,
            agentAliasId: this.agentAliasId,
            sessionId: this.sessionId,
            inputText: text
        });

        const response = await this.agentClient.send(command);
        let completion = "";
        const decoder = new TextDecoder("utf-8");

        for await (const event of response.completion || []) {
            if (event.chunk && event.chunk.bytes) {
                completion += decoder.decode(event.chunk.bytes);
            }
        }
        return completion;
    }

    private async synthesizeSpeech(text: string, onAudioOutput: (audio: Buffer) => void) {
        // Use Nova 2 for TTS via InvokeModelWithResponseStream
        const request = {
            schemaVersion: "messages-v1",
            messages: [
                {
                    role: "user",
                    content: [
                        { text: text }
                    ]
                }
            ],
            inferenceConfig: {
                max_new_tokens: 300
            }
        };

        // Note: Nova 2 doesn't have a direct "TTS" API in Bedrock yet like Polly.
        // It's a speech-to-speech model.
        // To get TTS, we can use the same "Speech-to-Speech" flow but provide TEXT input and expect AUDIO output.
        // Wait, Nova 2 Sonic IS the model we used in SonicClient.
        // We can use the same `InvokeModelWithBidirectionalStreamCommand` but send TEXT input events.

        // Actually, for simple TTS of the Agent's response, we might be better off using Polly 
        // OR creating a temporary Sonic session just for this utterance.
        // Creating a Sonic session for every sentence is heavy.

        // Alternative: Use Polly for now? Or stick to the "Nova Voice" requirement?
        // The user specifically said "use it with Nova 2 Sonic".
        // This implies we should use the Sonic model for generation.

        // Let's try to use the standard Bedrock `InvokeModel` with Nova 2 (non-Sonic) if it supports text-to-speech?
        // No, Nova 2 is text-to-text/image. Nova 2 Sonic is the speech one.
        // Nova 2 Sonic only supports the bidirectional stream API.

        // So, we MUST use `InvokeModelWithBidirectionalStreamCommand`.
        // We can start a stream, send the text, get the audio, and close it.
        // This is what `SonicClient` does!

        // RE-THINK:
        // Instead of a separate `AgentClient`, maybe we modify `SonicClient`?
        // `SonicClient` connects to Nova Sonic.
        // If we want the "Brain" to be the Agent, we can't easily inject the Agent *into* the Nova Sonic loop 
        // because Nova Sonic connects User Audio -> Model -> Model Audio.
        // It doesn't let us intercept the text, send to Agent, and get text back to synthesize.

        // So my architecture of Transcribe -> Agent -> TTS is correct.
        // BUT, for the TTS part, if we want "Nova Voice", we have to use Nova Sonic.
        // And Nova Sonic ONLY works via the streaming API.

        // So, `synthesizeSpeech` needs to:
        // 1. Start a Nova Sonic stream.
        // 2. Send the text (from Agent).
        // 3. Receive the audio.
        // 4. Close the stream.

        // This seems heavy but it's the only way to get Nova's voice.
        // Let's implement a lightweight version of `SonicClient` here just for TTS.

        // ... (Implementation of lightweight Sonic TTS) ...
        // For now, to keep it simple and reliable, I will use Polly (Neural) as a fallback if Nova is too complex for just TTS,
        // BUT the user asked for Nova 2 Sonic.
        // Let's try to reuse `SonicClient` logic.

        // Actually, I can instantiate a `SonicClient` inside `AgentClient` just for TTS!
        // `this.ttsClient = new SonicClient(config)`
        // `await this.ttsClient.startSession(...)`
        // `await this.ttsClient.sendText(text)`
        // `await this.ttsClient.endSession()`

        // This is cleaner. I will assume `SonicClient` can be used this way.
    }
}
