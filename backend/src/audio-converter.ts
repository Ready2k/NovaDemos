/**
 * audio-converter.ts
 * Audio format conversion utilities for the Amazon Connect KVS bridge.
 *
 * Direction 1 (caller → Nova Sonic):
 *   MKV container (G.711 μ-law 8 kHz) → PCM16 LE 16 kHz
 *
 * Direction 2 (Nova Sonic → Connect):
 *   PCM16 LE 24 kHz → PCM16 LE 8 kHz → WAV (8 kHz, mono, 16-bit)
 */

// ─── EBML / MKV helpers ───────────────────────────────────────────────────────

/**
 * Read an EBML variable-length integer (VINT) from buf at position pos.
 * Returns { val, len } where len is the number of bytes consumed.
 */
export function readVint(buf: Buffer, pos: number): { val: number; len: number } {
    const b = buf[pos];
    let mask: number, len: number;
    if      (b >= 0x80) { mask = 0x7F; len = 1; }
    else if (b >= 0x40) { mask = 0x3F; len = 2; }
    else if (b >= 0x20) { mask = 0x1F; len = 3; }
    else if (b >= 0x10) { mask = 0x0F; len = 4; }
    else if (b >= 0x08) { mask = 0x07; len = 5; }
    else if (b >= 0x04) { mask = 0x03; len = 6; }
    else if (b >= 0x02) { mask = 0x01; len = 7; }
    else                { mask = 0x00; len = 8; }
    let val = b & mask;
    for (let i = 1; i < len; i++) val = val * 256 + buf[pos + i];
    return { val, len };
}

/**
 * Scan buf for MKV SimpleBlock (0xA3) and Block (0xA1) elements and
 * concatenate the raw audio payloads.
 *
 * SimpleBlock / Block layout (after the element ID byte):
 *   DataSize (VINT) | TrackNumber (VINT) | Timecode (2 bytes) | Flags (1 byte) | Payload
 */
export function extractAudioFromMkv(buf: Buffer): Buffer {
    const frames: Buffer[] = [];
    let pos = 0;
    while (pos < buf.length - 4) {
        const id = buf[pos];
        if (id === 0xA3 || id === 0xA1) {
            pos++;
            if (pos >= buf.length) break;
            const sz         = readVint(buf, pos);
            pos             += sz.len;
            const blockStart = pos;
            const track      = readVint(buf, pos);
            const headerLen  = track.len + 3; // track vint + 2-byte timecode + 1-byte flags
            const payloadLen = sz.val - headerLen;
            if (payloadLen > 0 && payloadLen < 65536) {
                frames.push(buf.slice(blockStart + headerLen, blockStart + sz.val));
            }
            pos = blockStart + sz.val;
        } else {
            pos++;
        }
    }
    return frames.length ? Buffer.concat(frames) : Buffer.alloc(0);
}

// ─── Audio conversion — caller direction (8 kHz μ-law → 16 kHz PCM16) ────────

/** G.711 μ-law byte → 16-bit linear PCM sample. */
function ulawToSample(u: number): number {
    u = (~u) & 0xFF;
    const sign     = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0F;
    const sample   = (((mantissa << 3) + 0x84) << (exponent + 1));
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

// ─── Audio conversion — response direction (24 kHz PCM16 → 8 kHz WAV) ────────

/**
 * Downsample 24 kHz PCM16 LE to 8 kHz by averaging every 3 consecutive samples.
 * Input length must be a multiple of 6 bytes (3 samples × 2 bytes); any remainder
 * is discarded.
 */
export function downsample24to8kHz(pcm24: Buffer): Buffer {
    const inputSamples  = Math.floor(pcm24.length / 2);
    const outputSamples = Math.floor(inputSamples / 3);
    if (outputSamples === 0) return Buffer.alloc(0);
    const out = Buffer.alloc(outputSamples * 2);
    for (let i = 0; i < outputSamples; i++) {
        const s0  = pcm24.readInt16LE(i * 6);
        const s1  = pcm24.readInt16LE(i * 6 + 2);
        const s2  = pcm24.readInt16LE(i * 6 + 4);
        const avg = Math.round((s0 + s1 + s2) / 3);
        out.writeInt16LE(Math.max(-32768, Math.min(32767, avg)), i * 2);
    }
    return out;
}

/**
 * Wrap 8 kHz mono PCM16 LE data in a standard 44-byte WAV header.
 * Amazon Connect's Play Prompt block can read this directly from S3.
 */
export function encodeWav(pcm8k: Buffer): Buffer {
    const sampleRate    = 8000;
    const numChannels   = 1;
    const bitsPerSample = 16;
    const byteRate      = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign    = numChannels * (bitsPerSample / 8);
    const dataSize      = pcm8k.length;
    const wav           = Buffer.alloc(44 + dataSize);

    // RIFF chunk descriptor
    wav.write('RIFF', 0, 'ascii');
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8, 'ascii');

    // fmt sub-chunk
    wav.write('fmt ', 12, 'ascii');
    wav.writeUInt32LE(16, 16);           // PCM sub-chunk size
    wav.writeUInt16LE(1, 20);            // PCM format (linear)
    wav.writeUInt16LE(numChannels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    wav.write('data', 36, 'ascii');
    wav.writeUInt32LE(dataSize, 40);
    pcm8k.copy(wav, 44);

    return wav;
}
