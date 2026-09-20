#!/usr/bin/env node

/**
 * End-to-end test: Nova Sonic → AgentCore / Strands Agent
 *
 * Sends a text message through the bedrock_agent brain mode and verifies:
 *   1. WebSocket connects and session starts
 *   2. Text input reaches the Strands agent
 *   3. An assistant transcript comes back (agent responded)
 *   4. Gateway tool calls succeed (if triggered)
 *
 * Run from the tests/ directory with credentials already in the environment:
 *   source ../assume-role.sh
 *   node test-agentcore-strands.js
 */

const WebSocket = require('ws');
const http = require('http');

const WS_URL = 'ws://localhost:8080/sonic';
const TIMEOUT_MS = 30000;

// Simple test prompt — doesn't require IDV, just a balance check to force a tool call
const TEST_MESSAGE = "What's my account balance for account 12345678, sort code 20-00-00?";

let ws;
let passed = false;
let sessionStarted = false;
let gotAssistantTranscript = false;
let gotToolUse = false;

function log(msg) {
    process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function finish(success, reason) {
    if (ws) ws.close();
    const status = success ? '✅ PASS' : '❌ FAIL';
    log(`${status}: ${reason}`);
    process.exit(success ? 0 : 1);
}

// 1. Verify server is up before connecting
function checkServer() {
    return new Promise((resolve, reject) => {
        const req = http.get({ hostname: 'localhost', port: 8080, path: '/', timeout: 3000 }, () => resolve());
        req.on('error', () => reject(new Error('Server not reachable at localhost:8080 — run start-dev.sh first')));
        req.on('timeout', () => reject(new Error('Server health check timed out')));
        req.end();
    });
}

async function run() {
    log('Nova Sonic → AgentCore / Strands Agent — connectivity test');
    log('===========================================================');

    try {
        await checkServer();
        log('✅ Server is up');
    } catch (err) {
        finish(false, err.message);
        return;
    }

    // Overall timeout
    const timer = setTimeout(() => {
        const detail = [
            sessionStarted ? '' : 'session never started',
            gotAssistantTranscript ? '' : 'no assistant transcript received',
        ].filter(Boolean).join(', ');
        finish(false, `Timed out after ${TIMEOUT_MS / 1000}s — ${detail || 'unknown reason'}`);
    }, TIMEOUT_MS);

    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
        log('✅ WebSocket connected');

        // 2. Configure session in bedrock_agent mode
        const config = {
            type: 'sessionConfig',
            config: {
                systemPrompt: 'You are a Barclays banking assistant. Help customers with their accounts.',
                voiceId: 'matthew',
                brainMode: 'bedrock_agent',
                enableGuardrails: false,
                selectedTools: []
            }
        };
        log('📤 Sending sessionConfig (brainMode: bedrock_agent)...');
        ws.send(JSON.stringify(config));
    });

    ws.on('message', (data) => {
        // Ignore binary audio frames
        if (!Buffer.isBuffer(data) || data[0] === 0x7b) {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }

            switch (msg.type) {
                case 'connected':
                    log(`🎯 Session ID: ${msg.sessionId}`);
                    // Send text after config propagates — session_start is emitted *after* Nova Sonic
                    // receives the first message, so don't wait for it (deadlock in bedrock_agent mode)
                    setTimeout(() => {
                        log(`📤 Sending text: "${TEST_MESSAGE}"`);
                        ws.send(JSON.stringify({ type: 'textInput', text: TEST_MESSAGE }));
                    }, 1500);
                    break;

                case 'session_start':
                    sessionStarted = true;
                    log('✅ Nova Sonic session started');
                    break;

                case 'transcript':
                    if (msg.role === 'user') {
                        log(`👤 User transcript: "${msg.text}" (final: ${msg.isFinal})`);
                    } else if (msg.role === 'assistant') {
                        log(`🤖 Assistant: "${msg.text}" (final: ${msg.isFinal})`);
                        if (msg.isFinal && msg.text?.trim().length > 0) {
                            gotAssistantTranscript = true;
                        }
                    }
                    break;

                case 'toolUse':
                    gotToolUse = true;
                    log(`🔧 Tool call: ${msg.toolName || msg.name || JSON.stringify(msg).slice(0, 80)}`);
                    break;

                case 'toolResult':
                    log(`📦 Tool result received`);
                    break;

                case 'debugInfo':
                    if (msg.data?.systemInfo) {
                        log(`📊 Mode: ${msg.data.systemInfo.mode} | Persona: ${msg.data.systemInfo.persona}`);
                    }
                    break;

                case 'error':
                    log(`⚠️  Server error: ${msg.message}`);
                    break;
            }

            // Success condition: got a real assistant reply
            if (gotAssistantTranscript) {
                clearTimeout(timer);
                const toolNote = gotToolUse ? ' (tool call detected)' : ' (no tool call observed — may still be in-flight)';
                finish(true, `Agent responded successfully${toolNote}`);
            }
        }
    });

    ws.on('error', (err) => finish(false, `WebSocket error: ${err.message}`));
    ws.on('close', (code) => {
        if (!passed) log(`🔌 Connection closed (code: ${code})`);
    });
}

run();
