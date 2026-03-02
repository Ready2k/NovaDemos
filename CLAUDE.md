# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (root, frontend, backend)
npm run install:all

# Build everything
npm run build

# Build frontend or backend individually
npm run build:frontend
npm run build:backend

# Start backend (production, serves frontend at http://localhost:8080)
npm start

# Development (run in separate terminals)
npm run dev --prefix backend      # compile + run backend
npm run dev --prefix frontend-v2  # Next.js dev server

# Lint frontend
npm run lint --prefix frontend-v2

# E2E tests (main integration test)
node tests/test-complete-native.js

# Specific integration tests
node tests/test-dispute-flow.js
node tests/test-fraud-flow.js
node tests/test-bedrock-agent-mode.js
```

**Important**: Always access via `http://localhost:8080`, not `file://` — the browser requires HTTPS/HTTP origin for microphone access and WebSocket connections.

## Architecture Overview

Voice S2S is a real-time speech-to-speech platform powered by Amazon Nova Sonic. The backend is a Node.js WebSocket server; the frontend is a Next.js app served statically from the backend in production (`output: 'export'` in `next.config.ts`).

### Audio Pipeline

```
Browser mic → WebSocket binary frames (PCM16, 16kHz mono, 4096-sample chunks)
→ backend/src/server.ts
→ transcribe-client.ts (AWS Transcribe Streaming)
→ sonic-client.ts (bidirectional Nova Sonic stream)
→ tool-manager.ts (tool execution if triggered)
→ binary audio frames back to browser
```

### Dual Brain Modes

- **Nova Sonic Direct** (`sonic-client.ts`): Low-latency mode (~200-500ms), tools run natively within the model stream.
- **Bedrock Agent** (`bedrock-agent-client.ts`): Complex multi-step workflows via AgentCore; higher latency (~1-3s) but supports orchestrated reasoning.

### WebSocket Message Protocol

Frontend ↔ Backend exchange JSON control messages and binary audio frames on the same WebSocket connection (port 8080).

Key frontend→backend: `sessionConfig`, `audio` (binary), `text`, `updateCredentials`, `toolResult`, `clearChat`

Key backend→frontend: `connected`, `sessionStart`, `transcript`, `toolUse`, `toolResult`, `tokenUsage`, `workflowUpdate`, `error`

### Tool System

Tools are defined as JSON files in `/tools/`. Each file has `name`, `description`, `input_schema`, `instruction`, `category`, and optional `gatewayTarget`. `tool-manager.ts` loads these at startup and dispatches execution.

**Tool execution routing**: When a tool JSON has a `gatewayTarget` field, the call is dispatched via `AgentCoreGatewayClient` (`agentcore-gateway-client.ts`) using AWS SigV4-signed MCP requests to the AgentCore Gateway. Tools without `gatewayTarget` are handled locally in `server.ts`.

To add a tool: create a JSON file in `/tools/` following existing examples. Set `gatewayTarget` to a gateway function name (e.g. `"get-Time___get_current_time"`) to route through the gateway.

### Prompt Composition

System prompts are assembled in `sonic-client.ts` from multiple `.txt` files in `backend/prompts/`:
- `core-system_default.txt` — base instructions
- `core-guardrails.txt` — safety rules
- `core-tool_access_assistant.txt` — tool usage instructions
- `persona-*.txt` — persona-specific behavior (swapped per session)
- `hidden-dialect_detection.txt` — injected silently for language detection

`prompt-service.ts` handles optional Langfuse prompt versioning (fetches prompts with `label: "production"`).

### Workflows

Workflow graphs are embedded JSON files in `backend/src/` (`workflow-banking.json`, `workflow-disputes.json`, `workflow-idv.json`, etc.). They define visual conversation state machines linked to personas and are auto-injected into system prompts. The frontend `WorkflowDesigner` component visualizes them.

### Dialect Detection & Voice Switching

`dialect-detector.ts` parses AWS Transcribe language identification results and maps locale codes (e.g. `en-GB`, `fr-FR`) to voice IDs. `transition-handler.ts` generates natural voice-switch transition messages via Bedrock. This runs automatically when language detection confidence exceeds a threshold.

### Phantom Action Watcher

`phantom-action-watcher.ts` detects when the LLM verbally promises to perform an action (e.g. "I'll check your balance") but fails to call the corresponding tool in the same turn. It issues a reprompt to force tool execution. High-confidence patterns include: balance check, transaction lookup, dispute filing.

### Simulation / Automated Testing

`simulation-service.ts` uses Claude Haiku (`anthropic.claude-3-haiku-20240307-v1:0`) via Bedrock to auto-generate user-role messages for scripted E2E test conversations. Tests in `tests/` connect via WebSocket with a `SimulatedUser` persona. Test outcomes (`PASS`/`FAIL`/`UNKNOWN`) are persisted as JSON in `tests/test_logs/`.

### Frontend State

Central state lives in `frontend-v2/lib/context/AppContext.tsx`. Key custom hooks:
- `useWebSocket` — WebSocket lifecycle and message dispatch
- `useAudioProcessor` — mic capture and audio playback
- `useWorkflowSimulator` — workflow step tracking
- `useSessionStats` — token usage and cost tracking

### AWS Connect Integration (Telephony)

`aws/lambdas/kvs-bridge/` contains two Lambda functions for Amazon Connect integration:
- `start-session.js` — invoked when a call arrives; creates a DynamoDB session record with KVS stream details
- `process-turn.js` — processes each conversation turn from the Kinesis Video Stream

`aws/cloudformation.yaml` and `aws/banking-data-layer.yaml` define the supporting infrastructure.

## Configuration

Backend environment variables go in `backend/.env` (see `backend/.env.example`):

```
NOVA_AWS_REGION=us-east-1
NOVA_AWS_ACCESS_KEY_ID=...
NOVA_AWS_SECRET_ACCESS_KEY=...
NOVA_AWS_SESSION_TOKEN=...        # optional (SSO)
NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0
AGENT_CORE_RUNTIME_ARN=...        # optional (Bedrock Agent mode)
LANGFUSE_PUBLIC_KEY=...           # optional (observability)
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASEURL=...              # optional, defaults to https://cloud.langfuse.com
DEBUG=true                        # optional
```

`NOVA_`-prefixed credentials take precedence over standard `AWS_`-prefixed env vars. AWS credentials can also be set at runtime via the frontend Settings panel (stored in `sessionStorage`).

### Persistent Data Files

- `knowledge_bases.json` (root) — configured knowledge base entries, managed via the Settings panel
- `chat_history/` (root) — session transcripts saved on disconnect
- `backend/data/presets.json` — persona preset definitions

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/server.ts` | WebSocket server, session orchestration, tool routing |
| `backend/src/sonic-client.ts` | Amazon Nova Sonic bidirectional stream |
| `backend/src/tool-manager.ts` | Dynamic tool loading and execution |
| `backend/src/agentcore-gateway-client.ts` | MCP gateway client for tool dispatch |
| `backend/src/bedrock-agent-client.ts` | Agent mode for complex workflows |
| `backend/src/services/prompt-service.ts` | Langfuse prompt fetching |
| `backend/src/phantom-action-watcher.ts` | Detects LLM "phantom" tool promises |
| `backend/src/simulation-service.ts` | Auto-generates user messages for E2E tests |
| `backend/src/dialect-detector.ts` | Maps Transcribe locale codes to voice IDs |
| `backend/src/transition-handler.ts` | Generates voice-switch transition messages |
| `frontend-v2/app/page.tsx` | Main UI entry point |
| `frontend-v2/lib/context/AppContext.tsx` | Global state management |
| `frontend-v2/lib/hooks/useWebSocket.ts` | WebSocket connection management |
| `tools/*.json` | Tool definitions |
| `backend/prompts/*.txt` | System prompt fragments |
| `backend/src/workflow-*.json` | Workflow graph definitions |
