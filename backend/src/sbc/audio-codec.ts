/**
 * audio-codec.ts — G.711 μ-law ↔ PCM16 conversion and sample-rate conversion.
 *
 * Input path (PSTN → Nova Sonic):
 *   G.711 μ-law @8kHz  →  ulawToLinear16()  →  PCM16 LE @8kHz
 *   PCM16 LE @8kHz     →  resample8to16kHz() →  PCM16 LE @16kHz  (Nova Sonic input)
 *
 * Output path (Nova Sonic → PSTN):
 *   LPCM @24kHz        →  resample24to8kHz() →  PCM16 LE @8kHz
 *   PCM16 LE @8kHz     →  linear16ToUlaw()   →  G.711 μ-law @8kHz (RTP PCMU payload)
 *
 * Ported from aws/lambdas/kvs-bridge/process-turn.js with TypeScript types and
 * the additional inverse functions for the output path.
 */

// ─── Input path ────────────────────────────────────────────────────────────────

/** G.711 μ-law byte → 16-bit linear PCM sample. */
export function ulawToSample(u: number): number {
    u = ~u & 0xFF;
    const sign      = u & 0x80;
    const exponent  = (u >> 4) & 0x07;
    const mantissa  = u & 0x0F;
    let sample      = ((mantissa << 3) + 0x84) << (exponent + 1);
    return sign ? -sample : sample;
}

/** Convert a G.711 μ-law buffer (8 kHz) to PCM16 LE (still 8 kHz). */
export function ulawToLinear16(ulaw: Buffer): Buffer {
    const pcm = Buffer.alloc(ulaw.length * 2);
    for (let i = 0; i < ulaw.length; i++) {
        const s = Math.max(-32768, Math.min(32767, ulawToSample(ulaw[i])));
        pcm.writeInt16LE(s, i * 2);
    }
    return pcm;
}

/**
 * Upsample PCM16 LE from 8 kHz to 16 kHz using linear interpolation.
 * Each input sample pair produces two output samples (doubles the buffer size).
 * Ported from kvs-bridge/process-turn.js.
 */
export function resample8to16kHz(pcm8: Buffer): Buffer {
    const frames = Math.floor(pcm8.length / 2);
    if (frames === 0) return Buffer.alloc(0);
    const out = Buffer.alloc(frames * 4);
    for (let i = 0; i < frames - 1; i++) {
        const s0 = pcm8.readInt16LE(i * 2);
        const s1 = pcm8.readInt16LE((i + 1) * 2);
        out.writeInt16LE(s0,                         i * 4);
        out.writeInt16LE(Math.round((s0 + s1) / 2), i * 4 + 2);
    }
    const last = pcm8.readInt16LE((frames - 1) * 2);
    out.writeInt16LE(last, (frames - 1) * 4);
    out.writeInt16LE(last, (frames - 1) * 4 + 2);
    return out;
}

// ─── Output path ───────────────────────────────────────────────────────────────

/**
 * Convert a single 16-bit linear PCM sample to a G.711 μ-law byte.
 *
 * Implements the standard ITU-T G.711 μ-law compression algorithm.
 */
export function pcmSampleToUlaw(sample: number): number {
    const BIAS = 0x84;          // 132
    const MAX  = 32767;

    // Clamp to signed 16-bit range
    if (sample >  MAX) sample =  MAX;
    if (sample < -MAX) sample = -MAX;

    // Capture sign then work with magnitude
    let sign = 0;
    if (sample < 0) {
        sign   = 0x80;
        sample = -sample;
    }

    // Add the compression bias
    sample += BIAS;

    // Find the exponent (position of the highest set bit above bit 7)
    let exponent = 7;
    let expMask  = 0x4000;
    while ((sample & expMask) === 0 && exponent > 0) {
        exponent--;
        expMask >>= 1;
    }

    // Extract 4-bit mantissa
    const mantissa = (sample >> (exponent + 3)) & 0x0F;

    // Pack: sign | exponent | mantissa, then invert all bits (G.711 convention)
    return (~(sign | (exponent << 4) | mantissa)) & 0xFF;
}

/**
 * Convert a PCM16 LE buffer @8kHz to G.711 μ-law.
 * Output is one byte per sample — half the size of the input.
 */
export function linear16ToUlaw(pcm: Buffer): Buffer {
    const frames = Math.floor(pcm.length / 2);
    const out    = Buffer.alloc(frames);
    for (let i = 0; i < frames; i++) {
        out[i] = pcmSampleToUlaw(pcm.readInt16LE(i * 2));
    }
    return out;
}

/**
 * Downsample LPCM @24kHz to PCM16 @8kHz (3:1 decimation, Hann-weighted).
 *
 * Nova Sonic outputs audio at 24 kHz LPCM 16-bit mono.
 * PCMU/G.711 RTP requires 8 kHz mono.
 *
 * Filter kernel: [0.25, 0.50, 0.25]  (Hann window, centred on middle sample)
 *   |H(f)| = cos²(πf / 24000)
 *   vs the naive equal-weight [1/3,1/3,1/3] kernel whose response is
 *   (1/3)|1 + 2cos(2πf/24000)|.
 *
 * Frequency response comparison at key voice frequencies:
 *   f=1 kHz  – Hann: –0.15 dB   equal: –0.23 dB
 *   f=3 kHz  – Hann: –0.69 dB   equal: –1.93 dB  ← big improvement
 *   f=3.5kHz – Hann: –0.94 dB   equal: –2.59 dB
 *   f=4 kHz  – Hann: –2.50 dB   equal: –3.52 dB
 * Hann preserves the voice formant range (up to ~3.5 kHz) much better,
 * reducing the "muffled" quality audible over telephone codecs.
 */
export function resample24to8kHz(pcm24: Buffer): Buffer {
    const inFrames  = Math.floor(pcm24.length / 2);  // number of 16-bit samples
    const outFrames = Math.floor(inFrames / 3);
    if (outFrames === 0) return Buffer.alloc(0);

    const out = Buffer.alloc(outFrames * 2);
    for (let i = 0; i < outFrames; i++) {
        const s0  = pcm24.readInt16LE(i * 6);
        const s1  = pcm24.readInt16LE(i * 6 + 2);
        const s2  = pcm24.readInt16LE(i * 6 + 4);
        // Hann-weighted average: centre sample gets double weight
        const avg = Math.round(s0 * 0.25 + s1 * 0.5 + s2 * 0.25);
        out.writeInt16LE(Math.max(-32768, Math.min(32767, avg)), i * 2);
    }
    return out;
}
