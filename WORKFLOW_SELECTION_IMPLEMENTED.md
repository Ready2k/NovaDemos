# Workflow Selection System - Implementation Complete

## What Was Implemented

### Problem Solved
Previously, the system always connected to the "triage" agent by default with no way for users to select which workflow/persona they wanted to use. This made it impossible to directly access specific experiences like Banking, Mortgage, or Disputes without going through triage first.

### Solution Implemented
Added a workflow selection dropdown that appears when disconnected, allowing users to choose which persona/workflow to connect to before starting a conversation.

---

## Changes Made

### 1. Frontend - Workflow Selection UI

**File: `frontend-v2/app/page.tsx`**

Added:
- `selectedWorkflow` state (defaults to 'triage')
- `availableWorkflows` state (loaded from `/api/personas`)
- Effect to load available workflows on mount
- Pass workflow selection props to CommandBar

**File: `frontend-v2/components/chat/CommandBar.tsx`**

Added:
- New props: `selectedWorkflow`, `availableWorkflows`, `onWorkflowChange`
- Workflow selector dropdown (only visible when disconnected)
- Clean UI that shows available personas with their names

**File: `frontend-v2/lib/hooks/useWebSocket.ts`**

Added:
- `workflowId` option to WebSocket hook
- Sends `select_workflow` message on connection with selected workflow ID

---

### 2. Backend - Gateway Routing

**File: `gateway/src/server.ts`**

Changed WebSocket connection flow:
1. **Before:** Immediately routed to hardcoded "triage" agent
2. **After:** Waits for workflow selection, then routes to selected agent

Key changes:
- Removed immediate routing to triage
- Added `selectedWorkflowId` variable (defaults to 'triage')
- Added `sessionInitialized` flag to prevent double-initialization
- Handle `select_workflow` message type
- Auto-initialize with default if user sends message without selecting

---

## How It Works

### User Flow

1. **User opens app** → Disconnected state
2. **Workflow dropdown appears** → Shows all available personas (Triage, Banking, Mortgage, Disputes)
3. **User selects workflow** → e.g., "Banking Disputes Agent"
4. **User clicks Connect** → WebSocket opens
5. **Frontend sends workflow selection** → `{ type: 'select_workflow', workflowId: 'persona-BankingDisputes' }`
6. **Gateway routes to selected agent** → Creates session with selected workflow
7. **Agent loads persona config** → Uses correct prompt, voice, tools, workflows
8. **Conversation starts** → User is directly connected to selected experience

### Fallback Behavior

If user doesn't explicitly select a workflow:
- Defaults to "triage" (maintains backward compatibility)
- Auto-initializes on first message
- No breaking changes to existing behavior

---

## Benefits

✅ **User Control** - Users can now choose their experience
✅ **Direct Access** - No need to go through triage for known issues
✅ **Better Testing** - Can directly test specific personas/workflows
✅ **Backward Compatible** - Still defaults to triage if no selection made
✅ **Clean UI** - Dropdown only shows when disconnected (doesn't clutter active sessions)

---

## What's Still Missing (Multi-Agent Journeys)

This implementation solves **single-agent workflow selection** but does NOT implement **multi-agent journeys** (e.g., Triage → Complaints → Resolution → Survey).

For multi-agent journeys, you would need:
1. Journey configuration files (defining agent sequences)
2. JourneyRouter class in Gateway
3. Handoff detection based on workflow outcomes
4. Journey state tracking in Redis
5. Frontend journey selector (instead of workflow selector)

See `JOURNEY_CONFIGURATION_EXPLAINED.md` for details on implementing multi-agent journeys.

---

## Testing

### Test Workflow Selection

1. Start services: `./start-all-services.sh`
2. Open frontend: `http://localhost:3000`
3. Verify dropdown shows all personas
4. Select "Banking Disputes Agent"
5. Click Connect
6. Verify agent uses correct persona (check voice, prompt, behavior)
7. Disconnect and try different workflow

### Verify Logs

**Frontend Console:**
```
[WebSocket] Sending workflow selection: persona-BankingDisputes
```

**Gateway Logs:**
```
[Gateway] Workflow selected: persona-BankingDisputes
[Gateway] Routing session abc123 to agent: persona-BankingDisputes
```

**Agent Logs:**
```
[Agent] Loaded persona: Banking Disputes Agent
[Agent] Using voice: matthew
[Agent] Loaded prompt: persona-BankingDisputes.txt
```

---

## Next Steps

### Immediate (Recommended)
1. ✅ Test workflow selection with all personas
2. ✅ Verify each persona loads correct configuration
3. ✅ Test that triage still works as default

### Short-term (If Needed)
1. Add workflow descriptions to dropdown (not just names)
2. Add workflow icons/avatars
3. Remember last selected workflow in localStorage
4. Add "Recommended" badge to triage

### Long-term (Future Enhancement)
1. Implement multi-agent journey system
2. Add journey configuration files
3. Implement handoff detection
4. Add journey state tracking
5. Create journey selector UI

---

## Files Modified

### Frontend
- `frontend-v2/app/page.tsx` - Added workflow selection state and loading
- `frontend-v2/components/chat/CommandBar.tsx` - Added workflow selector UI
- `frontend-v2/lib/hooks/useWebSocket.ts` - Added workflow ID parameter

### Backend
- `gateway/src/server.ts` - Changed routing logic to use selected workflow

### Documentation
- `WORKFLOW_SELECTION_IMPLEMENTED.md` - This file

---

## Summary

Users can now select which persona/workflow they want to connect to before starting a conversation. The system routes them directly to the selected agent, loading the correct persona configuration (prompt, voice, tools, workflows). This provides better user control and enables direct access to specific experiences without going through triage first.

The implementation is backward compatible (defaults to triage) and sets the foundation for future multi-agent journey support.
