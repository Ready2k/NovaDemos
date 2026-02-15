# IDV Verified State Gate Implementation

## Overview

Implemented the "Verified State Gate" pattern as recommended in `IDV_ISSUE_SUMMARY.md`. This architectural change removes the burden from the IDV agent to decide where to transfer customers, instead using LangGraph state and conditional routing to handle post-verification routing automatically.

## Problem Solved

Previously, the IDV agent had access to 14 tools including `transfer_to_banking`, `transfer_to_mortgage`, etc. This caused Nova 2 Sonic to get "distracted" and sometimes:
- Call transfer tools before verification
- Get confused about which transfer tool to use
- Make incorrect routing decisions

## Solution: Verified State Gate Pattern

The IDV agent now acts as a pure "Gatekeeper" with only 2 tools:
1. `perform_idv_check` - Verify identity
2. `return_to_triage` - Return on failure

When verification succeeds, the system automatically handles routing based on state.

## Changes Made

### 1. Pruned IDV Agent Tools ✅

**Files Modified:**
- `backend/personas/idv.json`
- `backend/personas/idv-simple.json`

**Change:**
```json
"allowedTools": [
  "perform_idv_check",
  "return_to_triage"
]
```

Removed 12 unnecessary tools that were causing confusion.

### 2. Updated IDV Prompt ✅

**File Modified:**
- `backend/prompts/persona-idv-simple.txt`

**Key Changes:**
- Mission: "Your ONLY job is verification - you do NOT transfer customers"
- Process: "Once verified, inform the customer and STOP. The system will handle the rest."
- Tools: Only lists `perform_idv_check` and `return_to_triage`
- Examples: Updated to show system handling routing, not agent

**New Tone:**
- "You are a security gatekeeper"
- "Your job ends after successful verification"
- "The system handles routing after that"

### 3. Implemented State Gate in Agent Core ✅

**File Modified:**
- `agents/src/agent-core.ts`

**Method:** `handleIdvResult()`

**Logic Added:**
```typescript
if (idvData && idvData.auth_status === 'VERIFIED') {
    // Update graph state with verified flag
    session.graphState.verified = true;
    session.graphState.customer_name = idvData.customer_name;
    session.graphState.account = toolInput.accountNumber;
    session.graphState.sortCode = toolInput.sortCode;
    
    // CRITICAL: Verified State Gate - Auto-trigger handoff
    if (this.agentId === 'idv') {
        session.graphState.pendingHandoff = {
            targetAgent: 'banking',
            reason: 'Identity verified successfully',
            context: {
                verified: true,
                userName: idvData.customer_name,
                account: toolInput.accountNumber,
                sortCode: toolInput.sortCode
            }
        };
    }
}
```

### 4. Added Conditional Routing in Voice Sidecar ✅

**File Modified:**
- `agents/src/voice-sidecar.ts`

**Method:** `handleToolUse()`

**Logic Added:**
After tool execution completes, check for pending handoff:
```typescript
// Check for pending handoff from Verified State Gate
const agentSession = this.agentCore.getSession(session.sessionId);
if (agentSession?.graphState?.pendingHandoff) {
    const pendingHandoff = agentSession.graphState.pendingHandoff;
    
    // Create and send handoff request
    const handoffRequest = {
        targetAgentId: pendingHandoff.targetAgent,
        context: pendingHandoff.context,
        graphState: agentSession.graphState
    };
    
    // Clear pending handoff
    delete agentSession.graphState.pendingHandoff;
    
    // Forward to Gateway
    session.ws.send(JSON.stringify({
        type: 'handoff_request',
        targetAgentId: handoffRequest.targetAgentId,
        context: handoffRequest.context,
        graphState: handoffRequest.graphState,
        timestamp: Date.now()
    }));
}
```

### 5. Fixed Tool Filtering in Agent Core ✅

**File Modified:**
- `agents/src/agent-core.ts`

**Method:** `getAllTools()`

**Change:** IDV agent now filters handoff tools based on persona's `allowedTools` list instead of returning all handoff tools.

```typescript
case 'idv':
    // Filter handoff tools based on persona allowedTools
    let filteredHandoffTools = handoffTools;
    if (this.personaConfig?.allowedTools) {
        filteredHandoffTools = handoffTools.filter(t => 
            this.personaConfig!.allowedTools.includes(t.toolSpec.name)
        );
    }
    return [...filteredHandoffTools, ...idvTools];
```

### 6. Added Multiple Handoff Call Blocking ✅

**File Modified:**
- `agents/src/agent-core.ts`

**Method:** `executeTool()`

**Logic Added:**
Prevents agents from calling multiple handoff tools in the same turn:
```typescript
// CRITICAL: Block Multiple Handoff Calls in Same Turn
if (isHandoffTool(toolName)) {
    const handoffToolsCalledThisTurn = Array.from(session.toolCallCounts?.keys() || [])
        .filter(key => isHandoffTool(key) && key !== toolName);
    
    if (handoffToolsCalledThisTurn.length > 0) {
        console.error(`[AgentCore] ❌ BLOCKED: Multiple handoff calls in same turn`);
        return {
            success: false,
            result: null,
            error: `Multiple handoff calls blocked...`
        };
    }
}
```

## Current Status

### What's Working ✅
1. IDV agent has only 2 tools (perform_idv_check, return_to_triage)
2. IDV prompt focuses on verification only
3. State gate logic sets verified flag and pending handoff
4. Multiple handoff blocking prevents triage from calling both transfer_to_idv and transfer_to_banking

### What's Not Working ❌
1. **IDV agent is not being invoked properly** - The session is handed off to IDV, but IDV doesn't ask for credentials
2. **Handoff bypasses IDV** - Even though the second handoff call is blocked, the first handoff to IDV succeeds, but then the session immediately moves to banking without verification

## Root Cause Analysis

The test shows:
1. Triage calls `transfer_to_idv` ✓
2. Triage attempts `transfer_to_banking` (BLOCKED) ✓
3. Session moves to IDV agent
4. **IDV agent immediately transfers to banking WITHOUT asking for credentials** ❌

This suggests the IDV agent is either:
- Not receiving the handoff properly
- Receiving it but immediately deciding to transfer without verification
- Being bypassed entirely by some other logic

## Next Steps

1. **Debug IDV Agent Invocation** - Add logging to see if IDV agent is actually receiving the session and what it's doing
2. **Check Auto-Trigger Logic** - Verify that auto-trigger isn't causing premature transfers
3. **Test IDV Agent Directly** - Create a test that starts directly with IDV agent to isolate the issue
4. **Review Gateway Routing** - Ensure gateway is properly routing to IDV and not skipping it

## Testing

Run the test with:
```bash
node test-idv-flow.js
```

Expected behavior:
1. User: "I need to check my balance"
2. Triage → IDV handoff
3. IDV asks: "Please provide your 8-digit account number and 6-digit sort code"
4. User provides credentials
5. IDV calls `perform_idv_check`
6. System automatically routes to banking (via pending handoff)
7. Banking checks balance

Actual behavior:
1. User: "I need to check my balance"
2. Triage → IDV handoff
3. **IDV immediately transfers to banking (no credentials asked)**
4. User provides credentials to banking agent
5. Banking checks balance directly

## Files Changed

1. `backend/personas/idv.json` - Pruned tools
2. `backend/personas/idv-simple.json` - Pruned tools
3. `backend/prompts/persona-idv-simple.txt` - Updated prompt
4. `agents/src/agent-core.ts` - State gate logic, tool filtering, handoff blocking
5. `agents/src/voice-sidecar.ts` - Pending handoff detection
6. `IDV_VERIFIED_STATE_GATE_IMPLEMENTATION.md` - This document
7. `test-idv-flow.js` - Test script for IDV flow
