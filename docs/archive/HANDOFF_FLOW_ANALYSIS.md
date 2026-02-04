# Handoff Flow Analysis

## Date: 2026-02-04

## Issue Summary
The balance check test is working (balance is retrieved), but the **handoff flow is not working as expected**. The triage agent is handling everything directly instead of handing off to specialist agents.

## Expected Flow
```
User Request
    ↓
Triage Agent
    ↓ (calls transfer_to_idv tool)
IDV Agent
    ↓ (performs verification)
    ↓ (calls transfer_to_banking tool)
Banking Agent
    ↓ (checks balance)
    ↓ (calls return_to_triage tool)
Triage Agent
    ↓
Response to User
```

## Actual Flow (Current Behavior)
```
User Request
    ↓
Triage Agent
    ↓ (calls agentcore_balance directly - NO HANDOFF)
    ↓ (calls return_to_triage to itself)
Response to User
```

## Evidence

### Test Results
From `test-handoff-flow.js`:
```
Expected Flow:
  Triage → IDV → Banking → Triage

Actual Flow:
  ❌ NO HANDOFFS DETECTED
  ⚠️  Triage agent handled everything directly

Analysis:
  Handoff tools called: ❌ NO
  IDV check performed: ❌ NO
  Balance check performed: ❌ NO
```

### From Original Test (`test-balance-check.js`)
The test showed:
- ✅ Tool `agentcore_balance` was called
- ✅ Balance £1200 was retrieved
- ❌ But it was called by **triage agent**, not banking agent
- ❌ No `transfer_to_idv` or `transfer_to_banking` tools were called
- ❌ Only `return_to_triage` was called (triage returning to itself)

### Agent Logs
```bash
docker-compose logs agent-triage | grep "agentcore_balance"
# Shows: [AgentCore:triage] Tracked tool execution: agentcore_balance

docker-compose logs agent-idv | grep "Session"
# Shows: No sessions initiated

docker-compose logs agent-banking | grep "Session"
# Shows: No sessions initiated
```

## Root Cause Analysis

### Why Triage is Not Handing Off

The triage agent has handoff tools available (we can see them in `getAllTools()`), but it's not calling them. Possible reasons:

1. **System Prompt Issue**: The triage agent's system prompt may not be emphasizing handoff tools strongly enough
2. **Tool Selection**: Nova Sonic may be choosing to call `agentcore_balance` directly instead of `transfer_to_banking`
3. **Workflow Configuration**: The workflow may not be guiding the agent to use handoff tools

### Current System Prompt (from agent-core.ts)
```typescript
**ROUTING RULES:**
- User needs BALANCE, TRANSACTIONS, PAYMENTS → **CALL THE TOOL** 'transfer_to_banking'
- User needs IDENTITY VERIFICATION → **CALL THE TOOL** 'transfer_to_idv'
...

**CRITICAL PROCESS:**
1. User states their need
2. You say ONE brief sentence acknowledging
3. **YOU MUST IMMEDIATELY CALL THE APPROPRIATE TRANSFER TOOL**
```

The prompt is clear, but the agent is not following it.

## Why Balance Check Still Works

Even though the handoff flow is broken, the balance check works because:
1. Triage agent has access to ALL tools (including banking tools)
2. `agentcore_balance` tool is loaded and accessible
3. Triage agent calls it directly instead of handing off

This is **functionally correct** but **architecturally wrong**.

## Problems with Current Behavior

### 1. Security/Authorization
- Triage agent shouldn't have direct access to sensitive banking operations
- IDV verification should be required before balance checks
- Currently, triage can check balance without verification

### 2. Separation of Concerns
- Triage should only route, not execute
- Banking agent should handle banking operations
- IDV agent should handle verification

### 3. Workflow Integrity
- The multi-agent architecture is bypassed
- Specialist agents (IDV, Banking) are never invoked
- Return handoffs don't make sense (triage returning to itself)

## Failure Test Requirements

User requested failure tests:
1. ❌ Wrong account number → Should fail IDV
2. ❌ Wrong sort code → Should fail IDV
3. ❌ Both wrong → Should fail IDV

**Current Status**: Cannot test IDV failures because IDV agent is never invoked.

## Next Steps to Fix

### Option 1: Restrict Tool Access
Remove banking tools from triage agent's tool list, forcing it to use handoff tools.

**Implementation**:
```typescript
// In agent-core.ts getAllTools()
public getAllTools(): any[] {
    const handoffTools = generateHandoffTools();
    
    // Only include banking tools for banking agent
    if (this.agentId === 'banking' || this.agentId === 'idv') {
        const bankingTools = generateBankingTools();
        return [...handoffTools, ...bankingTools];
    }
    
    return handoffTools;
}
```

### Option 2: Strengthen System Prompt
Make the handoff requirement even more explicit and prevent direct tool calls.

**Implementation**:
```typescript
**CRITICAL: YOU CANNOT CALL BANKING TOOLS DIRECTLY**
You do NOT have access to:
- agentcore_balance
- perform_idv_check
- get_account_transactions

You MUST use handoff tools:
- transfer_to_banking
- transfer_to_idv
```

### Option 3: Workflow Enforcement
Use LangGraph workflow to enforce handoff sequence.

**Implementation**:
- Add workflow nodes that require handoff
- Prevent direct tool execution from triage node
- Enforce state transitions

## Recommended Solution

**Combination of Option 1 and Option 2**:

1. **Restrict tool access** (Option 1) - Most effective
   - Triage agent only gets handoff tools
   - Banking agent gets banking tools
   - IDV agent gets IDV tools

2. **Update system prompt** (Option 2) - Reinforcement
   - Make it clear which tools are available
   - Emphasize handoff requirement

This ensures:
- ✅ Triage MUST use handoff tools (no other option)
- ✅ IDV verification happens before banking operations
- ✅ Proper separation of concerns
- ✅ Failure tests will work (IDV can fail)

## Testing Plan After Fix

### 1. Success Case
```
Input: Account 12345678, Sort Code 112233
Expected Flow: Triage → IDV (verify) → Banking (balance) → Triage
Expected Result: Balance £1200
```

### 2. Failure Case: Wrong Account
```
Input: Account 99999999, Sort Code 112233
Expected Flow: Triage → IDV (fail) → Triage
Expected Result: "Verification failed"
```

### 3. Failure Case: Wrong Sort Code
```
Input: Account 12345678, Sort Code 999999
Expected Flow: Triage → IDV (fail) → Triage
Expected Result: "Verification failed"
```

### 4. Failure Case: Both Wrong
```
Input: Account 99999999, Sort Code 999999
Expected Flow: Triage → IDV (fail) → Triage
Expected Result: "Verification failed"
```

## Files to Modify

1. `agents/src/agent-core.ts` - `getAllTools()` method
2. `agents/src/agent-core.ts` - System prompt generation
3. Test scripts to verify handoff flow

## Current Status

- ✅ Balance check works (functionally)
- ❌ Handoff flow broken (architecturally)
- ❌ IDV verification bypassed (security issue)
- ❌ Failure tests cannot be run (IDV never invoked)

## Conclusion

The balance check test passes because the tool execution works, but the multi-agent handoff architecture is not functioning. The triage agent is acting as a monolithic agent instead of a router. This needs to be fixed to:
1. Ensure proper security (IDV before banking)
2. Enable failure testing
3. Maintain architectural integrity
