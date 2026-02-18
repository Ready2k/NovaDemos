# Adding a New LangGraph Agent (Nova2Sonic Wrapper)

This guide explains how to create and add a new LangGraph Agent to the Voice S2S solution, wrapping it with the Nova2Sonic voice capabilities.

We will use a "Card Replacement Agent" as a concrete example.

## Architecture Overview

In this solution, each Agent runs as a separate process using the **Unified Agent Runtime**. This runtime:
1.  **Wraps the Agent** with the `VoiceSideCar` (Nova2Sonic wrapper) for voice I/O.
2.  **Executes the Workflow** using `GraphExecutor` (LangGraph logic).
3.  **Connects to the Gateway** via WebSocket for routing and state management.

To add a new agent, you simply define its logic (Workflow + Persona) and spin up a new process. The system handles the rest.

---

## Step 1: Define the Workflow

Create a new workflow definition file in `gateway/workflows/`. This defines the LangGraph nodes and edges.

**File:** `gateway/workflows/workflow_card_replacement.json`

```json
{
  "id": "card_replacement",
  "name": "Card Replacement Agent",
  "personaId": "card_replacement",
  "nodes": [
    {
      "id": "start",
      "label": "Start",
      "type": "start",
      "message": "Welcome to the Card Replacement service. Are you reporting a lost or damaged card?",
      "outcome": "await_input"
    },
    {
      "id": "check_reason",
      "label": "Check Reason",
      "type": "decision",
      "workflowId": "card_replacement_logic"
    },
    {
      "id": "process_replacement",
      "label": "Process Replacement",
      "type": "tool",
      "toolName": "order_replacement_card",
      "outcome": "await_result"
    },
    {
      "id": "end",
      "label": "End",
      "type": "end",
      "outcome": "return_to_triage"
    }
  ],
  "edges": [
    { "from": "start", "to": "check_reason" },
    { "from": "check_reason", "to": "process_replacement", "label": "replace_card" },
    { "from": "process_replacement", "to": "end" }
  ]
}
```

---

## Step 2: Define the Persona

Create a persona configuration in `backend/personas/`. This defines the agent's personality, system prompt, and voice settings.

**File:** `backend/personas/card_replacement.json`

```json
{
  "id": "card_replacement",
  "name": "Card Replacement Specialist",
  "description": "Handles lost, stolen, or damaged card replacements.",
  "voiceId": "amy",
  "systemPrompt": "You are a helpful banking assistant specialized in replacing credit and debit cards. Your goal is to identify if the card is lost, stolen, or damaged, and confirm the shipping address before ordering a replacement. Always be empathetic if the card was stolen.",
  "allowedTools": [
    "order_replacement_card",
    "check_address",
    "return_to_triage"
  ]
}
```

> **Note:** If your agent needs custom tools (like `order_replacement_card`), you would add them to `local-tools/src/tools/` and register them there. For this guide, we assume standard or existing tools.

---

## Step 3: Register Handoff Tools

To allow other agents (like Triage) to transfer users to your new agent, you must register it as a transfer destination.

**1. Update `agents/src/handoff-tools.ts`:**

Add your new tool definition to the `generateHandoffTools()` function:

```typescript
// agents/src/handoff-tools.ts

export function generateHandoffTools(): HandoffTool[] {
    return [
        // ... existing tools ...
        {
            toolSpec: {
                name: 'transfer_to_card_replacement',
                description: 'Transfer to Card Replacement Agent. Use when user needs to replace a lost, stolen, or damaged card.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            reason: { type: 'string', description: 'Reason for transfer' },
                            context: { type: 'string', description: 'Context to pass' }
                        },
                        required: ['reason']
                    })
                }
            }
        }
    ];
}
```

**2. Update `gateway/src/server.ts`:**

Update the hardcoded list of handoff tools to ensure the Gateway handles the transfer correctly.

```typescript
// gateway/src/server.ts (approx line 440)

const handoffTools = [
    'transfer_to_idv',
    'transfer_to_banking',
    // ...
    'transfer_to_card_replacement', // <--- ADD THIS
    'return_to_triage'
];
```

---

## Step 4: Add to Startup Script

Configure the agent to run as a separate process in `start-agents-local.sh`. Assign it a unique port (e.g., `8087`).

**File:** `start-agents-local.sh`

```bash
# ... existing agents ...

echo "Starting Card Replacement Agent on port 8087..."
MODE=hybrid \
AGENT_ID=card_replacement \
AGENT_PORT=8087 \
WORKFLOW_FILE=../gateway/workflows/workflow_card_replacement.json \
LOCAL_TOOLS_URL=http://localhost:9000 \
npm run dev > /tmp/agent-card-replacement.log 2>&1 &

# ...
```

---

## Step 5: Verification

1.  **Restart All Services**:
    ```bash
    ./start-agents-local.sh
    ```

2.  **Test via Agent Test Page**:
    - Open `http://localhost:3000/agent-test`
    - You should be able to speak/type to the Triage Agent.
    - Ask: *"I lost my card and need a new one."*
    - The Triage Agent should call `transfer_to_card_replacement`.
    - The Gateway will route the session to your new agent on port 8087.
    - Your new agent will respond with its welcome message using the "Amy" voice.

## Summary of Changes Required

| Component | File | Action |
|-----------|------|--------|
| **Gateway** | `gateway/workflows/workflow_card_replacement.json` | Create new workflow |
| **Backend** | `backend/personas/card_replacement.json` | Create new persona |
| **Agents** | `agents/src/handoff-tools.ts` | Add `transfer_to_card_replacement` tool |
| **Gateway** | `gateway/src/server.ts` | Add to `handoffTools` list |
| **Scripts** | `start-agents-local.sh` | Add startup command |

This modular architecture allows you to add infinite specialized agents without modifying the core runtime code.
