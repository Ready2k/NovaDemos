# Test Guide: Context Order Fix

## What Was Fixed

The Banking agent was receiving session context but not acting on it because:
1. Context was injected AFTER the persona prompt (wrong order)
2. Persona prompt said "CHECK THE CONTEXT ABOVE" but context was below
3. Nova Sonic couldn't see the context when reading instructions

**Solution:**
- Reordered system prompt: Context → Persona → Handoff → Workflow
- Made Banking prompt more explicit with concrete examples
- Added step-by-step instructions

## Expected Behavior

### Before Fix ❌
```
User: "I want to check my balance"
[IDV verifies user as Sarah Johnson]
Banking: "Hello Sarah, welcome to our banking assistance service. How can I help you today?"
[User has to repeat their request]
```

### After Fix ✅
```
User: "I want to check my balance"
[IDV verifies user as Sarah Johnson]
Banking: "Hello Sarah, let me fetch your balance for you..."
[Banking immediately calls agentcore_balance]
Banking: "Your current balance is £1,234.56"
[Banking returns to triage]
```

## Test Steps

### 1. Restart Services

```bash
./restart-local-services.sh
```

Wait for all services to be ready:
- Gateway: http://localhost:8080
- Triage Agent: http://localhost:8081
- IDV Agent: http://localhost:8082
- Banking Agent: http://localhost:8083
- Frontend: http://localhost:3000

### 2. Open Frontend

Navigate to: http://localhost:3000

### 3. Test Balance Check Journey

**Step 1: Start conversation**
- Click microphone or type: "I want to check my balance"
- Expected: Triage routes to IDV

**Step 2: Provide credentials**
- IDV asks for account number
- Say/type: "12345678"
- IDV asks for sort code
- Say/type: "112233"
- Expected: IDV verifies as Sarah Johnson

**Step 3: Banking agent takes over**
- Expected: Banking says "Hello Sarah, let me fetch your balance for you..."
- Expected: Banking immediately calls agentcore_balance
- Expected: Banking speaks the real balance from AgentCore
- Expected: Banking does NOT ask "How can I help you?"

**Step 4: Return to triage**
- Expected: Banking returns to triage automatically
- Expected: Triage asks "Is there anything else I can help you with, Sarah?"

### 4. Check Logs

**Banking Agent Logs:**
```bash
tail -f logs/agent-banking.log
```

Look for:
```
[Agent:persona-SimpleBanking] Initializing session: <session-id>
[Agent:persona-SimpleBanking] Combined context (XXX chars) + persona prompt (YYY chars) + handoff (ZZZ chars) + workflow (AAA chars)
[Agent:persona-SimpleBanking] ✅ Restored verified user from memory: Sarah Johnson
[Agent:persona-SimpleBanking] ✅ Stored userIntent in session: User needs identity verification for balance check
[Agent:persona-SimpleBanking] Session context available:
[Agent:persona-SimpleBanking]   - User Intent: User needs identity verification for balance check
[Agent:persona-SimpleBanking]   - Verified User: Sarah Johnson
[Agent:persona-SimpleBanking]   - Account: 12345678
[Agent:persona-SimpleBanking] Nova Sonic S2S session started
[Agent:persona-SimpleBanking] 💰 BANKING TOOL: agentcore_balance
[Agent:persona-SimpleBanking] Tool input: { accountId: '12345678', sortCode: '112233' }
[Agent:persona-SimpleBanking] Calling local-tools service: http://local-tools:9000
[Agent:persona-SimpleBanking] Tool result from local-tools: { balance: 1234.56, currency: 'GBP', ... }
```

**Gateway Logs:**
```bash
tail -f logs/gateway.log
```

Look for:
```
[Gateway] Handoff: persona-idv → persona-SimpleBanking
[Gateway] Handoff context: {
  fromAgent: 'persona-idv',
  reason: 'User needs identity verification for balance check',
  verified: true,
  userName: 'Sarah Johnson',
  account: '12345678',
  sortCode: '112233'
}
[Gateway] Stored session memory: {
  verified: true,
  userName: 'Sarah Johnson',
  account: '12345678',
  sortCode: '112233',
  userIntent: 'User needs identity verification for balance check'
}
[Gateway] Sending session_init to Banking with memory
```

## Success Criteria

### ✅ Context Order
- [ ] Context appears BEFORE persona prompt in system prompt
- [ ] Banking logs show "Combined context (XXX chars) + persona prompt..."
- [ ] Context includes userIntent and verified user

### ✅ Banking Agent Behavior
- [ ] Banking greets user by name: "Hello Sarah..."
- [ ] Banking acts immediately: "let me fetch your balance for you..."
- [ ] Banking does NOT ask "How can I help you?"
- [ ] Banking calls agentcore_balance tool
- [ ] Banking speaks real balance from AgentCore (not mock data)
- [ ] Banking returns to triage automatically

### ✅ Tool Execution
- [ ] Banking logs show "💰 BANKING TOOL: agentcore_balance"
- [ ] Banking logs show "Calling local-tools service"
- [ ] Banking logs show "Tool result from local-tools"
- [ ] Balance is real data from AgentCore (not "£1,000.00" mock)

### ✅ Memory Passing
- [ ] IDV stores verified user in session
- [ ] Gateway receives update_memory message
- [ ] Gateway stores memory in Redis
- [ ] Banking receives session_init with memory
- [ ] Banking restores verified user from memory
- [ ] Banking restores userIntent from memory

## Troubleshooting

### Issue: Banking still asks "How can I help you?"

**Check:**
1. Is context being injected?
   ```bash
   grep "Session context available" logs/agent-banking.log
   ```
2. Is context in correct order?
   ```bash
   grep "Combined context" logs/agent-banking.log
   ```
3. Is userIntent being passed?
   ```bash
   grep "userIntent" logs/gateway.log
   ```

**Fix:**
- Restart services: `./restart-local-services.sh`
- Check that agents/dist was rebuilt: `ls -la agents/dist/agent-runtime-s2s.js`

### Issue: Banking uses mock data instead of AgentCore

**Check:**
1. Is local-tools service running?
   ```bash
   curl http://localhost:9000/health
   ```
2. Is Banking calling the right tool?
   ```bash
   grep "agentcore_balance" logs/agent-banking.log
   ```

**Fix:**
- Check persona configuration: `cat backend/personas/persona-SimpleBanking.json`
- Should have: `"allowedTools": ["agentcore_balance", "agentcore_transactions", ...]`

### Issue: Context not being passed from IDV to Banking

**Check:**
1. Is IDV storing verified user?
   ```bash
   grep "Stored verified user" logs/agent-idv.log
   ```
2. Is Gateway receiving update_memory?
   ```bash
   grep "update_memory" logs/gateway.log
   ```
3. Is Gateway passing memory to Banking?
   ```bash
   grep "session_init" logs/gateway.log
   ```

**Fix:**
- Check IDV tool result handling in agents/src/agent-runtime-s2s.ts
- Check Gateway memory storage in gateway/src/server.ts

## Test Accounts

Use these test accounts from AgentCore:

**Sarah Johnson:**
- Account: 12345678
- Sort Code: 112233
- Expected Balance: Real data from AgentCore

**John Smith:**
- Account: 87654321
- Sort Code: 112233
- Expected Balance: Real data from AgentCore

## Next Steps

Once this test passes:
1. ✅ Context is in correct order
2. ✅ Banking acts on userIntent immediately
3. ✅ Banking calls real AgentCore tools
4. ✅ Banking speaks real balance data

Then test:
- Transactions journey
- Multiple handoffs
- Return to triage and new request
- Error handling (invalid account)

## Files Changed

1. `agents/src/agent-runtime-s2s.ts` - Reordered system prompt construction
2. `backend/prompts/persona-banking.txt` - Made instructions more explicit
3. `agents/dist/agent-runtime-s2s.js` - Compiled TypeScript

## Documentation

- `CONTEXT_ORDER_FIX.md` - Detailed explanation of the fix
- `CONTEXT_INJECTION_FIX.md` - Previous attempt (sending as message)
- `USER_INTENT_PASSTHROUGH_FIX.md` - How userIntent flows through handoffs
- `MEMORY_HANDOFF_COMPLETE.md` - How verified user memory works
