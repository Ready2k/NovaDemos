# Connect Flow & Configuration Guide

This document explains what happens when you click "Connect" and **where the Persona → Workflow → Tools mapping lives** in the refactored system.

---

## Quick Answer: Where is the Configuration?

**The Persona → Workflow → Tools mapping is PARTIALLY implemented but NOT fully connected.**

### What EXISTS:
- ✅ Workflow files (`backend/workflows/workflow_*.json`) contain workflow logic
- ✅ Workflow files have `testConfig.personaId` field (e.g., "persona-BankingDisputes")
- ✅ Workflow files have voice and metadata
- ✅ Persona prompts exist in `backend/prompts/persona-*.txt`
- ✅ Tools exist in `backend/tools/*.json`

### What's MISSING:
- ❌ No automatic link from workflow → persona prompt file
- ❌ No tool filtering (all tools available to all agents)
- ❌ No explicit persona configuration file that ties everything together
- ❌ Workflow nodes reference tools by name, but no validation/filtering

### Where to Configure NOW:

**To change agent behavior, edit these files:**

1. **Workflow Logic & Voice:** `backend/workflows/workflow_banking.json`
   - Nodes, edges, decision logic
   - `voiceId` field (e.g., "tiffany")
   - `testConfig.personaId` (used for agent registration)

2. **Agent Instructions (MANUAL):** `backend/prompts/persona-BankingDisputes.txt`
   - Detailed system prompt
   - NOT automatically loaded - must be manually injected

3. **Tool Definitions:** `backend/tools/perform_idv_check.json`
   - Individual tool schemas
   - Available to all agents (no filtering)

---

## Detailed Flow: What Happens When You Click "Connect"

### 1. Frontend: User Clicks "Connect"

**File:** `frontend-v2/app/page.tsx`

```typescript
const handleConnect = () => {
  connect(selectedWorkflow || 'banking');
};
```

- User selects a workflow from dropdown (e.g., "banking", "triage", "mortgage")
- Frontend calls `connect()` with the workflow ID

### 2. Frontend: WebSocket Connection

**File:** `frontend-v2/lib/hooks/useWebSocket.ts`

```typescript
const ws = new WebSocket('ws://localhost:8080/ws');
ws.send(JSON.stringify({
  type: 'connect',
  workflow: workflowId
}));
```

- Opens WebSocket to Gateway at `ws://localhost:8080/ws`
- Sends `connect` message with workflow ID

### 3. Gateway: Route to Agent

**File:** `gateway/src/server.ts`

```typescript
case 'connect':
  const agent = await agentRegistry.findAgentByCapability(message.workflow);
  // Forward to agent WebSocket
```

- Gateway looks up which agent handles this workflow
- Uses `AgentRegistry.findAgentByCapability()` to find agent
- Matches against `capabilities` array from agent registration
- Forwards connection to agent's WebSocket endpoint

**Agent Registration:** When agent starts, it registers with Gateway:

```typescript
// agents/src/agent-runtime-s2s.ts
await axios.post(`${GATEWAY_URL}/api/agents/register`, {
  id: AGENT_ID,
  capabilities: [workflowDef.testConfig.personaId], // e.g., ["persona-BankingDisputes"]
  voiceId: workflowDef.voiceId,
  metadata: workflowDef.metadata
});
```

### 4. Agent: Initialize Session

**File:** `agents/src/agent-runtime-s2s.ts`

```typescript
case 'session_init':
  // 1. Load workflow definition from file
  const workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_FILE));
  
  // 2. Convert workflow to text instructions
  const systemPrompt = convertWorkflowToText(workflowDef);
  
  // 3. Initialize Nova Sonic with workflow context
  sonicClient.updateSessionConfig({ 
    systemPrompt,
    voiceId: workflowDef.voiceId  // e.g., "tiffany"
  });
  
  // 4. Start Nova Sonic S2S session
  await sonicClient.startSession();
```

**What happens here:**
- Agent loads workflow JSON file (e.g., `workflow_banking.json`)
- Converts workflow nodes/edges to text instructions using `convertWorkflowToText()`
- Configures Nova Sonic with:
  - System prompt (workflow instructions)
  - Voice ID (from workflow metadata)
- Starts AWS Nova Sonic S2S session

**IMPORTANT:** The persona prompt file (e.g., `persona-BankingDisputes.txt`) is **NOT** automatically loaded. The system prompt comes from converting the workflow JSON to text.

### 5. Agent: Send Initial Greeting

Nova Sonic automatically sends initial greeting based on system prompt:
- "Hello, welcome to Barclays Bank. I'm your banking assistant. How can I help today?"

### 6. Frontend: Display Connection

- Shows "Connected" status
- Displays agent metadata (voice, persona)
- Enables microphone/text input

---

## Configuration Structure Comparison

### Current System (Refactored)

**Workflow File:** `backend/workflows/workflow_banking.json`

```json
{
  "id": "banking",
  "name": "Banking",
  "voiceId": "tiffany",
  "metadata": {
    "persona": "friendly-banking",
    "language": "en-US",
    "description": "Banking"
  },
  "testConfig": {
    "personaId": "persona-BankingDisputes"  // Used for agent registration
  },
  "nodes": [
    {
      "id": "check_auth",
      "label": "Is 'auth_status' VERIFIED?",
      "type": "decision"
    },
    {
      "id": "request_details",
      "label": "Call 'perform_idv_check'",
      "type": "tool",
      "toolName": "perform_idv_check"  // Tool referenced by name
    }
  ],
  "edges": [...]
}
```

**Persona Prompt File:** `backend/prompts/persona-BankingDisputes.txt`

```
You are the Barclays Banking Assistant...
[Detailed instructions]
```

**Tool File:** `backend/tools/perform_idv_check.json`

```json
{
  "name": "perform_idv_check",
  "description": "Validates credentials...",
  "inputSchema": {...}
}
```

**Key Points:**
- Workflow references tools by name in nodes (`toolName: "perform_idv_check"`)
- Workflow has `testConfig.personaId` but doesn't load the prompt file
- Tools are separate files, not linked to workflows
- All tools are available to all agents (no filtering)

### Monolithic System (For Comparison)

In the monolithic system, there was a **Persona entity** that tied everything together:

```json
{
  "id": "persona-BankingDisputes",
  "name": "Banking Disputes Agent",
  "systemPrompt": "You are the Barclays Banking Assistant...",
  "workflows": ["banking", "disputes", "triage"],
  "tools": ["perform_idv_check", "create_dispute_case", "agentcore_balance"],
  "voiceId": "tiffany",
  "metadata": {...}
}
```

**This provided:**
- ✅ Clear Persona → Workflows mapping
- ✅ Clear Persona → Tools mapping (tool filtering)
- ✅ Single source of truth for agent configuration
- ✅ System prompt embedded in persona

---

## What's Missing: The Mapping Problem

### Problem 1: Persona Prompts Not Linked

**Current State:**
- Workflow file has `testConfig.personaId: "persona-BankingDisputes"`
- Prompt file exists at `backend/prompts/persona-BankingDisputes.txt`
- **BUT:** Agent doesn't automatically load the prompt file
- Agent only uses workflow-to-text conversion for system prompt

**Impact:**
- Detailed persona instructions in prompt files are ignored
- Workflow text conversion is basic (just nodes/edges)
- Missing behavioral instructions, tone, protocols

### Problem 2: Tools Not Filtered

**Current State:**
- Workflow nodes reference tools by name (`toolName: "perform_idv_check"`)
- All tools in `backend/tools/` are loaded by Gateway
- **BUT:** No filtering based on persona/workflow
- All tools available to all agents

**Impact:**
- No security/isolation between personas
- Can't restrict sensitive tools to specific agents
- No validation that workflow references valid tools

### Problem 3: No Central Configuration

**Current State:**
- Workflow logic in workflow files
- Persona prompts in prompt files
- Tools in tool files
- Voice/metadata in workflow files
- **BUT:** No single config that ties them together

**Impact:**
- Hard to understand what persona uses what
- Must edit multiple files to change agent behavior
- No clear "persona definition"

---

## How to Configure Agent Behavior NOW

### Option 1: Edit Workflow File (Quick Changes)

**File:** `backend/workflows/workflow_banking.json`

**What you can change:**
- Workflow logic (nodes, edges, decision points)
- Voice ID (`voiceId: "tiffany"`)
- Metadata (persona name, language)
- Tool references in nodes (`toolName: "..."`)

**Limitations:**
- Doesn't include detailed persona instructions
- Can't filter available tools
- Workflow-to-text conversion is basic

### Option 2: Manually Inject Persona Prompt (Current Workaround)

**File:** `agents/src/agent-runtime-s2s.ts`

**Modify the session initialization:**

```typescript
case 'session_init':
  // Load workflow
  const workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_FILE));
  
  // Load persona prompt (MANUAL)
  const personaId = workflowDef.testConfig?.personaId;
  const promptFile = `/app/prompts/${personaId}.txt`;
  const personaPrompt = fs.existsSync(promptFile) 
    ? fs.readFileSync(promptFile, 'utf-8') 
    : '';
  
  // Combine workflow + persona prompt
  const workflowInstructions = convertWorkflowToText(workflowDef);
  const systemPrompt = `${personaPrompt}\n\n${workflowInstructions}`;
  
  sonicClient.updateSessionConfig({ systemPrompt, voiceId: workflowDef.voiceId });
```

**This gives you:**
- ✅ Detailed persona instructions from prompt file
- ✅ Workflow logic from workflow file
- ✅ Combined system prompt

### Option 3: Create Persona Config Files (Proper Solution)

**Create:** `backend/personas/persona-BankingDisputes.json`

```json
{
  "id": "persona-BankingDisputes",
  "name": "Banking Disputes Agent",
  "promptFile": "persona-BankingDisputes.txt",
  "workflows": ["banking", "disputes"],
  "allowedTools": [
    "perform_idv_check",
    "create_dispute_case",
    "update_dispute_case",
    "agentcore_balance",
    "get_account_transactions",
    "lookup_merchant_alias",
    "manage_recent_interactions"
  ],
  "voiceId": "tiffany",
  "metadata": {
    "language": "en-US",
    "description": "Banking disputes and account management"
  }
}
```

**Update workflow files to reference persona:**

```json
{
  "id": "banking",
  "personaId": "persona-BankingDisputes",  // Link to persona config
  "nodes": [...],
  "edges": [...]
}
```

**Update agent runtime to load persona config:**

```typescript
// Load persona config
const personaConfig = JSON.parse(fs.readFileSync(`/app/personas/${personaId}.json`));

// Load persona prompt
const personaPrompt = fs.readFileSync(`/app/prompts/${personaConfig.promptFile}`);

// Filter tools
const allowedTools = personaConfig.allowedTools;
```

**This gives you:**
- ✅ Clear Persona → Workflows mapping
- ✅ Clear Persona → Tools mapping
- ✅ Tool filtering/security
- ✅ Single source of truth
- ✅ Easy to understand and modify

---

## File Structure Overview

```
backend/
├── workflows/           # Workflow logic (nodes, edges)
│   ├── workflow_banking.json
│   ├── workflow_triage.json
│   └── workflow_disputes.json
│
├── prompts/            # Persona instructions (NOT auto-loaded)
│   ├── persona-BankingDisputes.txt
│   ├── persona-SimpleBanking.txt
│   └── persona-mortgage.txt
│
├── tools/              # Tool definitions (all available to all agents)
│   ├── perform_idv_check.json
│   ├── create_dispute_case.json
│   └── agentcore_balance.json
│
└── personas/           # (MISSING) Persona configs that link everything
    └── persona-BankingDisputes.json  # Should exist but doesn't
```

---

## Recommended Next Steps

### Immediate (Quick Fix):
1. **Manually inject persona prompts** in agent runtime (Option 2 above)
2. Document which workflows use which personas
3. Test that persona instructions are being used

### Short-term (Proper Solution):
1. **Create persona config files** (`backend/personas/*.json`)
2. **Update workflow files** to reference persona ID
3. **Update agent runtime** to load persona config and filter tools
4. **Update Gateway** to expose persona configuration endpoints
5. **Update frontend** to show persona info (not just workflow)

### Long-term (Advanced):
1. **Langfuse integration** for prompt management
2. **Dynamic persona switching** during conversation
3. **Persona inheritance** (base persona + specialized variants)
4. **Tool permission system** (read-only vs read-write tools)

---

## Summary

**Current State:**
- Configuration is **split across workflow files, prompt files, and tool files**
- Workflow files contain logic and metadata
- Persona prompts exist but **aren't automatically loaded**
- Tools exist but **aren't filtered by persona**
- Agent converts workflow to text for system prompt (basic)

**To Configure Agent Behavior:**
1. Edit workflow file for logic/voice: `backend/workflows/workflow_banking.json`
2. Edit persona prompt for instructions: `backend/prompts/persona-BankingDisputes.txt`
3. Manually inject prompt in agent code (or implement persona config system)

**Missing Mapping:**
- No automatic Persona → Prompt file loading
- No Persona → Tools filtering
- No central persona configuration
- Workflow references tools by name but no validation

**Recommended Fix:**
- Create persona config files that link prompts, workflows, and tools
- Update agent runtime to load persona config
- Implement tool filtering based on persona
