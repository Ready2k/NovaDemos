import { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testStream() {
    console.log('Testing Nova Sonic Streaming Access...');
    const region = process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1';
    const modelId = process.env.NOVA_SONIC_MODEL_ID || 'amazon.nova-2-sonic-v1:0';

    console.log(`Region: ${region}`);
    console.log(`Model: ${modelId}`);

    const config: any = { region };

    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
        console.log('Using Bearer Token authentication');
        config.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };
    } else if (process.env.NOVA_AWS_ACCESS_KEY_ID && process.env.NOVA_AWS_SECRET_ACCESS_KEY) {
        console.log('Using IAM Credentials authentication');
        config.credentials = {
            accessKeyId: process.env.NOVA_AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
        };
    } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        console.log('Using IAM Credentials authentication (legacy)');
        config.credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        };
    }

    const client = new BedrockRuntimeClient(config);

    // Create a dummy async generator
    async function* inputStream(): AsyncGenerator<any> {
        const promptName = `prompt-${Date.now()}`;
        const contentName = `audio-${Date.now()}`;

        // 1. Session Start
        const sessionStartEvent = {
            event: {
                sessionStart: {
                    inferenceConfiguration: {
                        maxTokens: 2048,
                        topP: 0.9,
                        temperature: 0.7
                    },
                    turnDetectionConfiguration: {
                        endpointingSensitivity: "MEDIUM"
                    }
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(sessionStartEvent)) } };

        // 2. Prompt Start
        const promptStartEvent = {
            event: {
                promptStart: {
                    promptName: promptName,
                    textOutputConfiguration: {
                        mediaType: "text/plain"
                    },
                    audioOutputConfiguration: {
                        mediaType: "audio/lpcm",
                        sampleRateHertz: 16000,
                        sampleSizeBits: 16,
                        channelCount: 1,
                        voiceId: "matthew",
                        encoding: "base64",
                        audioType: "SPEECH"
                    }
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(promptStartEvent)) } };

        // 3. System Prompt Content Start
        const systemContentName = `system-${Date.now()}`;
        const systemContentStartEvent = {
            event: {
                contentStart: {
                    promptName: promptName,
                    contentName: systemContentName,
                    type: "TEXT",
                    interactive: false,
                    role: "SYSTEM",
                    textInputConfiguration: {
                        mediaType: "text/plain"
                    }
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(systemContentStartEvent)) } };

        // 4. System Prompt Text Input
        const systemTextInputEvent = {
            event: {
                textInput: {
                    promptName: promptName,
                    contentName: systemContentName,
                    content: "You are a helpful assistant."
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(systemTextInputEvent)) } };

        // 5. System Prompt Content End
        const systemContentEndEvent = {
            event: {
                contentEnd: {
                    promptName: promptName,
                    contentName: systemContentName
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(systemContentEndEvent)) } };

        // 6. User Audio Content Start
        const contentStartEvent = {
            event: {
                contentStart: {
                    promptName: promptName,
                    contentName: contentName,
                    type: "AUDIO",
                    interactive: true,
                    role: "USER",
                    audioInputConfiguration: {
                        mediaType: "audio/lpcm",
                        sampleRateHertz: 16000,
                        sampleSizeBits: 16,
                        channelCount: 1,
                        audioType: "SPEECH",
                        encoding: "base64"
                    }
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(contentStartEvent)) } };

        // 7. Audio Input (Silence)
        // Send a few chunks of silence
        for (let i = 0; i < 5; i++) {
            const audioInputEvent = {
                event: {
                    audioInput: {
                        promptName: promptName,
                        contentName: contentName,
                        content: Buffer.alloc(1024).toString('base64')
                    }
                }
            };
            yield { chunk: { bytes: Buffer.from(JSON.stringify(audioInputEvent)) } };
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 8. User Audio Content End
        const contentEndEvent = {
            event: {
                contentEnd: {
                    promptName: promptName,
                    contentName: contentName
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(contentEndEvent)) } };

        // 9. Prompt End
        const promptEndEvent = {
            event: {
                promptEnd: {
                    promptName: promptName
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(promptEndEvent)) } };

        // 10. Session End
        const sessionEndEvent = {
            event: {
                sessionEnd: {}
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(sessionEndEvent)) } };
    }

    try {
        console.log('Attempting to start bidirectional stream...');
        const command = new InvokeModelWithBidirectionalStreamCommand({
            modelId: modelId,
            body: inputStream(),
        });

        const response = await client.send(command);
        console.log('✅ Success! Stream connection established.');
        console.log('Response status:', response.$metadata.httpStatusCode);

        console.log('Response status:', response.$metadata.httpStatusCode);

        // Handle response stream
        if (response.body) {
            for await (const event of response.body) {
                if (event.chunk && event.chunk.bytes) {
                    const rawEvent = JSON.parse(Buffer.from(event.chunk.bytes).toString());
                    console.log('Received event:', JSON.stringify(rawEvent, null, 2));
                } else {
                    console.log('Received non-chunk event:', event);
                }
            }
        }

        console.log('Stream ended.');
        process.exit(0);

    } catch (error: any) {
        console.error('❌ Streaming Failed:', error.name);
        console.error('Message:', error.message);

        if (error.name === 'AccessDeniedException') {
            console.error('\nCONCLUSION: Your token is valid for listing models, but LACKS permission for "bedrock:InvokeModelWithBidirectionalStream".');
            console.error('Please update your token permissions.');
        } else if (error.name === 'ValidationException') {
            console.error('\nCONCLUSION: Model ID or Region might be incorrect, or you lack access to this specific model.');
        }

        process.exit(1);
    }
}

testStream();
