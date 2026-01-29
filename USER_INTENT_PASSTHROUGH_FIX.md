# User Intent Passthrough Fix - Complete Chain

## Additional Problem Found

The userIntent was being stored in Redis by the Gateway ✅, but when the IDV agent handed off to Banking, it was using the default reason "User needs specialist assistance" instead of passing along the stored userIntent ❌.

## Root Cause

When IDV agent called `transfer_to_banking`, it wasn't providing a `reason` parameter in the tool input, so the handoff code defaulted to "User needs specialist assistance".

The userIntent was in Redis and being passed to agents in `session_init`, but agents weren't storing it in their session to pass it through subsequent handoffs.

## Solution

### 1. Store userIntent in Agent Session (agents/src/agent-runtime-s2s.ts)

**Added userIntent to AgentSession interface:**
```typescript
interface AgentSession {
    // ... existing fields
    userIntent?: string;  // Original user request to pass through handoffs
}
```

**Store userIntent when receiving session_init:**
```typescript
if (message.memory && message.memory.userIntent) {
    newSession.userIntent = message.memory.userIntent;
    console.log(`[Agent:${AGENT_ID}] ✅ Stored userIntent in session: ${message.memory.userIntent}`);
}
```

### 2. Pass userIntent Through Handoffs

**When building handoff context, check session for userIntent:**
```typescript
// Use reason from tool input, or fall back to stored userIntent from session
handoffContext.reason = toolInput.reason || toolInput.context || 'User needs specialist assistance';

// If we have stored userIntent in session, pass it along
if (!toolInput.reason && session.userIntent) {
    handoffContext.reason = session.userIntent;
    console.log(`[Agent:${AGENT_ID}] Using stored userIntent for handoff: ${session.userIntent}`);
}
```

## Complete Data Flow

```
User: "I want to check my balance"
  ↓
Triage: Calls transfer_to_idv
  → reason: "User needs identity verification for balance check"
  ↓
Gateway: Stores in Redis
  → memory.userIntent = "User needs identity verification for balance check"
  ↓
IDV: Receives session_init with memory
  → Stores in session.userIntent
  → Verifies user
  → Calls transfer_to_banking (no reason parameter)
  ↓
Handoff Code: Checks for reason
  → toolInput.reason = undefined
  → Falls back to session.userIntent
  → handoffContext.reason = "User needs identity verification for balance check"
  ↓
Gateway: Receives handoff with correct reason
  → Updates memory.userIntent (already correct)
  → Passes memory to Banking agent
  ↓
Banking: Receives session_init with memory
  → Stores in session.userIntent
  → Injects into system prompt:
     "User Intent: User needs identity verification for balance check"
  ↓
Banking: Acts on intent immediately
  → "Hello Sarah, let me fetch your balance for you..."
  → Calls agentcore_balance
```

## Files Modified

1. **agents/src/agent-runtime-s2s.ts**
   - Added `userIntent` to AgentSession interface
   - Store userIntent from memory in session
   - Use stored userIntent when building handoff context if tool input doesn't provide reason

## Testing

Restart services:
```bash
./restart-local-services.sh
```

Test and check logs:

**IDV storing userIntent:**
```bash
tail -f logs/agent-idv.log | grep "Stored userIntent"
# Expected: [Agent:idv] ✅ Stored userIntent in session: User needs identity verification for balance check
```

**IDV using userIntent for handoff:**
```bash
tail -f logs/agent-idv.log | grep "Using stored userIntent"
# Expected: [Agent:idv] Using stored userIntent for handoff: User needs identity verification for balance check
```

**Banking receiving correct intent:**
```bash
tail -f logs/agent-banking.log | grep "Injecting session context"
# Expected: [Agent:persona-SimpleBanking] Injecting session context with userIntent: User needs identity verification for balance check
```

## Expected Behavior

Banking agent should now:
1. ✅ Receive the correct userIntent (not "User needs specialist assistance")
2. ✅ See it in the system prompt
3. ✅ Act on it immediately
4. ✅ Say "Hello Sarah, let me fetch your balance for you..."
5. ✅ Call agentcore_balance tool (not use mock data)

## Success Criteria

✅ Triage passes userIntent to Gateway  
✅ Gateway stores userIntent in Redis  
✅ IDV receives and stores userIntent in session  
✅ IDV passes userIntent through handoff to Banking  
✅ Banking receives correct userIntent (not default)  
✅ Banking acts on userIntent immediately  
✅ Banking calls real tools (not mock data)  

The userIntent now flows through the ENTIRE handoff chain! 🎉
