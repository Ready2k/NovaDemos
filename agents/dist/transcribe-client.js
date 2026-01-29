"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranscribeClientWrapper = void 0;
const client_transcribe_streaming_1 = require("@aws-sdk/client-transcribe-streaming");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
class TranscribeClientWrapper {
    // private region: string;
    constructor(region = 'us-east-1') {
        // this.region = region;
        // Use the same credential configuration as other AWS services
        const clientConfig = { region };
        if (process.env.NOVA_AWS_ACCESS_KEY_ID && process.env.NOVA_AWS_SECRET_ACCESS_KEY) {
            clientConfig.credentials = {
                accessKeyId: process.env.NOVA_AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
            };
        }
        else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            clientConfig.credentials = {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            };
        }
        this.client = new client_transcribe_streaming_1.TranscribeStreamingClient(clientConfig);
    }
    /**
     * Transcribes a buffer of audio (PCM 16kHz)
     * Note: For true streaming, we'd keep the stream open.
     * For this demo, we'll do a "shot" transcription of the accumulated buffer.
     */
    async transcribe(audioBuffer) {
        if (audioBuffer.length === 0)
            return "";
        // Create an async generator for the audio stream
        async function* audioStream() {
            const chunkSize = 16000; // 1 second chunks roughly
            for (let i = 0; i < audioBuffer.length; i += chunkSize) {
                yield { AudioEvent: { AudioChunk: audioBuffer.subarray(i, i + chunkSize) } };
            }
        }
        const command = new client_transcribe_streaming_1.StartStreamTranscriptionCommand({
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
        }
        catch (error) {
            console.error('[Transcribe] Error:', error);
            return "";
        }
    }
}
exports.TranscribeClientWrapper = TranscribeClientWrapper;
