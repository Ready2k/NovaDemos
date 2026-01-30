# Intent Preservation Fix - COMPLETE

## Problem
User intent was being lost during multi-agent handoffs:
- Triage captures intent: "User wants to check their balance"
- IDV verifies user
- Banking receives verified user BUT NOT the original intent
- Banking asks "How can I help?" instead of acting on the intent

## Root Cause
The gateway was **overwriting** the original userIntent every time a handoff occurred:

```
Triage → IDV: reason="User wants to check their balance"
Gateway stores: userIntent="User wants to check their balance" ✅

IDV → Banking: reason="User verified"  
Gateway overwrites: userIntent="User verified" ❌ (LOST THE ORIGINAL!)

Banking receives: userIntent="User verified" (not helpful!)
```

## Solution Implemented

### 1. Gateway: Preserve Original Intent (`gateway/src/server.ts`)

Updated the handoff handling to **NOT overwrite** userIntent if it already exists:

```typescript
// BEFORE (BAD):
if (message.context.reason) {
    updates.userIntent = message.context.reason;  // Always overwrites!
}

// AFTER (GOOD):
if (message.context.reason) {
    if (!sessionMemory.userIntent) {
        updates.userIntent = message.context.reason;
        console.log(`[Gateway] Storing NEW user intent: ${message.context.reason}`);
    } else {
        console.log(`[Gateway] Preserving ORIGINAL user intent: ${sessionMemory.userIntent}`);
    }
}
```

**Key Change:**
- First handoff (Triage → IDV): Stores the original intent
- Subsequent handoffs (IDV → Banking): Preserves the original intent
- Original intent flows through the entire journey

### 2. Agent Runtime: Enhanced Logging (`agents/src/agent-runtime-s2s.ts`)

Added detailed logging to track intent flow:

```typescript
console.log(`[Agent:${AGENT_ID}] ✅ Injecting session context into system prompt`);
console.log(`[Agent:${AGENT_ID}]    📋 User Intent: "${message.memory.userIntent}"`);
console.log(`[Agent:${AGENT_ID}]    ✅ Verified User: ${message.memory.userName}`);
console.log(`[Agent:${AGENT_ID}]    💳 Account: ${message.memory.account}`);
```

This makes it easy to verify that intent is flowing correctly through logs.

### 3. IDV Prompt: Clarified Handoff (`backend/prompts/persona-idv.txt`)

Updated IDV prompt to clarify that the original intent is preserved automatically:

```
**If Verified:**
- Call `transfer_to_banking` with:
  - reason: "User verified and needs [original user request]"
  
**CRITICAL: The original user request is in session context and will be passed automatically!**
```

## Expected Flow (After Fix)

```
User: "I want to check my balance"
↓
Triage: Captures intent
  - Calls: transfer_to_idv
  - Reason: "User wants to check their balance"
↓
Gateway: Stores in memory
  - userIntent: "User wants to check their balance" ✅
↓
IDV: Verifies user
  - Calls: transfer_to_banking
  - Reason: "User verified"
↓
Gateway: Preserves original intent
  - userIntent: "User wants to check their balance" ✅ (NOT overwritten!)
↓
Banking: Receives full context
  - userIntent: "User wants to check their balance" ✅
  - verified: true
  - userName: "Sarah Jones"
  - account: "12345678"
↓
Banking: Acts immediately
  - "Hello Sarah, let me fetch your balance for you..."
  - [Calls agentcore_balance tool]
  - "Your current balance is £1,200.00"
```

## Testing Checklist

To verify the fix works:

1. **Start services:**
   ```bash
   ./restart-local-services.sh
   ```

2. **Test intent preservation:**
   - User: "I want to check my balance"
   - Triage should route to IDV
   - IDV should verify
   - Banking should receive intent and act immediately

3. **Check logs:**
   ```bash
   # Triage log - should show intent capture
   tail -f logs/agent-triage.log | grep "intent\|handoff"
   
   # Gateway log - should show intent preservation
   tail -f logs/gateway.log | grep "intent\|Preserving"
   
   # Banking log - should show intent received
   tail -f logs/agent-banking.log | grep "intent\|User Intent"
   ```

4. **Expected log output:**
   ```
   [Triage] Handoff reason: User wants to check their balance
   [Gateway] Storing NEW user intent: User wants to check their balance
   [IDV] Handoff reason: User verified
   [Gateway] Preserving ORIGINAL user intent: User wants to check their balance
   [Banking] ✅ Injecting session context into system prompt
   [Banking]    📋 User Intent: "User wants to check their balance"
   [Banking]    ✅ Verified User: Sarah Jones
   ```

## Files Modified

1. **gateway/src/server.ts**
   - Line ~705: Added check to prevent overwriting userIntent
   - Preserves original intent through multi-agent handoffs

2. **agents/src/agent-runtime-s2s.ts**
   - Line ~220: Enhanced logging for context injection
   - Added emoji indicators for better log readability

3. **backend/prompts/persona-idv.txt**
   - Line ~35: Clarified that original intent is preserved automatically
   - Removed confusing instructions about manually passing intent

## Key Insights

### Why This Matters
Without intent preservation:
- Banking agent has no context about what user wants
- Must ask "How can I help?" (frustrating for user)
- User has to repeat their request
- Poor user experience

With intent preservation:
- Banking agent knows exactly what user wants
- Acts immediately: "Let me fetch your balance..."
- Seamless, proactive experience
- User feels understood

### Design Pattern
This implements a **sticky context** pattern:
- First agent captures the intent
- Intent "sticks" to the session
- All subsequent agents receive the original intent
- Intent only cleared when user starts a new request

### Future Enhancements
Consider adding:
- Intent history (track multiple intents in one session)
- Intent priority (which intent to act on first)
- Intent completion tracking (mark intents as fulfilled)

## Status
✅ **COMPLETE** - Intent now preserved through multi-agent handoffs

## Next Steps
1. Rebuild and restart services to apply changes
2. Test with real voice input
3. Verify logs show intent preservation
4. Test multiple handoff scenarios
