/**
 * rtp-session.ts — Bidirectional RTP media handler for G.711 μ-law (PCMU) @8kHz.
 *
 * Each CallSession creates one RtpSession.  The session:
 *  - Binds a UDP socket on a port allocated from the pool.
 *  - Parses incoming RTP packets and emits their G.711 payloads as 'audio' events.
 *  - Accepts outgoing G.711 buffers via send() and wraps them in RTP packets.
 *  - Implements a simple 60 ms jitter buffer to reorder out-of-order packets.
 *
 * Port allocation: one port is used for both RX and TX (symmetric RTP).
 *   Pool: SBC_RTP_PORT_BASE  (default 10000) .. SBC_RTP_PORT_BASE + SBC_RTP_PORT_COUNT (200)
 */

import * as dgram  from 'dgram';
import { EventEmitter } from 'events';

// ─── RTP constants ─────────────────────────────────────────────────────────────

const RTP_VERSION        = 2;
const PAYLOAD_TYPE_PCMU  = 0;   // G.711 μ-law
const SAMPLE_RATE        = 8000; // Hz
/** Samples per RTP packet (20 ms ptime). */
const SAMPLES_PER_PACKET = 160;  // 20 ms × 8000 Hz

// ─── Port pool ─────────────────────────────────────────────────────────────────

const PORT_BASE  = parseInt(process.env.SBC_RTP_PORT_BASE  || '10000', 10);
const PORT_COUNT = parseInt(process.env.SBC_RTP_PORT_COUNT || '200',   10);

/** Ports currently in use.  Keyed by port number. */
const allocatedPorts = new Set<number>();

function allocatePort(): number {
    for (let i = 0; i < PORT_COUNT; i++) {
        const port = PORT_BASE + i;
        if (!allocatedPorts.has(port)) {
            allocatedPorts.add(port);
            return port;
        }
    }
    throw new Error('[RtpSession] RTP port pool exhausted');
}

function releasePort(port: number): void {
    allocatedPorts.delete(port);
}

// ─── Jitter buffer entry ───────────────────────────────────────────────────────

interface JitterEntry {
    seq:       number;
    timestamp: number;
    payload:   Buffer;
    arrivedAt: number;  // wall-clock ms when packet arrived
}

// ─── RtpSession ───────────────────────────────────────────────────────────────

export interface RtpRemote {
    ip:   string;
    port: number;
}

export class RtpSession extends EventEmitter {
    private socket:       dgram.Socket;
    public  localPort:    number;
    private remote:       RtpRemote | null = null;

    // Sending state
    private txSeq:        number = Math.floor(Math.random() * 0xFFFF);
    private txTimestamp:  number = Math.floor(Math.random() * 0xFFFFFFFF);
    private txSsrc:       number = Math.floor(Math.random() * 0xFFFFFFFF);

    // Jitter buffer state (60 ms window)
    private jitterBuf:    Map<number, JitterEntry> = new Map();
    private nextExpected: number = -1;  // -1 = not yet initialised
    private jitterTimer:  ReturnType<typeof setInterval> | null = null;

    /** Maximum jitter budget in milliseconds before we emit regardless. */
    private readonly JITTER_MS = 60;

    constructor() {
        super();
        this.localPort = allocatePort();
        this.socket    = dgram.createSocket('udp4');

        this.socket.on('message', (msg, rinfo) => this._onPacket(msg, rinfo));
        this.socket.on('error',   (err)         => console.error('[RtpSession] Socket error:', err));

        this.socket.bind(this.localPort, () => {
            console.log(`[RtpSession] Bound on port ${this.localPort}`);
        });

        // Drain jitter buffer every 20 ms (one RTP packet interval)
        this.jitterTimer = setInterval(() => this._drainJitter(), 20);
    }

    /** Set the remote RTP endpoint (learned from SDP). */
    setRemote(remote: RtpRemote): void {
        this.remote = remote;
        console.log(`[RtpSession:${this.localPort}] Remote set to ${remote.ip}:${remote.port}`);
    }

    // ── Receive path ────────────────────────────────────────────────────────────

    private _onPacket(buf: Buffer, rinfo: dgram.RemoteInfo): void {
        if (buf.length < 12) return;  // too short to be valid RTP

        // Parse fixed RTP header
        const firstByte  = buf[0];
        const version    = (firstByte >> 6) & 0x03;
        if (version !== RTP_VERSION) return;

        const hasExtension = (firstByte >> 4) & 0x01;
        const csrcCount    = firstByte & 0x0F;

        const payloadType = buf[1] & 0x7F;
        if (payloadType !== PAYLOAD_TYPE_PCMU) return;

        const seq       = buf.readUInt16BE(2);
        const timestamp = buf.readUInt32BE(4);
        // SSRC at bytes 8-11 (not needed for audio bridging)

        let headerLen = 12 + csrcCount * 4;

        // Skip any RTP extension
        if (hasExtension && buf.length >= headerLen + 4) {
            const extLen = buf.readUInt16BE(headerLen + 2);
            headerLen   += 4 + extLen * 4;
        }

        if (headerLen >= buf.length) return;
        const payload = buf.slice(headerLen);

        // Infer remote endpoint from first packet (useful if SDP omits it)
        if (!this.remote) {
            this.remote = { ip: rinfo.address, port: rinfo.port };
            console.log(`[RtpSession:${this.localPort}] Remote inferred from first RTP packet: ${rinfo.address}:${rinfo.port}`);
        }

        // Seed expected sequence on first packet
        if (this.nextExpected === -1) {
            this.nextExpected = seq;
        }

        this.jitterBuf.set(seq, { seq, timestamp, payload, arrivedAt: Date.now() });
    }

    private _drainJitter(): void {
        if (this.nextExpected === -1 || this.jitterBuf.size === 0) return;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const entry = this.jitterBuf.get(this.nextExpected);

            if (entry) {
                // Expected packet arrived — emit immediately
                this.jitterBuf.delete(this.nextExpected);
                this.emit('audio', entry.payload);
                this.nextExpected = (this.nextExpected + 1) & 0xFFFF;
                continue;
            }

            // Packet not yet arrived — check if the oldest buffered packet is
            // beyond the jitter window (i.e. the expected one was lost).
            let oldest: JitterEntry | null = null;
            for (const e of this.jitterBuf.values()) {
                if (!oldest || e.arrivedAt < oldest.arrivedAt) oldest = e;
            }

            if (oldest && (Date.now() - oldest.arrivedAt) >= this.JITTER_MS) {
                // Gap too long — skip to the next buffered packet (loss concealment)
                console.warn(`[RtpSession:${this.localPort}] Packet loss: skipping seq ${this.nextExpected} → ${oldest.seq}`);
                this.nextExpected = (oldest.seq + 1) & 0xFFFF;
                this.jitterBuf.delete(oldest.seq);
                this.emit('audio', oldest.payload);
                continue;
            }

            // Still within jitter window — wait
            break;
        }
    }

    // ── Send path ──────────────────────────────────────────────────────────────

    /**
     * Send a G.711 μ-law buffer as one or more RTP PCMU packets.
     * Large buffers are split into SAMPLES_PER_PACKET-byte chunks (20 ms each).
     */
    send(g711: Buffer): void {
        if (!this.remote) {
            console.warn('[RtpSession] Cannot send: remote not yet set');
            return;
        }

        let offset = 0;
        while (offset < g711.length) {
            const chunk    = g711.slice(offset, offset + SAMPLES_PER_PACKET);
            const rtpPacket = this._buildRtpPacket(chunk);
            this.socket.send(rtpPacket, 0, rtpPacket.length, this.remote.port, this.remote.ip);
            offset += chunk.length;
        }
    }

    private _buildRtpPacket(payload: Buffer): Buffer {
        const header = Buffer.alloc(12);

        // Byte 0: V=2, P=0, X=0, CC=0
        header[0] = (RTP_VERSION << 6);
        // Byte 1: M=0, PT=0 (PCMU)
        header[1] = PAYLOAD_TYPE_PCMU;
        // Bytes 2-3: sequence number
        header.writeUInt16BE(this.txSeq & 0xFFFF, 2);
        // Bytes 4-7: timestamp
        header.writeUInt32BE(this.txTimestamp >>> 0, 4);
        // Bytes 8-11: SSRC
        header.writeUInt32BE(this.txSsrc >>> 0, 8);

        // Advance state
        this.txSeq       = (this.txSeq + 1) & 0xFFFF;
        this.txTimestamp = (this.txTimestamp + payload.length) >>> 0;

        return Buffer.concat([header, payload]);
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    close(): void {
        if (this.jitterTimer) {
            clearInterval(this.jitterTimer);
            this.jitterTimer = null;
        }
        try { this.socket.close(); } catch (_) { /* already closed */ }
        releasePort(this.localPort);
        console.log(`[RtpSession:${this.localPort}] Closed`);
    }
}
