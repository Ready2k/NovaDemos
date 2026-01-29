# System Flow Diagram

## Current Implementation: Workflow Selection

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                              │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Select Experience:                                           │ │
│  │  ┌─────────────────────────────────────────────────────────┐  │ │
│  │  │ ▼ Triage Agent                                          │  │ │
│  │  │   Banking Disputes Agent                                │  │ │
│  │  │   Simple Banking Agent                                  │  │ │
│  │  │   Mortgage Agent                                        │  │ │
│  │  └─────────────────────────────────────────────────────────┘  │ │
│  │                                                               │ │
│  │  [Connect Button]                                             │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ User selects "Banking Disputes Agent"
                                  │ and clicks Connect
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         WEBSOCKET CONNECTION                        │
│                                                                     │
│  Frontend → Gateway                                                 │
│  {                                                                  │
│    type: 'select_workflow',                                         │
│    workflowId: 'persona-BankingDisputes'                            │
│  }                                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         GATEWAY ROUTING                             │
│                                                                     │
│  1. Receive workflow selection                                      │
│  2. Create session with selected workflow                           │
│  3. Query AgentRegistry for agent with capability                   │
│  4. Route to selected agent                                         │
│                                                                     │
│  selectedWorkflowId = 'persona-BankingDisputes'                     │
│  session = createSession(sessionId, selectedWorkflowId)             │
│  agent = findAgentByCapability(selectedWorkflowId)                  │
│  connectToAgent(agent)                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT RUNTIME                               │
│                                                                     │
│  1. Load persona configuration                                      │
│     File: backend/personas/persona-BankingDisputes.json             │
│     {                                                               │
│       "id": "persona-BankingDisputes",                              │
│       "name": "Banking Disputes Agent",                             │
│       "promptFile": "persona-BankingDisputes.txt",                  │
│       "workflows": ["disputes"],                                    │
│       "allowedTools": ["check_balance", "create_dispute"],          │
│       "voiceId": "matthew"                                          │
│     }                                                               │
│                                                                     │
│  2. Load prompt file                                                │
│     File: backend/prompts/persona-BankingDisputes.txt               │
│     Content: Detailed instructions for banking disputes             │
│                                                                     │
│  3. Load workflow                                                   │
│     File: backend/workflows/workflow_disputes.json                  │
│     Content: Workflow nodes and edges                               │
│                                                                     │
│  4. Combine into system prompt                                      │
│     systemPrompt = personaPrompt + workflowInstructions             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         NOVA SONIC                                  │
│                                                                     │
│  Initialize with:                                                   │
│  - Voice: matthew                                                   │
│  - System Prompt: Banking Disputes persona + workflow               │
│  - Tools: check_balance, create_dispute                             │
│                                                                     │
│  Start conversation with persona-specific greeting                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         USER CONVERSATION                           │
│                                                                     │
│  Agent: "Hello, I'm here to help with banking disputes..."          │
│  User: "I have an unauthorized transaction"                         │
│  Agent: "Let me check your account and create a dispute..."         │
│  [Uses banking tools and follows disputes workflow]                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Persona Loading

```
┌──────────────────────┐
│  Persona Config      │
│  (JSON)              │
│                      │
│  - id                │
│  - name              │
│  - promptFile ───────┼──┐
│  - workflows         │  │
│  - allowedTools      │  │
│  - voiceId           │  │
└──────────────────────┘  │
                          │
                          │
                          ▼
                    ┌──────────────────────┐
                    │  Prompt File         │
                    │  (TXT)               │
                    │                      │
                    │  ### ROLE ###        │
                    │  You are...          │
                    │                      │
                    │  ### GREETING ###    │
                    │  Say: "Hello..."     │
                    │                      │
                    │  ### LOGIC ###       │
                    │  If X then Y...      │
                    └──────────────────────┘
                          │
                          │
                          ▼
                    ┌──────────────────────┐
                    │  Workflow File       │
                    │  (JSON)              │
                    │                      │
                    │  - nodes             │
                    │  - edges             │
                    │  - decisions         │
                    └──────────────────────┘
                          │
                          │
                          ▼
                    ┌──────────────────────┐
                    │  Combined System     │
                    │  Prompt              │
                    │                      │
                    │  [Persona Prompt]    │
                    │  +                   │
                    │  [Workflow Instruct] │
                    └──────────────────────┘
                          │
                          │
                          ▼
                    ┌──────────────────────┐
                    │  Nova Sonic          │
                    │  (LLM)               │
                    └──────────────────────┘
```

---

## Comparison: Before vs After

### Before (Hardcoded Triage)

```
User clicks Connect
    ↓
Gateway (hardcoded)
    ↓
Triage Agent (always)
    ↓
Workflow instructions only (no persona prompt)
    ↓
Generic behavior
```

**Problems:**
- ❌ No choice of experience
- ❌ Always goes through triage
- ❌ Triage has no persona prompt
- ❌ Cannot test specific personas directly

---

### After (Workflow Selection)

```
User selects workflow from dropdown
    ↓
User clicks Connect
    ↓
Gateway routes to selected agent
    ↓
Agent loads persona config + prompt + workflow
    ↓
Persona-specific behavior
```

**Benefits:**
- ✅ User chooses experience
- ✅ Direct access to any persona
- ✅ Each persona has detailed prompt
- ✅ Can test specific personas easily

---

## Multi-Agent Journey (Future)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         JOURNEY SELECTOR                            │
│                                                                     │
│  Select Journey:                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ▼ Complaints Journey                                        │   │
│  │   Banking Journey                                           │   │
│  │   Mortgage Journey                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Journey Steps:                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. Triage ✓                                                │   │
│  │  2. Complaints (current) ←                                  │   │
│  │  3. Resolution                                              │   │
│  │  4. Survey                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         JOURNEY ROUTER                              │
│                                                                     │
│  Journey Config:                                                    │
│  {                                                                  │
│    "id": "complaints-journey",                                      │
│    "steps": [                                                       │
│      {                                                              │
│        "id": "triage",                                              │
│        "agentId": "triage",                                         │
│        "handoffRules": [                                            │
│          { "outcome": "PROCEED", "nextStep": "complaints" }         │
│        ]                                                            │
│      },                                                             │
│      {                                                              │
│        "id": "complaints",                                          │
│        "agentId": "banking",                                        │
│        "handoffRules": [                                            │
│          { "outcome": "DISPUTE_CREATED", "nextStep": "resolution" } │
│        ]                                                            │
│      },                                                             │
│      ...                                                            │
│    ]                                                                │
│  }                                                                  │
│                                                                     │
│  Journey State (Redis):                                             │
│  {                                                                  │
│    "journeyId": "complaints-journey",                               │
│    "currentStepId": "complaints",                                   │
│    "history": ["triage"],                                           │
│    "sessionId": "abc-123"                                           │
│  }                                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT SEQUENCE                              │
│                                                                     │
│  Step 1: Triage Agent                                               │
│  ├─ Greets customer                                                 │
│  ├─ Checks account status                                           │
│  ├─ Determines routing                                              │
│  └─ Outcome: "PROCEED" → Handoff to Complaints                      │
│                                                                     │
│  Step 2: Complaints Agent (Banking)                                 │
│  ├─ Handles complaint                                               │
│  ├─ Creates dispute                                                 │
│  ├─ Gathers evidence                                                │
│  └─ Outcome: "DISPUTE_CREATED" → Handoff to Resolution              │
│                                                                     │
│  Step 3: Resolution Agent                                           │
│  ├─ Reviews dispute                                                 │
│  ├─ Makes decision                                                  │
│  ├─ Communicates outcome                                            │
│  └─ Outcome: "RESOLVED" → Handoff to Survey                         │
│                                                                     │
│  Step 4: Survey Agent                                               │
│  ├─ Collects feedback                                               │
│  ├─ Thanks customer                                                 │
│  └─ Outcome: "COMPLETE" → End journey                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Workflow    │  │  Command     │  │  Chat        │             │
│  │  Selector    │  │  Bar         │  │  Container   │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Hook                                              │  │
│  │  - Manages connection                                        │  │
│  │  - Sends workflow selection                                  │  │
│  │  - Handles messages                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ WebSocket
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                         GATEWAY (Express + WS)                      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Server                                            │  │
│  │  - Receives workflow selection                               │  │
│  │  - Routes to selected agent                                  │  │
│  │  - Manages handoffs (future)                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Agent Registry (Redis)                                      │  │
│  │  - Tracks available agents                                   │  │
│  │  - Finds agents by capability                                │  │
│  │  - Health monitoring                                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Session Router (Redis)                                      │  │
│  │  - Creates sessions                                          │  │
│  │  - Routes to agents                                          │  │
│  │  - Manages transfers                                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  REST API                                                    │  │
│  │  - /api/personas (list, get, create, update, delete)        │  │
│  │  - /api/workflows                                            │  │
│  │  - /api/agents                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ WebSocket
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT RUNTIME                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Persona Loader                                              │  │
│  │  - Loads persona config                                      │  │
│  │  - Loads prompt file                                         │  │
│  │  - Loads workflow                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  LangGraph Workflow Engine                                   │  │
│  │  - Executes workflow nodes                                   │  │
│  │  - Handles decisions                                         │  │
│  │  - Manages state                                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Tool Executor                                               │  │
│  │  - Executes allowed tools                                    │  │
│  │  - Returns results                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ AWS SDK
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS NOVA SONIC                              │
│                                                                     │
│  - Speech-to-Speech LLM                                             │
│  - Voice synthesis                                                  │
│  - Real-time conversation                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
Voice_S2S/
│
├── frontend-v2/
│   ├── app/
│   │   └── page.tsx                    [Modified] Workflow selection
│   ├── components/
│   │   └── chat/
│   │       └── CommandBar.tsx          [Modified] Workflow selector UI
│   └── lib/
│       └── hooks/
│           └── useWebSocket.ts         [Modified] Workflow parameter
│
├── gateway/
│   └── src/
│       └── server.ts                   [Modified] Dynamic routing
│
├── agents/
│   └── src/
│       ├── persona-loader.ts           [Existing] Loads personas
│       └── agent-runtime-s2s.ts        [Existing] Uses personas
│
├── backend/
│   ├── personas/
│   │   ├── triage.json                 [Modified] Added promptFile
│   │   ├── persona-BankingDisputes.json
│   │   ├── persona-SimpleBanking.json
│   │   └── persona-mortgage.json
│   │
│   ├── prompts/
│   │   ├── persona-triage.txt          [Created] Triage prompt
│   │   ├── persona-BankingDisputes.txt
│   │   ├── persona-SimpleBanking.txt
│   │   └── persona-mortgage.txt
│   │
│   └── workflows/
│       ├── workflow_triage.json
│       ├── workflow_disputes.json
│       ├── workflow_banking.json
│       └── workflow_persona-mortgage.json
│
└── docs/
    ├── WORKFLOW_SELECTION_IMPLEMENTED.md
    ├── TEST_WORKFLOW_SELECTION.md
    ├── CONNECT_FLOW_COMPLETE.md
    ├── YOUR_QUESTIONS_ANSWERED.md
    ├── RESTART_AGENT_FOR_TRIAGE.md
    ├── JOURNEY_CONFIGURATION_EXPLAINED.md
    ├── IMPLEMENTATION_COMPLETE_SUMMARY.md
    └── SYSTEM_FLOW_DIAGRAM.md          [This file]
```

---

## Summary

This diagram shows:
1. **Current Implementation** - Workflow selection system
2. **Data Flow** - How persona configs are loaded
3. **Before vs After** - What changed
4. **Future Vision** - Multi-agent journeys
5. **Architecture** - Complete system overview
6. **File Structure** - Where everything lives

Use this as a reference for understanding how the system works!
