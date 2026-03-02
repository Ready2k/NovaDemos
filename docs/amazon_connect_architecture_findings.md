# Amazon Connect + Nova Sonic Architecture Findings

## Objective
To integrate Amazon Nova 2 Sonic (an ultra-low-latency, real-time multimodal LLM) with Amazon Connect to create a seamless, real-time voice assistant over conventional telephony.

## The Architecture We Attempted
To overcome Amazon Connect’s limitations regarding third-party bot integration (since it natively prefers Amazon Lex), we built a bridged architecture:

1. **Inbound Audio (KVS)**: Amazon Connect streams the caller's audio out via Kinesis Video Streams (KVS). 
2. **Contact Flow Polling**: Connect triggers a `StartBotSession` Lambda which writes the KVS ARN to a DynamoDB table (`voice_s2s_sessions`), and then Connect constantly polls a `GetBotResult` Lambda.
3. **Backend Processing (ECS)**: A persistent Node.js container listens to KVS, decrypts the EBML/MKV stream into raw linear PCM, and streams it simultaneously to Nova Sonic.
4. **Outbound Audio (S3 + Prompts API)**: As Nova Sonic generates a response, the backend encodes it to WAV, uploads the WAV to the Amazon Connect S3 bucket, and marks the DynamoDB session as `ready`.
5. **Playback**: The polling `GetBotResult` Lambda sees the `ready` state, dynamically generates an Amazon Connect Prompt ARN using the AWS SDK (`CreatePromptCommand`), and returns it to Connect to play back using the `$.External.ssml` payload.

## Key Findings & Systemic Roadblocks

### 1. The "Speed Limit" (High Systemic Latency)
Despite Nova Sonic being capable of sub-second responses, the architectural latency floor of this design is around **7 seconds** for the first turn and slightly faster on subsequent turns. 
The delay is a combination of:
- **Synchronous Telephony Polling**: The contact flow must wait in a Lambda polling loop (invoking the Lambda every ~8 seconds max) before it can move forward. 
- **Database/Storage Overhead**: Writing WAV files to S3 -> Writing state to DynamoDB -> Lambda reading DynamoDB -> Lambda issuing a `CreatePrompt` API call -> Connect downloading the prompt from S3.
- **Result**: Sub-second real-time conversational latency is mathematically impossible in a setup requiring S3 transit and long-polling Contact Flows.

### 2. Stream Interruption & MKV Corruption
Amazon Connect handles KVS streaming in a disjointed way to save bandwidth. It pauses the outbound caller stream whenever a prompt (the AI's voice) is playing. When the prompt finishes and the caller is expected to speak, Connect "resumes" KVS.
However, it resumes by injecting a **brand new MKV file header** into the middle of the active KVS feed. This corrupts standard EBML parsers, requiring explicit buffer flushing (`rawAccumulator.length = 0`) to realign the byte-scanner every time Connect unpauses the stream. 

### 3. S3 Path & Permissions Strictness
Amazon Connect does not play external audio sources dynamically unless they exist inside an instance-associated S3 bucket to prevent unauthorized SSML injection. Even when playing via S3 directly, creating dynamic Prompts (`CreatePromptCommand`) requires strict bucket tracking and IAM provisioning, resulting in overhead whenever new voice turns are generated.

## Conclusion 
Are we fighting a losing battle? **Yes.** 
This architecture successfully proves we can wire a custom LLM into Amazon Connect, but it fundamentally breaks the core value proposition of an ultra-fast Voice-to-Voice LLM like Nova Sonic.

To achieve lightning-fast voice responses, we must abandon the Connect Contact Flow/S3 polling method constraint. 
**Recommended Alternatives:**
1. **WebRTC Backend**: Bypassing traditional telephony entirely for a browser/mobile-based WebRTC microphone stream.
2. **SIP Trunking / Chime SDK**: Using an AWS Chime PSTN audio service to programmatically stream raw RTP/SIP audio bidirectionally to the backend, completely cutting out KVS padding and S3 storage.
