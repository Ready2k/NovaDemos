/**
 * sip-ua.ts — Minimal SIP User Agent Server (UAS) for PSTN → Nova Sonic bridging.
 *
 * Listens on UDP port 5060 (SBC_SIP_PORT) for SIP INVITE and BYE messages from
 * the Amazon Chime SDK Voice Connector.
 *
 * No REGISTER is required — Chime VC routes calls via static origination rules.
 *
 * Events emitted:
 *   'call'   (rtpSession: RtpSession, meta: CallMeta)  — after ACK received
 *   'hangup' (callId: string)                           — after BYE received
 *
 * Implemented with Node.js dgram (no external SIP library) to keep dependencies
 * minimal and avoid TypeScript type issues with poorly-maintained SIP packages.
 */

import * as dgram         from 'dgram';
import * as crypto        from 'crypto';
import { EventEmitter }   from 'events';
import { RtpSession }     from './rtp-session';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CallMeta {
    callId:   string;
    from:     string;
    to:       string;
}

interface PendingInvite {
    callId:     string;
    from:       string;
    to:         string;
    via:        string;
    cseq:       string;
    toTag:      string;
    remoteAddr: string;
    remotePort: number;
    rtpSession: RtpSession;
}

// ─── SIP message parsing helpers ───────────────────────────────────────────────

function parseHeaders(lines: string[]): Map<string, string> {
    const headers = new Map<string, string>();
    for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const val = line.slice(idx + 1).trim();
        // Compact forms
        const canonMap: Record<string, string> = {
            'v': 'via', 'f': 'from', 't': 'to', 'i': 'call-id',
            'm': 'contact', 'l': 'content-length', 'c': 'content-type'
        };
        headers.set(canonMap[key] || key, val);
    }
    return headers;
}

function extractCallId(headers: Map<string, string>): string {
    return headers.get('call-id') || '';
}

function extractVia(headers: Map<string, string>): string {
    return headers.get('via') || '';
}

function extractField(headers: Map<string, string>, field: string): string {
    return headers.get(field) || '';
}

function extractCSeq(headers: Map<string, string>): string {
    return headers.get('cseq') || '';
}

/**
 * Extract the first Via header's sent-by host:port.
 * Used to route responses back to the sender.
 */
function parseViaAddr(via: string): { host: string; port: number } {
    // Via: SIP/2.0/UDP host:port;...
    const match = via.match(/SIP\/2\.0\/UDP\s+([^\s;:]+)(?::(\d+))?/i);
    if (match) {
        return { host: match[1], port: parseInt(match[2] || '5060', 10) };
    }
    return { host: '', port: 5060 };
}

/**
 * Parse the remote RTP endpoint from an SDP body.
 * Returns { ip, port } or null if not found.
 */
function parseSdpMedia(sdp: string): { ip: string; port: number } | null {
    let ip   = '';
    let port = 0;

    for (const line of sdp.split(/\r?\n/)) {
        const c = line.match(/^c=IN IP4\s+(.+)/);
        if (c) ip = c[1].trim();

        const m = line.match(/^m=audio\s+(\d+)/);
        if (m) port = parseInt(m[1], 10);
    }

    return ip && port ? { ip, port } : null;
}

// ─── SDP builder ──────────────────────────────────────────────────────────────

function buildSdpAnswer(localIp: string, localRtpPort: number): string {
    const ts = Math.floor(Date.now() / 1000);
    return [
        'v=0',
        `o=sbc ${ts} ${ts} IN IP4 ${localIp}`,
        's=SBC',
        `c=IN IP4 ${localIp}`,
        't=0 0',
        `m=audio ${localRtpPort} RTP/AVP 0`,
        'a=rtpmap:0 PCMU/8000',
        'a=ptime:20',
        'a=sendrecv',
        '',
    ].join('\r\n');
}

// ─── SIP response builder ─────────────────────────────────────────────────────

function buildResponse(
    statusCode: number,
    reasonPhrase: string,
    via: string,
    from: string,
    to: string,
    callId: string,
    cseq: string,
    localIp: string,
    localSipPort: number,
    body: string = ''
): string {
    const lines: string[] = [
        `SIP/2.0 ${statusCode} ${reasonPhrase}`,
        `Via: ${via}`,
        `From: ${from}`,
        `To: ${to}`,
        `Call-ID: ${callId}`,
        `CSeq: ${cseq}`,
        `Contact: <sip:sbc@${localIp}:${localSipPort}>`,
        `Server: NodeJS-SBC/1.0`,
    ];

    if (body) {
        lines.push('Content-Type: application/sdp');
        lines.push(`Content-Length: ${Buffer.byteLength(body, 'utf8')}`);
        lines.push('');
        lines.push(body);
    } else {
        lines.push('Content-Length: 0');
        lines.push('');
        lines.push('');
    }

    return lines.join('\r\n');
}

// ─── SipUa ────────────────────────────────────────────────────────────────────

export class SipUa extends EventEmitter {
    private socket:       dgram.Socket;
    private localIp:      string;
    private localSipPort: number;
    /** Map of Call-ID → pending invite (awaiting ACK). */
    private pending:      Map<string, PendingInvite> = new Map();

    constructor() {
        super();
        this.localIp      = process.env.SBC_PUBLIC_IP || '0.0.0.0';
        this.localSipPort = parseInt(process.env.SBC_SIP_PORT || '5060', 10);
        this.socket       = dgram.createSocket('udp4');

        this.socket.on('message', (msg, rinfo) => this._onMessage(msg, rinfo));
        this.socket.on('error',   (err)         => console.error('[SipUa] Socket error:', err));
    }

    listen(): void {
        this.socket.bind(this.localSipPort, () => {
            const addr = this.socket.address();
            console.log(`[SipUa] Listening on UDP ${addr.address}:${addr.port}`);
        });
    }

    // ── Message dispatcher ─────────────────────────────────────────────────────

    private _onMessage(buf: Buffer, rinfo: dgram.RemoteInfo): void {
        const raw = buf.toString('utf8');
        console.log(`[SipUa] Received from ${rinfo.address}:${rinfo.port}:\n${raw.substring(0, 300)}`);

        // Split headers from body
        const headerBodySep = raw.indexOf('\r\n\r\n');
        const headerPart    = headerBodySep >= 0 ? raw.slice(0, headerBodySep)   : raw;
        const body          = headerBodySep >= 0 ? raw.slice(headerBodySep + 4)  : '';

        const headerLines = headerPart.split('\r\n');
        const requestLine = headerLines[0] || '';
        const headers     = parseHeaders(headerLines.slice(1));

        // Determine method from request-line (e.g. "INVITE sip:... SIP/2.0")
        const methodMatch = requestLine.match(/^([A-Z]+)\s+/);
        if (!methodMatch) return; // ignore SIP responses

        const method = methodMatch[1];
        const callId = extractCallId(headers);

        switch (method) {
            case 'INVITE': this._handleInvite(headers, body, rinfo, callId); break;
            case 'ACK':    this._handleAck(callId);                          break;
            case 'BYE':    this._handleBye(headers, rinfo, callId);          break;
            case 'CANCEL': this._handleCancel(headers, rinfo, callId);       break;
            default:
                // Respond 405 Method Not Allowed for anything else
                this._send405(headers, rinfo, callId);
        }
    }

    // ── INVITE ─────────────────────────────────────────────────────────────────

    private _handleInvite(
        headers:  Map<string, string>,
        body:     string,
        rinfo:    dgram.RemoteInfo,
        callId:   string
    ): void {
        console.log(`[SipUa] INVITE for Call-ID: ${callId}`);

        const via   = extractVia(headers);
        const from  = extractField(headers, 'from');
        const to    = extractField(headers, 'to');
        const cseq  = extractCSeq(headers);
        const toTag = `tag-${crypto.randomBytes(4).toString('hex')}`;

        // 1. Send 100 Trying (no To-tag)
        const trying = buildResponse(100, 'Trying', via, from, to, callId, cseq,
            this.localIp, this.localSipPort);
        this._sendRaw(trying, rinfo.address, rinfo.port);

        // 2. Parse remote RTP endpoint from SDP
        const remoteRtp = parseSdpMedia(body);
        if (!remoteRtp) {
            console.error(`[SipUa] No audio in SDP for Call-ID ${callId} — rejecting`);
            const err = buildResponse(488, 'Not Acceptable Here', via, from, to, callId, cseq,
                this.localIp, this.localSipPort);
            this._sendRaw(err, rinfo.address, rinfo.port);
            return;
        }

        // 3. Allocate local RTP port
        const rtpSession = new RtpSession();
        rtpSession.setRemote({ ip: remoteRtp.ip, port: remoteRtp.port });
        console.log(`[SipUa] RTP: local=${rtpSession.localPort} remote=${remoteRtp.ip}:${remoteRtp.port}`);

        // Store pending invite (awaiting ACK)
        const toWithTag = to.includes('tag=') ? to : `${to};tag=${toTag}`;
        this.pending.set(callId, {
            callId,
            from,
            to: toWithTag,
            via,
            cseq,
            toTag,
            remoteAddr: rinfo.address,
            remotePort: rinfo.port,
            rtpSession,
        });

        // 4. Build SDP answer and send 200 OK
        const sdpAnswer = buildSdpAnswer(this.localIp, rtpSession.localPort);
        const ok = buildResponse(200, 'OK', via, from, toWithTag, callId, cseq,
            this.localIp, this.localSipPort, sdpAnswer);
        this._sendRaw(ok, rinfo.address, rinfo.port);
        console.log(`[SipUa] Sent 200 OK for Call-ID ${callId}`);
    }

    // ── ACK ───────────────────────────────────────────────────────────────────

    private _handleAck(callId: string): void {
        console.log(`[SipUa] ACK for Call-ID: ${callId}`);
        const inv = this.pending.get(callId);
        if (!inv) {
            console.warn(`[SipUa] ACK for unknown Call-ID: ${callId}`);
            return;
        }
        this.pending.delete(callId);

        const meta: CallMeta = { callId, from: inv.from, to: inv.to };
        this.emit('call', inv.rtpSession, meta);
        console.log(`[SipUa] Call established: ${callId}`);
    }

    // ── BYE ───────────────────────────────────────────────────────────────────

    private _handleBye(
        headers:  Map<string, string>,
        rinfo:    dgram.RemoteInfo,
        callId:   string
    ): void {
        console.log(`[SipUa] BYE for Call-ID: ${callId}`);

        const via  = extractVia(headers);
        const from = extractField(headers, 'from');
        const to   = extractField(headers, 'to');
        const cseq = extractCSeq(headers);

        const ok = buildResponse(200, 'OK', via, from, to, callId, cseq,
            this.localIp, this.localSipPort);
        this._sendRaw(ok, rinfo.address, rinfo.port);

        this.emit('hangup', callId);
    }

    // ── CANCEL ────────────────────────────────────────────────────────────────

    private _handleCancel(
        headers:  Map<string, string>,
        rinfo:    dgram.RemoteInfo,
        callId:   string
    ): void {
        console.log(`[SipUa] CANCEL for Call-ID: ${callId}`);

        const via  = extractVia(headers);
        const from = extractField(headers, 'from');
        const to   = extractField(headers, 'to');
        const cseq = extractCSeq(headers);

        // Acknowledge CANCEL
        const ok = buildResponse(200, 'OK', via, from, to, callId, cseq,
            this.localIp, this.localSipPort);
        this._sendRaw(ok, rinfo.address, rinfo.port);

        // If we sent a 200 OK for the INVITE, send 487 Request Terminated
        const inv = this.pending.get(callId);
        if (inv) {
            const invCseq = inv.cseq.replace('CANCEL', 'INVITE');
            const term = buildResponse(487, 'Request Terminated', inv.via, inv.from, inv.to,
                callId, invCseq, this.localIp, this.localSipPort);
            this._sendRaw(term, inv.remoteAddr, inv.remotePort);
            inv.rtpSession.close();
            this.pending.delete(callId);
        }

        this.emit('hangup', callId);
    }

    // ── 405 fallback ──────────────────────────────────────────────────────────

    private _send405(
        headers: Map<string, string>,
        rinfo:   dgram.RemoteInfo,
        callId:  string
    ): void {
        const via  = extractVia(headers);
        const from = extractField(headers, 'from');
        const to   = extractField(headers, 'to');
        const cseq = extractCSeq(headers);
        const resp = buildResponse(405, 'Method Not Allowed', via, from, to, callId, cseq,
            this.localIp, this.localSipPort);
        this._sendRaw(resp, rinfo.address, rinfo.port);
    }

    // ── UDP send ──────────────────────────────────────────────────────────────

    private _sendRaw(message: string, host: string, port: number): void {
        const buf = Buffer.from(message, 'utf8');
        this.socket.send(buf, 0, buf.length, port, host, (err) => {
            if (err) console.error(`[SipUa] Send error to ${host}:${port}:`, err);
        });
    }
}
