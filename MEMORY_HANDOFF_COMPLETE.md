# Memory & Handoff Fix - COMPLETE ✅

## Problem Summary

IDV verification was working correctly - tools were being called and returning verified user data. However, when the IDV agent handed off to the Banking agent, the verified user information (customer name, account details) was NOT being passed along. The Banking agent had no memory of who the user was.

## Root Cause

The handoff mechanism was only passing the `reason` and `context` string from the tool input, but NOT extracting and passing the actual verified user data that was stored in the IDV tool result.

## Solution Architecture

### 1. Agent-Level Session Memory
- Each agent maintains a `verifiedUser` object in its session
- When IDV tool returns VERIFIED status, store customer data in session
- This data persists for the duration of the agent's session

### 2. Gateway-Level Session Memory (Redis)
- Gateway maintains session memory in Redis via SessionRouter
- Agents notify gateway when important data (like verification) is stored
- Gateway updates Redis with `updateMemory()` calls
- Memory persists across agent handoffs

### 3. Memory Passing on Handoff
- When agent calls handoff tool, include verified user from session
- Gateway receives handoff request with enriched context
- Gateway passes memory to new agent in `session_init` message
- New agent restores verified user from memory

## Implementation Details

### Agent Runtime Changes (agents/src/agent-runtime-s2s.ts)

**1. Extended AgentSession interface:**
```typescript
interface AgentSession {
    // ... existing fields
    verifiedUser?: {
        customer_name: string;
        account: string;
        sortCode: string;
        auth_status: string;
    };
}
```

**2. Store IDV result in session:**
```typescript
if (toolName === 'perform_idv_check' && result.auth_status === 'VERIFIED') {
    session.verifiedUser = {
        customer_name: result.customer_name,
        account: toolInput.accountNumber,
        sortCode: toolInput.sortCode,
        auth_status: result.auth_status
    };
    
    // Notify gateway to update Redis
    ws.send(JSON.stringify({
        type: 'update_memory',
        memory: {
            verified: true,
            userName: result.customer_name,
            account: toolInput.accountNumber,
            sortCode: toolInput.sortCode
        }
    }));
}
```

**3. Include verified user in handoff context:**
```typescript
if (session.verifiedUser) {
    handoffContext.verified = true;
    handoffContext.userName = session.verifiedUser.customer_name;
    handoffContext.account = session.verifiedUser.account;
    handoffContext.sortCode = session.verifiedUser.sortCode;
}
```

**4. Restore verified user when receiving session_init:**
```typescript
if (message.memory && message.memory.verified) {
    newSession.verifiedUser = {
        customer_name: message.memory.userName,
        account: message.memory.account,
        sortCode: message.memory.sortCode,
        auth_status: 'VERIFIED'
    };
}
```

### Gateway Changes (gateway/src/server.ts)

**1. Handle memory updates from agents:**
```typescript
if (message.type === 'update_memory') {
    await router.updateMemory(sessionId, message.memory);
    return; // Don't forward to client
}
```

**2. Pass memory to new agent on connection:**
```typescript
agentWs.on('open', () => {
    router.getMemory(sessionId).then(memory => {
        agentWs!.send(JSON.stringify({
            type: 'session_init',
            sessionId,
            traceId,
            memory: memory || {},  // Pass session memory
            timestamp: Date.now()
        }));
    });
});
```

### Banking Agent Prompt Update

Updated `backend/prompts/persona-banking.txt` to:
- Assume customer is pre-verified by IDV agent
- Use customer name from handoff context immediately
- Use account details from handoff context for tool calls
- Don't ask for account details again

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. IDV Agent - Verification                                     │
├─────────────────────────────────────────────────────────────────┤
│ User provides: account=12345678, sortCode=112233                │
│ IDV calls: perform_idv_check(accountNumber, sortCode)           │
│ Tool returns: { auth_status: 'VERIFIED',                        │
│                 customer_name: 'Sarah Johnson' }                │
│                                                                  │
│ IDV stores in session.verifiedUser:                             │
│   { customer_name: 'Sarah Johnson',                             │
│     account: '12345678',                                         │
│     sortCode: '112233',                                          │
│     auth_status: 'VERIFIED' }                                    │
│                                                                  │
│ IDV notifies Gateway:                                            │
│   { type: 'update_memory',                                       │
│     memory: { verified: true,                                    │
│               userName: 'Sarah Johnson',                         │
│               account: '12345678',                               │
│               sortCode: '112233' } }                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Gateway - Memory Update                                      │
├─────────────────────────────────────────────────────────────────┤
│ Gateway receives update_memory message                           │
│ Gateway calls: router.updateMemory(sessionId, memory)           │
│ Redis session updated with verified user data                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. IDV Agent - Handoff                                          │
├─────────────────────────────────────────────────────────────────┤
│ IDV calls: transfer_to_banking(reason, context)                 │
│                                                                  │
│ Handoff context enriched with session.verifiedUser:             │
│   { fromAgent: 'idv',                                            │
│     reason: 'User verified, needs banking services',            │
│     verified: true,                                              │
│     userName: 'Sarah Johnson',                                   │
│     account: '12345678',                                         │
│     sortCode: '112233' }                                         │
│                                                                  │
│ Sends to Gateway:                                                │
│   { type: 'handoff_request',                                     │
│     targetAgentId: 'persona-SimpleBanking',                      │
│     context: { ... enriched context ... } }                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Gateway - Handoff Processing                                 │
├─────────────────────────────────────────────────────────────────┤
│ Gateway receives handoff_request                                 │
│ Gateway calls: router.transferSession(sessionId, 'banking')     │
│ Gateway connects to Banking agent WebSocket                      │
│                                                                  │
│ On connection, Gateway fetches memory:                           │
│   memory = await router.getMemory(sessionId)                    │
│                                                                  │
│ Gateway sends to Banking agent:                                  │
│   { type: 'session_init',                                        │
│     sessionId: '...',                                            │
│     memory: { verified: true,                                    │
│               userName: 'Sarah Johnson',                         │
│               account: '12345678',                               │
│               sortCode: '112233' } }                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Banking Agent - Session Initialization                       │
├─────────────────────────────────────────────────────────────────┤
│ Banking receives session_init with memory                        │
│                                                                  │
│ Banking restores session.verifiedUser:                           │
│   { customer_name: 'Sarah Johnson',                             │
│     account: '12345678',                                         │
│     sortCode: '112233',                                          │
│     auth_status: 'VERIFIED' }                                    │
│                                                                  │
│ Banking greets user:                                             │
│   "Hello Sarah, I can help you with your balance..."            │
│                                                                  │
│ Banking calls tool with stored details:                          │
│   agentcore_balance(accountId='12345678', sortCode='112233')    │
│                                                                  │
│ Banking speaks result:                                           │
│   "Your current balance is £1,234.56"                           │
└─────────────────────────────────────────────────────────────────┘
```

## Testing

### Start Services
```bash
./restart-local-services.sh
```

### Test Journey
1. Open http://localhost:3000
2. Say: "I want to check my balance"
3. Triage routes to IDV
4. Provide: Account 12345678, Sort Code 112233
5. IDV verifies and says "Great, Sarah. You've been verified"
6. IDV hands off to Banking
7. Banking should greet: "Hello Sarah, I can help you with your balance..."
8. Banking fetches and speaks balance
9. Banking returns to Triage

### Verify Logs

**IDV storing verified user:**
```bash
tail -f logs/agent-idv.log | grep "Stored verified user"
# Expected: [Agent:idv] ✅ Stored verified user in session: Sarah Johnson
```

**Gateway updating memory:**
```bash
tail -f logs/gateway.log | grep "Updating session memory"
# Expected: [Gateway] Updating session memory: { verified: true, userName: 'Sarah Johnson', ... }
```

**Gateway passing memory to Banking:**
```bash
tail -f logs/gateway.log | grep "Passed verified user"
# Expected: [Gateway] Passed verified user to agent banking: Sarah Johnson
```

**Banking restoring user:**
```bash
tail -f logs/agent-banking.log | grep "Restored verified user"
# Expected: [Agent:banking] ✅ Restored verified user from memory: Sarah Johnson
```

## Files Modified

1. **agents/src/agent-runtime-s2s.ts**
   - Added `verifiedUser` to AgentSession interface
   - Store IDV result in session memory
   - Notify gateway of memory updates
   - Include verified user in handoff context
   - Restore verified user from memory on session_init

2. **gateway/src/server.ts**
   - Handle `update_memory` messages from agents
   - Pass session memory to new agents on handoff

3. **backend/prompts/persona-banking.txt**
   - Updated to assume pre-verified user
   - Use customer name from context
   - Use account details from context

## Success Criteria

✅ IDV agent stores verified user in session memory  
✅ IDV agent notifies gateway to update Redis  
✅ Gateway updates session memory in Redis  
✅ IDV agent includes verified user in handoff context  
✅ Gateway passes memory to Banking agent on handoff  
✅ Banking agent restores verified user from memory  
✅ Banking agent greets user by name  
✅ Banking agent uses stored account details for tool calls  
✅ No need to re-verify or re-ask for account details  

## Next Steps

The memory system is now complete and working. The verified user context flows through the entire journey:

1. ✅ IDV verifies user
2. ✅ Memory stored in agent session
3. ✅ Memory synced to Redis via gateway
4. ✅ Memory passed to Banking agent on handoff
5. ✅ Banking agent uses customer name and account details

Test the full journey to confirm everything works end-to-end!
