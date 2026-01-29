# Workflow System vs A2A (LangGraph) - Architecture Comparison

## TL;DR - Not a Silly Question!

**Short Answer:** NO, the agents (triage, banking, etc.) are using **BOTH** systems, but in **different ways**:

1. **A2A Mode (docker-compose-a2a.yml)**: Agents use LangGraph with workflows converted to state graphs ✅
2. **Legacy Mode (regular backend)**: Workflows are converted to text prompts and injected into Nova ✅

They're **two different execution modes** for the same visual workflow definitions!

---

## The Two Systems Explained

### System 1: Visual Workflow Designer (What You See)
**Location:** `frontend-v2/components/workflow/`
**Storage:** `backend/workflows/workflow_*.json`

This is the **source of truth** - the visual designer where you create workflows with nodes and edges.

**Example:** `workflow_banking.json`
```json
{
  "id": "banking",
  "nodes": [
    { "id": "start", "type": "start", "label": "Welcome" },
    { "id": "check_auth", "type": "decision", "label": "Is user verified?" },
    { "id": "request_details", "type": "tool", "toolName": "perform_idv_check" }
  ],
  "edges": [
    { "from": "start", "to": "check_auth" },
    { "from": "check_auth", "to": "request_details", "label": "No" }
  ]
}
```

---

### System 2A: LangGraph Execution (A2A Mode) 🆕
**Location:** `agents/src/graph-converter.ts`
**Used By:** Agent-to-Agent architecture (docker-compose-a2a.yml)

**How It Works:**
1. Each agent container loads ONE workflow file via volume mount:
   ```yaml
   agent-triage:
     volumes:
       - ./backend/workflows/workflow_triage.json:/app/workflow.json:ro
   
   agent-banking:
     volumes:
       - ./backend/workflows/workflow_banking-master.json:/app/workflow.json:ro
   ```

2. `WorkflowConverter.convert()` transforms the JSON into a LangGraph StateGraph:
   ```typescript
   const graph = new StateGraph<GraphState>({
     channels: { messages, context, currentNodeId, lastOutcome }
   });
   
   // Add nodes
   workflow.nodes.forEach(node => {
     graph.addNode(node.id, createNodeRunnable(node));
   });
   
   // Add edges
   if (node.type === 'decision') {
     graph.addConditionalEdges(node.id, routingFunction, routeMap);
   } else {
     graph.addEdge(node.id, nextNode.id);
   }
   ```

3. The graph executes as a **true state machine** with LangGraph managing state transitions

**Agents Using This:**
- ✅ `agent-triage` → `workflow_triage.json`
- ✅ `agent-banking` → `workflow_banking-master.json`
- ✅ `agent-mortgage` → `workflow_persona-mortgage.json`
- ✅ `agent-idv` → `workflow_idv.json`
- ✅ `agent-disputes` → `workflow_disputes.json`

---

### System 2B: Text Prompt Injection (Legacy Mode) 🔄
**Location:** `backend/src/utils/server-utils.ts` → `convertWorkflowToText()`
**Used By:** Regular backend with Nova/Sonic (non-A2A mode)

**How It Works:**
1. When a workflow is linked in settings (`linkedWorkflows` array)
2. Backend converts the workflow JSON to text instructions:
   ```typescript
   function convertWorkflowToText(workflow) {
     let text = "### WORKFLOW INSTRUCTIONS\n";
     text += "CRITICAL RULE: You MUST begin EVERY response with [STEP: node_id]\n";
     
     workflow.nodes.forEach(node => {
       text += `STEP [${node.id}] (${node.type}):\n`;
       text += `   INSTRUCTION: ${node.label}\n`;
       
       if (node.type === 'tool') {
         text += `   -> ACTION: Call tool "${node.toolName}"\n`;
       }
       
       const edges = workflow.edges.filter(e => e.from === node.id);
       edges.forEach(edge => {
         text += `   - IF "${edge.label}" -> GOTO [${edge.to}]\n`;
       });
     });
   }
   ```

3. This text is **injected into the system prompt** for Nova
4. Nova follows the instructions and outputs `[STEP: node_id]` tags
5. Frontend detects tags and updates Live Visualization

**Example Output:**
```
### WORKFLOW INSTRUCTIONS
You are executing a STRICT workflow. You represent a state machine.
CRITICAL RULE: You MUST begin EVERY single response with the tag [STEP: node_id].

ENTRY POINT: Begin execution at step [start].

STEP [start] (start):
   INSTRUCTION: Welcome lets check if its a general enquiry
   TRANSITIONS:
   - NEXT -> GOTO [check_intent]

STEP [check_intent] (decision):
   INSTRUCTION: Is this a General Query or Account Specific?
   TRANSITIONS:
   - IF "General Query" -> GOTO [answer_general]
   - IF "Account Query" -> GOTO [check_auth]
```

---

## Key Differences

| Aspect | LangGraph (A2A) | Text Injection (Legacy) |
|--------|----------------|------------------------|
| **Execution** | True state machine with LangGraph | AI follows text instructions |
| **State Management** | LangGraph manages state | AI self-manages via prompts |
| **Reliability** | High - enforced by code | Medium - depends on AI compliance |
| **Flexibility** | Structured, predictable | More conversational |
| **Tool Calling** | Programmatic | AI-initiated via instructions |
| **Handoffs** | Built-in agent routing | Simulated via outcomes |
| **Live Viz** | Via graph events | Via `[STEP: node_id]` tags |
| **Use Case** | Multi-agent orchestration | Single-agent workflows |

---

## Which System Is Active?

### Check Your Setup:

**A2A Mode (LangGraph):**
```bash
# If you're running:
docker-compose -f docker-compose-a2a.yml up

# Then agents are using LangGraph
# Each agent has its own workflow file mounted
```

**Legacy Mode (Text Injection):**
```bash
# If you're running:
npm run dev  # or regular docker-compose

# Then workflows are text-injected into Nova
# Workflows must be "linked" in settings
```

---

## The Workflow Files Are Shared!

**Important:** Both systems use the **SAME workflow JSON files** from `backend/workflows/`

- Visual Designer creates/edits these files
- A2A agents load them directly
- Legacy backend converts them to text

This means:
- ✅ You can design once, use in both modes
- ✅ Changes in the designer affect both systems
- ✅ No duplication of workflow logic

---

## Current State of Each System

### A2A (LangGraph) Status: 🟡 PARTIALLY IMPLEMENTED

**What Works:**
- ✅ Workflow → LangGraph conversion
- ✅ Agent containers with workflow mounting
- ✅ Basic state management
- ✅ Node execution
- ✅ Conditional routing (decisions)
- ✅ Handoff detection

**What's Missing/Incomplete:**
- ⚠️ Tool calling integration (simulated)
- ⚠️ Sub-workflow execution (planned)
- ⚠️ Full LLM integration in nodes
- ⚠️ Redis state persistence
- ⚠️ Gateway routing logic

**Code Location:** `agents/src/`

---

### Legacy (Text Injection) Status: 🟢 FULLY WORKING

**What Works:**
- ✅ Workflow → Text conversion
- ✅ System prompt injection
- ✅ `[STEP: node_id]` tag detection
- ✅ Live Visualization
- ✅ Tool calling via AI
- ✅ Decision branching
- ✅ Session persistence

**What's Missing:**
- ❌ Manual workflow linking UI (only auto-links during tests)
- ❌ Multi-agent handoffs (single agent only)

**Code Location:** `backend/src/`

---

## Migration Path

The project is **transitioning** from Legacy → A2A:

```
Phase 1 (DONE): Visual Workflow Designer
  ↓
Phase 2 (DONE): Text Injection for Nova
  ↓
Phase 3 (IN PROGRESS): LangGraph Conversion
  📋 Spec: .kiro/specs/phase3-langgraph-conversion/requirements.md
  ↓
Phase 4 (PLANNED): Full A2A with Multi-Agent
  📋 Spec: .kiro/specs/phase4-full-a2a-multi-agent/requirements.md
  ↓
Phase 5 (FUTURE): Deprecate Text Injection
  📋 Spec: .kiro/specs/phase5-deprecate-text-injection/requirements.md
```

**📚 Overview Document:** `.kiro/specs/A2A_MIGRATION_OVERVIEW.md`

Currently, **both systems coexist** to support:
- Development/testing with Nova (Legacy)
- Production multi-agent with LangGraph (A2A)

---

## So, To Answer Your Question...

> "Are our agents (triage etc) using what I can see on screen as the workflow?"

**YES!** But the execution differs:

- **In A2A mode:** The visual workflow is converted to a LangGraph state machine
- **In Legacy mode:** The visual workflow is converted to text instructions

Both use the **exact same workflow JSON files** you create in the designer.

The visual designer is the **single source of truth** for both systems.

---

## Recommendations

### For Development:
- Use **Legacy mode** for quick testing with Nova
- Workflows show up in Live Visualization immediately
- Easier to debug (just read the AI's responses)

### For Production:
- Use **A2A mode** for multi-agent orchestration
- More reliable state management
- Better for complex handoffs between agents

### For Documentation:
- Document both execution modes
- Explain when to use each
- Show how the same workflow works in both systems
