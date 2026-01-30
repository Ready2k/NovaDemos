# Quick Test - Intent Preservation Fix

## What Changed
Banking agent now receives the original user intent and acts immediately instead of asking "How can I help?"

## Test Now

### 1. Rebuild & Restart (Required!)
```bash
# Terminal 1
cd gateway && npm run build && cd ..
cd agents && npm run build && cd ..
./restart-local-services.sh
```

### 2. Open Logs (3 terminals)
```bash
# Terminal 2 - Gateway
tail -f logs/gateway.log | grep -i "intent\|preserving"

# Terminal 3 - Banking
tail -f logs/agent-banking.log | grep -i "intent\|context"

# Terminal 4 - All handoffs
tail -f logs/gateway.log | grep -i "handoff"
```

### 3. Test
Open http://localhost:3000

Say: **"I want to check my balance"**

### 4. What You Should See

**Gateway Log:**
```
[Gateway] Storing NEW user intent: User wants to check their balance
[Gateway] Preserving ORIGINAL user intent: User wants to check their balance
```

**Banking Log:**
```
[Agent:persona-SimpleBanking] ✅ Injecting session context into system prompt
[Agent:persona-SimpleBanking]    📋 User Intent: "User wants to check their balance"
[Agent:persona-SimpleBanking]    ✅ Verified User: Sarah Jones
```

**Voice Journey:**
1. Triage (Matthew): "Let me verify your identity first..."
2. IDV (Stephen): "Please provide your account number..."
3. Banking (Joanna): **"Hello Sarah, let me fetch your balance for you..."** ✅
4. Triage (Matthew): "Is there anything else I can help you with, Sarah?"

## Success = Banking Says This
✅ "Hello Sarah, let me fetch your balance for you..."

## Failure = Banking Says This
❌ "Hello, how can I help you today?"

## If It Fails

1. **Check services rebuilt:**
   ```bash
   ls -la gateway/dist/server.js
   ls -la agents/dist/agent-runtime-s2s.js
   ```
   Both should have recent timestamps.

2. **Check services running:**
   ```bash
   ps aux | grep node
   ```
   Should see gateway, agent-triage, agent-idv, agent-banking.

3. **Check logs for errors:**
   ```bash
   tail -100 logs/gateway.log | grep -i error
   ```

## Quick Debug

If Banking still asks "How can I help?":

```bash
# Check if intent was stored
grep "Storing NEW user intent" logs/gateway.log | tail -1

# Check if intent was preserved
grep "Preserving ORIGINAL" logs/gateway.log | tail -1

# Check if Banking received it
grep "User Intent" logs/agent-banking.log | tail -1
```

All three should show the same intent: "User wants to check their balance"

## Files Changed (Already Done)
- ✅ gateway/src/server.ts - Intent preservation
- ✅ agents/src/agent-runtime-s2s.ts - Enhanced logging
- ✅ backend/prompts/persona-triage.txt - Intelligent routing
- ✅ backend/prompts/persona-idv.txt - Clarified handoff

## Ready to Test!
Services are built. Just restart and test.
