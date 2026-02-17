# Banking Agent `return_to_triage` Fix

## Issue
Banking agent was calling `return_to_triage` tool after providing balance, causing:
1. Unwanted automatic handoff back to triage
2. Triage agent getting stuck "Thinking..." because banking agent spoke AFTER calling the tool
3. Poor user experience - user couldn't continue conversation with banking agent

## Root Cause
In `agents/src/agent-core.ts`, the `getAllTools()` method was giving the banking agent access to ALL handoff tools, including `return_to_triage`:

```typescript
case 'banking':
    return [...handoffTools, ...bankingOnlyTools];  // ❌ Included return_to_triage
```

## Solution
Modified `agents/src/agent-core.ts` line 1856 to exclude handoff tools from banking agent:

```typescript
case 'banking':
    // Banking agent: Banking tools ONLY (NO handoff tools)
    // After completing task, agent should ask if user needs anything else
    // Gateway will handle routing back to triage if needed
    const bankingOnlyTools = bankingTools.filter(t => 
        t.toolSpec.name === 'agentcore_balance' ||
        t.toolSpec.name === 'get_account_transactions' ||
        t.toolSpec.name === 'uk_branch_lookup'
    );
    console.log(`[AgentCore:${this.agentId}] Tool access: Banking only (${bankingOnlyTools.length} tools) - NO handoff tools`);
    return bankingOnlyTools;  // ✅ No handoff tools
```

## Expected Behavior After Fix

### Before:
```
User: "What's my balance?"
Triage: [calls transfer_to_idv]
IDV: [verifies user]
Banking: [calls agentcore_balance]
Banking: "Your balance is £1200"
Banking: [calls return_to_triage] ❌
Triage: "Thinking..." (stuck) ❌
```

### After:
```
User: "What's my balance?"
Triage: [calls transfer_to_idv]
IDV: [verifies user]
Banking: [calls agentcore_balance]
Banking: "Your balance is £1200. Is there anything else I can help you with?" ✅
[WAITS for user response] ✅
```

## Files Modified
- `agents/src/agent-core.ts` (line 1856-1865)

## Testing
1. Rebuild agents: `npm run build` (in agents directory)
2. Restart banking agent: `docker-compose -f docker-compose-a2a.yml restart agent-banking`
3. Test flow:
   - User: "What's my balance, account 12345678, sort code 112233"
   - Verify banking agent provides balance and asks if user needs anything else
   - Verify banking agent does NOT call `return_to_triage`
   - Verify triage agent does NOT get stuck "Thinking..."

## Related Issues Fixed
This also fixes the triage agent "Thinking..." issue, which was caused by:
1. Banking agent calling `return_to_triage`
2. Banking agent speaking AFTER calling the tool
3. Message getting lost during handoff
4. Triage agent waiting for a message that never arrives

With this fix, the banking agent will wait for user response instead of automatically returning to triage.
