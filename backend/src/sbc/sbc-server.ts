/**
 * sbc-server.ts — Entry point for the SIP Session Border Controller process.
 *
 * Run as a standalone Node.js process (separate ECS container from the main
 * WebSocket server).  Requires host networking for the RTP port range.
 *
 * Startup:
 *   node dist/sbc/sbc-server.js
 *
 * Required environment variables:
 *   SBC_PUBLIC_IP        — public IP advertised in SIP Contact + SDP
 *   SBC_SIP_PORT         — UDP port for SIP (default 5060)
 *   SBC_RTP_PORT_BASE    — first UDP port in the RTP pool (default 10000)
 *   SBC_RTP_PORT_COUNT   — pool size (default 200 → 100 concurrent calls)
 *   NOVA_AWS_REGION      — AWS region for Bedrock
 *   NOVA_AWS_ACCESS_KEY_ID / NOVA_AWS_SECRET_ACCESS_KEY
 *   NOVA_SONIC_MODEL_ID  — e.g. amazon.nova-2-sonic-v1:0
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { SipUa }      from './sip-ua';
import { CallSession } from './call-session';
import { RtpSession }  from './rtp-session';
import { CallMeta }    from './sip-ua';

// ─── Validate required env vars ───────────────────────────────────────────────

const requiredVars = ['SBC_PUBLIC_IP', 'NOVA_AWS_REGION'];
for (const v of requiredVars) {
    if (!process.env[v]) {
        console.warn(`[SbcServer] WARNING: ${v} is not set`);
    }
}

console.log('[SbcServer] Starting SBC...');
console.log(`[SbcServer] SBC_PUBLIC_IP     = ${process.env.SBC_PUBLIC_IP || '(not set)'}`);
console.log(`[SbcServer] SBC_SIP_PORT      = ${process.env.SBC_SIP_PORT || '5060'}`);
console.log(`[SbcServer] SBC_RTP_PORT_BASE = ${process.env.SBC_RTP_PORT_BASE || '10000'}`);
console.log(`[SbcServer] SBC_RTP_PORT_COUNT= ${process.env.SBC_RTP_PORT_COUNT || '200'}`);
console.log(`[SbcServer] NOVA_SONIC_MODEL  = ${process.env.NOVA_SONIC_MODEL_ID || 'amazon.nova-2-sonic-v1:0'}`);

// ─── Active calls registry ────────────────────────────────────────────────────

const activeCalls = new Map<string, CallSession>();

// ─── SIP UA ───────────────────────────────────────────────────────────────────

const sip = new SipUa();

sip.on('call', (rtpSession: RtpSession, meta: CallMeta) => {
    console.log(`[SbcServer] New call: ${meta.callId} from ${meta.from}`);
    const session = new CallSession(rtpSession, meta);
    activeCalls.set(meta.callId, session);
});

sip.on('hangup', (callId: string) => {
    console.log(`[SbcServer] Hangup: ${callId}`);
    const session = activeCalls.get(callId);
    if (session) {
        session.end();
        activeCalls.delete(callId);
    } else {
        console.warn(`[SbcServer] Hangup for unknown Call-ID: ${callId}`);
    }
});

sip.listen();

console.log('[SbcServer] SBC ready');

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
    console.log(`[SbcServer] Received ${signal} — shutting down (${activeCalls.size} active calls)`);
    for (const [callId, session] of activeCalls) {
        console.log(`[SbcServer] Ending call ${callId}`);
        session.end();
    }
    activeCalls.clear();
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
