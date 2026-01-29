# Workflow System Status & Implementation Guide

## Current Status: ✅ FULLY IMPLEMENTED

The workflow system is **fully functional** but requires workflows to be **actively linked** to appear in the Live Visualization.

---

## How Workflows Are Linked

### 1. **Automatic Linking (During Testing)**
When you run a workflow test from the Workflow Designer:
- The workflow is automatically added to `settings.linkedWorkflows[]`
- This happens in `WorkflowDesigner.tsx` line 198-201:
```typescript
const currentLinked = settings.linkedWorkflows || [];
if (!currentLinked.includes(currentWorkflowId)) {
    updateSettings({ linkedWorkflows: [...currentLinked, currentWorkflowId] });
}
```

### 2. **Manual Linking (Not Yet Implemented)**
Currently, there is **NO UI** to manually link/unlink workflows outside of testing. This is a gap.

**What's Missing:**
- No toggle/checkbox in Workflow Designer to link/unlink workflows
- No workflow management panel in Settings
- No way to see which workflows are currently linked

**Recommended Implementation:**
Add a "Link Workflow" toggle in the WorkflowDesigner header or sidebar that:
```typescript
// In WorkflowDesigner.tsx
const isLinked = settings.linkedWorkflows?.includes(currentWorkflowId);

<button onClick={() => {
    const current = settings.linkedWorkflows || [];
    if (isLinked) {
        updateSettings({ linkedWorkflows: current.filter(id => id !== currentWorkflowId) });
    } else {
        updateSettings({ linkedWorkflows: [...current, currentWorkflowId] });
    }
}}>
    {isLinked ? 'Unlink' : 'Link'} Workflow
</button>
```

---

## How Live Visualization Works

### Flow:
1. **Workflow is linked** → Added to `settings.linkedWorkflows[]`
2. **Session starts** → `linkedWorkflows` sent to backend in `sessionConfig` (page.tsx line 107)
3. **Backend processes workflow** → Injects workflow instructions into system prompt
4. **AI outputs step tags** → `[STEP: node_id]` in responses
5. **Frontend detects tags** → Updates `workflowState` (sonic-client.ts line 1209-1219)
6. **Visualization appears** → `WorkflowVisualizer` component shows current step

### Why It Might Not Show:
- ❌ No workflows are linked (`linkedWorkflows` is empty)
- ❌ Workflow doesn't have proper step tags in AI responses
- ❌ `showWorkflowVisualization` setting is disabled (default: enabled)
- ❌ `workflowState.status` is 'idle' (no active workflow)

---

## Current Workflows Available

Located in `backend/workflows/`:
- ✅ `workflow_banking.json` - Full banking workflow with IDV, disputes, transactions
- ✅ `workflow_banking-master.json` - Master banking workflow
- ✅ `workflow_context.json` - Context management
- ✅ `workflow_disputes.json` - Dispute handling
- ✅ `workflow_handoff_test.json` - Agent handoff testing
- ✅ `workflow_idv.json` - Identity verification
- ✅ `workflow_persona-mortgage.json` - Mortgage persona workflow
- ✅ `workflow_persona-sci_fi_bot.json` - Sci-fi bot persona
- ✅ `workflow_transaction-investigation.json` - Transaction investigation
- ✅ `workflow_triage.json` - Customer triage

---

## Workflow Structure

Each workflow JSON contains:
```json
{
  "id": "banking",
  "name": "Banking",
  "nodes": [
    {
      "id": "start",
      "label": "Welcome message",
      "type": "start"
    },
    {
      "id": "check_auth",
      "label": "Check if user is authenticated",
      "type": "decision"
    },
    {
      "id": "perform_idv",
      "label": "Perform identity verification",
      "type": "tool",
      "toolName": "perform_idv_check"
    }
  ],
  "edges": [
    { "from": "start", "to": "check_auth" },
    { "from": "check_auth", "to": "perform_idv", "label": "Not Verified" }
  ],
  "testConfig": {
    "personaId": "persona-BankingDisputes",
    "successCriteria": "...",
    "testInstructions": "...",
    "disconnectAction": "always",
    "saveReport": true,
    "maxTurns": 10
  }
}
```

### Node Types:
- **start** - Entry point
- **process** - General processing step
- **decision** - Branching logic
- **tool** - Execute a specific tool (requires `toolName`)
- **workflow** - Call another workflow (requires `workflowId`)
- **end** - Terminal state (optional `outcome`)

---

## Backend Workflow Processing

### 1. Workflow Injection (server-utils.ts line 244-258)
When a workflow is linked, the backend:
- Converts the workflow graph to text instructions
- Injects into system prompt with **CRITICAL RULE**:
  ```
  You MUST begin EVERY single response with the tag [STEP: node_id]
  ```

### 2. Step Detection (sonic-client.ts line 1209-1223)
The frontend detects `[STEP: step_id]` tags in AI responses:
```typescript
const stepMatch = cleanContent.match(/\[STEP:\s*([a-zA-Z0-9_\-]+)\]/);
if (stepMatch) {
    const stepId = stepMatch[1];
    this.eventCallback?.({
        type: 'workflow_update',
        data: { currentStep: stepId }
    });
    // Remove tag from displayed text
    cleanContent = cleanContent.replace(/\[STEP:\s*[a-zA-Z0-9_\-]+\]/g, '').trim();
}
```

### 3. Visualization Update (page.tsx line 278-283)
```typescript
case 'workflow_update':
    if (message.currentStep) {
        setWorkflowState({
            currentStep: message.currentStep,
            status: message.currentStep.toLowerCase().includes('complete') ? 'completed' : 'active'
        });
    }
    break;
```

---

## Documentation Status

### ✅ Completed:
- Basic workflow editor documentation (`docs/workflows.md`)
- Node types and concepts explained
- Example use case provided

### ⚠️ Incomplete/Outdated:
- **Linking mechanism** - Docs mention "linked to Personas" but actual implementation uses `linkedWorkflows` array
- **File naming** - Docs say `workflow-{persona}.json` but actual files use `workflow_{id}.json`
- **Dynamic injection** - Mentioned but not explained in detail
- **Live visualization** - Not documented at all
- **Testing workflow** - Test config structure not documented
- **API endpoints** - Not documented

### 📝 Needs Documentation:
1. **How to link/unlink workflows** (once UI is added)
2. **Live Visualization feature** - How it works, what to expect
3. **Workflow testing** - Test config options, auto-simulation
4. **Test reports** - How to read and interpret them
5. **Workflow API** - GET/POST/DELETE endpoints
6. **Step tag system** - How `[STEP: node_id]` works
7. **Workflow best practices** - When to use tools vs process nodes
8. **Debugging workflows** - How to troubleshoot when steps don't trigger

---

## Recommended Next Steps

### Priority 1: Add Manual Linking UI
Add a toggle in WorkflowDesigner to link/unlink workflows without testing:
- Location: `WorkflowDesigner.tsx` header
- Show linked status with visual indicator
- Allow quick toggle on/off

### Priority 2: Workflow Management Panel
Add a section in Settings → Workflow Settings:
- List all available workflows
- Show which are currently linked
- Quick link/unlink toggles
- Visual indicator when workflows are active in session

### Priority 3: Update Documentation
- Rewrite `docs/workflows.md` with current implementation details
- Add Live Visualization section
- Document testing and test reports
- Add troubleshooting guide

### Priority 4: Better Visual Feedback
- Show linked workflows in UI (badge, indicator)
- Show when no workflows are linked (empty state)
- Add tooltip explaining why visualization isn't showing

---

## Quick Test

To verify the system is working:

1. **Open Workflow Designer** (navigate to workflow view)
2. **Select a workflow** (e.g., "banking")
3. **Click "Test Workflow"** button
4. **Configure test** and run
5. **Watch for Live Visualization** in the chat view (should appear in InsightPanel)
6. **Check session history** - Should show workflow steps in transcript

If visualization appears during test, the system is working! ✅
