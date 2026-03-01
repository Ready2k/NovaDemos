# Hume AI Integration Guide

Hume AI provides high-accuracy vocal emotion analysis across 48 emotion dimensions (anger, distress, joy, contempt, etc.), enabling sarcasm detection and richer sentiment signals than lexicon-based approaches. This document describes how to integrate it with the Voice S2S backend.

**Status**: Documentation only — not yet implemented. The acoustic feature extraction in Part 1 (in-process RMS analysis) serves as a zero-cost baseline. Hume adds higher fidelity at ~$0.10/hour of audio.

---

## Prerequisites

1. Sign up at [hume.ai](https://hume.ai) and obtain an API key.
2. Gate the integration behind the environment variable `HUME_API_KEY`. When absent, the system falls back to in-process acoustic features.

---

## Installation

```bash
npm install @humeai/client --save
# backend only
```

---

## Audio Tap Point

The in-process implementation (Part 1) already accumulates `userTurnRmsSamples` per turn. For Hume, also store the raw PCM frames:

```typescript
// In ClientSession interface (server.ts):
userTurnAudioChunks?: Buffer[]; // Raw PCM16 frames for Hume submission

// In the RAW NOVA audio path, alongside RMS accumulation:
const MAX_HUME_AUDIO_BYTES = 16000 * 2 * 30; // 30 seconds at 16kHz PCM16
const currentBytes = (session.userTurnAudioChunks || []).reduce((s, b) => s + b.length, 0);
if (currentBytes < MAX_HUME_AUDIO_BYTES) {
    if (!session.userTurnAudioChunks) session.userTurnAudioChunks = [];
    session.userTurnAudioChunks.push(audioBuffer);
}
```

Also reset `userTurnAudioChunks = []` in the `interactionTurnEnd` handler.

---

## Submitting Audio to Hume

After the `interactionTurnEnd` event (or on final user transcript), assemble the buffered PCM into a WAV file and POST to Hume's Expression Measurement API:

```typescript
import { HumeClient } from '@humeai/client';

const hume = new HumeClient({ apiKey: process.env.HUME_API_KEY! });

async function analyzeWithHume(pcmChunks: Buffer[]): Promise<HumeEmotions | null> {
    if (!process.env.HUME_API_KEY || pcmChunks.length === 0) return null;

    // Build minimal WAV header for 16kHz PCM16 mono
    const pcm = Buffer.concat(pcmChunks);
    const wav = buildWavBuffer(pcm, { sampleRate: 16000, bitDepth: 16, channels: 1 });

    const job = await hume.expressionMeasurement.batch.startInferenceJob({
        models: { prosody: {} },
        urls: [],              // We use raw upload, not URLs
    });

    // For streaming / lower latency, use the streaming endpoint:
    // POST /v0/stream/models/predictions with Content-Type: audio/wav
    const response = await fetch('https://api.hume.ai/v0/stream/models/predictions', {
        method: 'POST',
        headers: {
            'X-Hume-Api-Key': process.env.HUME_API_KEY,
            'Content-Type': 'audio/wav',
        },
        body: wav,
    });

    const result = await response.json();
    return extractEmotions(result);
}
```

### WAV Header Helper

```typescript
function buildWavBuffer(pcm: Buffer, opts: { sampleRate: number; bitDepth: number; channels: number }): Buffer {
    const { sampleRate, bitDepth, channels } = opts;
    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);        // PCM chunk size
    header.writeUInt16LE(1, 20);         // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}
```

---

## Mapping Hume Output to Sentiment Score

Hume returns scores (0–1) for 48 emotion dimensions. Map them to a -1 to +1 sentiment score:

```typescript
interface HumeEmotions {
    anger: number;
    distress: number;
    contempt: number;
    frustration: number;
    joy: number;
    excitement: number;
    contentment: number;
    amusement: number;
    // ... 40 more
}

function humeSentiment(e: HumeEmotions): number {
    const negative = e.anger + e.distress + e.contempt + e.frustration;
    const positive = e.joy + e.excitement + e.contentment;
    // Normalize to -1..+1
    return Math.max(-1, Math.min(1, (positive - negative) / 2));
}
```

Send the result in the same `acousticFeatures` field on the `transcript` WebSocket message, replacing or augmenting the in-process calculation:

```typescript
acousticFeatures: {
    energy: inProcessFeatures.energy,
    energyVariance: inProcessFeatures.energyVariance,
    energyTrend: inProcessFeatures.energyTrend,
    speakingRate: inProcessFeatures.speakingRate,
    pauseCount: inProcessFeatures.pauseCount,
    humeSentiment: humeSentiment(emotions),         // replaces AFINN score for this turn
    sarcasmProbability: detectSarcasm(emotions),    // new field
}
```

---

## Sarcasm Detection

Hume's combination of high `amusement` + high `contempt` is a reliable sarcasm signal:

```typescript
function detectSarcasm(e: HumeEmotions): number {
    // Both must be above threshold for a sarcasm signal
    if (e.amusement > 0.4 && e.contempt > 0.3) {
        return Math.min(1, (e.amusement + e.contempt) / 2);
    }
    return 0;
}
```

Surface `sarcasmProbability` in the InsightPanel as a separate row when > 0.3.

---

## Cost & Gating

- Pricing: approximately **$0.10 per hour of audio** (check hume.ai for current rates).
- Gate behind `HUME_API_KEY` env var — if absent, only in-process acoustic features are computed.
- Consider batching short turns (< 2 seconds) together to minimise API call overhead.

---

## Environment Variable

Add to `backend/.env`:

```
HUME_API_KEY=your_hume_api_key_here
```
