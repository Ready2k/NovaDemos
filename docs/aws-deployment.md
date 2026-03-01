# AWS Deployment & Amazon Connect Integration

This document covers two phases:
1. **Phase 1** — Deploying Voice S2S to AWS ECS Fargate (production hosting)
2. **Phase 2** — Integrating with Amazon Connect for PSTN telephony (blended bot)

---

## Phase 1: AWS Deployment (ECS Fargate)

### Architecture Overview

```
Route53 (DNS)
    ↓
ACM Certificate (TLS termination)
    ↓
Application Load Balancer (HTTPS / WSS)
    ├── /health     → ECS target group
    ├── /* (HTTP)   → ECS target group
    └── /sonic (WebSocket upgrade) → ECS target group (sticky sessions required)
                ↓
        ECS Fargate Service (1–N tasks)
              Node.js backend :8080
              (serves static frontend + WebSocket + API)
                ↓
        AWS Services (same region):
          - Amazon Nova Sonic (Bedrock)
          - Amazon Transcribe Streaming
          - Amazon S3 (session logs)
```

### Dockerfile

No Dockerfile exists yet. Create one at the project root:

```dockerfile
# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

# Copy everything and install + build
COPY . .
RUN npm run install:all && npm run build

# --- Runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy built artefacts only
COPY --from=builder /app/backend/dist          ./backend/dist
COPY --from=builder /app/frontend-v2/out       ./frontend-v2/out
COPY --from=builder /app/backend/node_modules  ./backend/node_modules
COPY --from=builder /app/backend/package.json  ./backend/package.json

# Runtime assets needed by server.ts at startup
COPY --from=builder /app/tools        ./tools
COPY --from=builder /app/workflows    ./workflows
COPY --from=builder /app/backend/prompts ./backend/prompts

EXPOSE 8080
CMD ["node", "backend/dist/server.js"]
```

Build and test locally:

```bash
docker build -t voice-s2s .
docker run -p 8080:8080 --env-file backend/.env voice-s2s
```

### IAM Task Role

Use an ECS Task Role (not environment variable credentials) for AWS service access. Attach the following managed/inline policies:

| Service | Required Actions |
|---------|-----------------|
| Amazon Bedrock | `bedrock:InvokeModelWithResponseStream`, `bedrock:InvokeModel` |
| Amazon Transcribe | `transcribe:StartStreamTranscription` |
| Amazon S3 | `s3:PutObject`, `s3:GetObject` (session log bucket) |
| AWS Secrets Manager | `secretsmanager:GetSecretValue` (Langfuse keys) |

### ECS Task Definition

Minimum resource allocation per task:

| Resource | Minimum | Notes |
|----------|---------|-------|
| vCPU | 1 | Each active call ≈ 50–100MB RAM |
| Memory | 2 GB | Scale based on concurrent call volume |
| Port | 8080 | TCP |

Key environment variables (inject from Secrets Manager or Parameter Store):

```
NOVA_AWS_REGION=us-east-1
NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0
LANGFUSE_PUBLIC_KEY=<from Secrets Manager>
LANGFUSE_SECRET_KEY=<from Secrets Manager>
LANGFUSE_HOST=<from Secrets Manager>
```

Do **not** set `NOVA_AWS_ACCESS_KEY_ID` / `NOVA_AWS_SECRET_ACCESS_KEY` — the Task Role handles auth automatically.

### Application Load Balancer (WebSocket Support)

Critical ALB settings for WebSocket:

1. **Sticky sessions**: Enable duration-based stickiness (1 hour) on the target group. Each WebSocket connection must always route to the same ECS task.
2. **Idle timeout**: Set ALB idle timeout to ≥ 3600 seconds (1 hour) to prevent WebSocket disconnects during long calls.
3. **Protocol**: ALB terminates TLS (`wss://`). Internal traffic to ECS is plain HTTP/WS (`ws://`).

Listener rules:

```
HTTPS:443 → forward to target group (all paths)
HTTP:80  → redirect to HTTPS
```

### SIGTERM Handler

ECS sends `SIGTERM` on task replacement/scaling-in. The current server only handles `SIGINT`. Add `SIGTERM` handling:

```typescript
// In backend/src/server.ts — alongside the existing SIGINT handler:
process.on('SIGTERM', async () => {
    console.log('[Server] SIGTERM received, shutting down gracefully...');
    for (const [ws, session] of activeSessions.entries()) {
        if (session.sonicClient.isActive()) {
            await session.sonicClient.stopSession();
        }
        ws.close();
    }
    wss.close(() => {
        server.close(() => {
            console.log('[Server] Server closed');
            process.exit(0);
        });
    });
});
```

### Auto-Scaling

Scale the ECS service on two metrics:

| Metric | Scale-out threshold | Scale-in threshold |
|--------|--------------------|--------------------|
| `ALBRequestCountPerTarget` | > 500/min | < 100/min |
| Custom CloudWatch metric: `ActiveWebSocketConnections` | > 50 per task | < 10 per task |

To emit the custom metric, add a periodic `setInterval` in server.ts:

```typescript
setInterval(() => {
    const connectionCount = activeSessions.size;
    cloudwatch.putMetricData({
        Namespace: 'VoiceS2S',
        MetricData: [{ MetricName: 'ActiveWebSocketConnections', Value: connectionCount, Unit: 'Count' }]
    }).promise();
}, 60_000);
```

### Secrets Manager

Store Langfuse credentials in Secrets Manager and inject as environment variables in the task definition:

```json
{
  "secrets": [
    { "name": "LANGFUSE_PUBLIC_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:voice-s2s/langfuse:PUBLIC_KEY::" },
    { "name": "LANGFUSE_SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:voice-s2s/langfuse:SECRET_KEY::" }
  ]
}
```

---

## Phase 2: Amazon Connect Integration (Blended Bot)

### Architecture Overview

```
PSTN Caller
    ↓
Amazon Connect (DID number)
    ↓
Contact Flow:
  1. Set recording behaviour
  2. Invoke Lambda: "StartBotSession"
     → creates session ID, initiates Nova Sonic greeting
  3. Start Media Streaming → Kinesis Video Streams (KVS)
  4. Loop: GetCustomerInput (wait for audio)
       ↓
     Lambda: "ProcessBotTurn"
       ↓
     Audio Bridge ECS Service:
       - Reads caller audio from KVS (8kHz PCM16 or µ-law)
       - Resamples to 16kHz PCM16
       - Sends to Voice S2S backend WebSocket
       - Receives Nova Sonic response audio (24kHz)
       - Resamples to 8kHz
       - Writes response as .wav to S3
       - Returns S3 URL + intent to Lambda
       ↓
     Contact Flow: PlayPrompt (S3 URL)
  5. If intent == "transfer":
       TransferToQueue → Human Agent Queue
  6. If intent == "end":
       Disconnect
```

### Audio Format Translation

Amazon Connect media streaming uses 8kHz PCM16 (or µ-law). Nova Sonic requires 16kHz PCM16 input and outputs at 24kHz.

| Direction | From | To | Method |
|-----------|------|-----|--------|
| Connect → Nova Sonic | 8kHz PCM16 | 16kHz PCM16 | Linear interpolation (double each sample) |
| Nova Sonic → Connect | 24kHz PCM16 | 8kHz PCM16 | 3:1 downsample (take every 3rd sample) |

**Audio quality note**: Downsampling Nova Sonic's 24kHz voice to 8kHz for PSTN causes noticeable quality degradation. An alternative for Connect output is to use **Amazon Polly at 8kHz** to synthesise the text response, keeping Nova Sonic only for NLU and response generation. This maintains voice quality on the PSTN leg.

### Simple resampling in Node.js

```typescript
function upsample8kTo16k(pcm8k: Buffer): Buffer {
    const out = Buffer.alloc(pcm8k.length * 2);
    for (let i = 0; i < pcm8k.length / 2; i++) {
        const sample = pcm8k.readInt16LE(i * 2);
        out.writeInt16LE(sample, i * 4);
        out.writeInt16LE(sample, i * 4 + 2); // duplicate sample
    }
    return out;
}

function downsample24kTo8k(pcm24k: Buffer): Buffer {
    const outSamples = Math.floor((pcm24k.length / 2) / 3);
    const out = Buffer.alloc(outSamples * 2);
    for (let i = 0; i < outSamples; i++) {
        const sample = pcm24k.readInt16LE(i * 3 * 2);
        out.writeInt16LE(sample, i * 2);
    }
    return out;
}
```

### Transfer Tool

Add a new tool file `tools/transfer_to_agent.json`:

```json
{
  "name": "transfer_to_agent",
  "description": "Transfer the caller to a human agent when the bot cannot resolve the issue.",
  "input_schema": {
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "description": "Brief reason for the transfer (shown to the agent)"
      }
    },
    "required": ["reason"]
  },
  "instruction": "Use this tool when the customer requests a human agent, or when the issue cannot be resolved by the bot.",
  "category": "escalation"
}
```

When Nova Sonic calls this tool, the backend sends a WebSocket message:

```typescript
ws.send(JSON.stringify({ type: 'transferToAgent', reason: toolInput.reason }));
```

The Audio Bridge service monitors this message and returns `intent: "transfer"` to the Lambda, which then calls Connect's `TransferToQueue` action.

### Lambda Functions

**StartBotSession** — Called from the Contact Flow on inbound call:

```javascript
exports.handler = async (event) => {
    const sessionId = `connect-${event.ContactId}`;
    // Start a WebSocket session with the Voice S2S backend
    // (or create an ECS RunTask for the bridge service)
    return { sessionId, status: 'started' };
};
```

**ProcessBotTurn** — Called each turn from the Contact Flow:

```javascript
exports.handler = async (event) => {
    const { sessionId, audioS3Key } = event;
    // Invoke the Audio Bridge service endpoint
    const result = await fetch(`https://bridge.internal/turn`, {
        method: 'POST',
        body: JSON.stringify({ sessionId, audioS3Key })
    });
    const { responseAudioUrl, intent } = await result.json();
    return { responseAudioUrl, intent };
};
```

### IAM Requirements

| Component | Needs |
|-----------|-------|
| Connect instance | Invoke Lambda, KVS write, S3 write |
| Lambda | Invoke ECS RunTask (or call bridge endpoint), read/write S3 |
| ECS bridge service | Read KVS (GetMedia), write S3, connect to Voice S2S backend WebSocket |
| Voice S2S backend Task Role | Bedrock (Nova Sonic), Transcribe |

### KVS Consumer for Node.js

Amazon Connect media streaming writes to KVS. To read the audio stream:

```bash
npm install amazon-kinesis-video-streams-media
```

Use the `GetMedia` API on the KVS stream associated with the contact. The KVS Parser library can parse MKV-wrapped PCM chunks from the stream.

### Latency Budget

| Component | Typical latency |
|-----------|----------------|
| PSTN → Connect | ~100ms |
| KVS buffering | ~200–400ms |
| Nova Sonic (NLU + TTS) | ~800–1500ms |
| S3 upload + PlayPrompt | ~200ms |
| **Total bot turn RTT** | **~1.5–2.5 seconds** |

This is acceptable for banking IVR workflows. For more conversational use cases, consider pre-generating common responses or using Connect's native Lex bot integration for simple intents, escalating to Nova Sonic only for complex queries.
