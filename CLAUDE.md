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

# E2E tests
node tests/test-complete-native.js
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

- **Nova Sonic Direct** (`sonic-client.ts`): Low-latency mode, tools run natively within the model stream.
- **Bedrock Agent** (`bedrock-agent-client.ts`): Complex multi-step workflows via AgentCore; higher latency but supports orchestrated reasoning.

### WebSocket Message Protocol

Frontend ↔ Backend exchange JSON control messages and binary audio frames on the same WebSocket connection (port 8080).

Key frontend→backend: `sessionConfig`, `audio` (binary), `text`, `updateCredentials`, `toolResult`, `clearChat`

Key backend→frontend: `connected`, `sessionStart`, `transcript`, `toolUse`, `toolResult`, `tokenUsage`, `workflowUpdate`, `error`

### Tool System

Tools are defined as JSON files in `/tools/`. Each file has `name`, `description`, `input_schema`, `instruction`, `category`, and optional `gatewayTarget`. `tool-manager.ts` loads these at startup and dispatches execution. To add a tool: create a JSON file in `/tools/`, following existing examples.

### Prompt Composition

System prompts are assembled from multiple `.txt` files in `backend/prompts/`:
- `core-system_default.txt` — base instructions
- `core-guardrails.txt` — safety rules
- `core-tool_access_assistant.txt` — tool usage instructions
- `persona-*.txt` — persona-specific behavior (swapped per session)
- `hidden-dialect_detection.txt` — injected silently for language detection

`prompt-service.ts` handles composition and optional Langfuse versioning.

### Workflows

JSON workflow graphs (`workflows/` directory and embedded `workflow-*.json` files in `backend/src/`) define visual conversation state machines linked to personas. They are auto-injected into system prompts and visualized in the frontend's WorkflowDesigner component.

### Frontend State

Central state lives in `frontend-v2/lib/context/AppContext.tsx`. Key custom hooks:
- `useWebSocket` — WebSocket lifecycle and message dispatch
- `useAudioProcessor` — mic capture and audio playback
- `useWorkflowSimulator` — workflow step tracking
- `useSessionStats` — token usage and cost tracking

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
LANGFUSE_HOST=...
DEBUG=true                        # optional
```

AWS credentials can also be set at runtime via the frontend Settings panel (stored in `sessionStorage`).

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/server.ts` | WebSocket server, session orchestration |
| `backend/src/sonic-client.ts` | Amazon Nova Sonic bidirectional stream |
| `backend/src/tool-manager.ts` | Dynamic tool loading and execution |
| `backend/src/bedrock-agent-client.ts` | Agent mode for complex workflows |
| `backend/src/services/prompt-service.ts` | Prompt assembly and Langfuse integration |
| `frontend-v2/app/page.tsx` | Main UI entry point |
| `frontend-v2/lib/context/AppContext.tsx` | Global state management |
| `frontend-v2/lib/hooks/useWebSocket.ts` | WebSocket connection management |
| `tools/*.json` | Tool definitions |
| `backend/prompts/*.txt` | System prompt fragments |
| `workflows/*.json` | Workflow graph definitions |
