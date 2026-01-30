# Context Injection Fix - Send Context to Nova Sonic

## Final Problem

The userIntent and verified user context were being injected into the system prompt, but Nova Sonic had already been configured and started, so it never saw the context. The Banking agent was still asking "How can I help you?" because Nova Sonic didn't know about the user's request.

## Root Cause

The flow was:
1. Configure Nova Sonic with system prompt ✅
2. Start Nova Sonic session ✅
3. Inject context into system prompt ❌ (too late - Nova already started)

Nova Sonic doesn't re-read the system prompt after starting, so the injected context was never seen.

## Solution

Instead of injecting context into the system prompt (which Nova has already read), send the context as an **initial message** to Nova Sonic right after starting the session.

### Implementation (agents/src/agent-runtime-s2s.ts)

```typescript
// Start Nova Sonic S2S session
await sonicClient.startSession(
    (event: SonicEvent) => handleSonicEvent(event, sessionId!, ws),
    sessionId
);

// Inject session context as initial message if available
if (message.memory && (message.memory.userIntent || message.memory.verified)) {
    let contextMessage = '[SYSTEM CONTEXT]\n';
    
    if (message.memory.userIntent) {
        contextMessage += `User Request: ${message.memory.userIntent}\n`;
    }
    
    if (message.memory.verified) {
        contextMessage += `Verified Customer: ${message.memory.userName}\n`;
        contextMessage += `Account: ${message.memory.account}\n`;
        contextMessage += `Sort Code: ${message.memory.sortCode}\n`;
    }
    
    contextMessage += '\nIMPORTANT: Act on the user request immediately. Do NOT ask "How can I help you?" - you already know what they need!';
    
    console.log(`[Agent:${AGENT_ID}] Injecting context message into Nova Sonic`);
    await sonicClient.sendText(contextMessage);
}
```

## How It Works

1. **Banking agent receives session_init** with memory (userIntent + verified user)
2. **Configure Nova Sonic** with system prompt and tools
3. **Start Nova Sonic session**
4. **Send context message** to Nova Sonic as first message:
   ```
   [SYSTEM CONTEXT]
   User Request: User needs identity verification for balance check
   Verified Customer: Sarah Johnson
   Account: 12345678
   Sort Code: 112233
   
   IMPORTANT: Act on the user request immediately. Do NOT ask "How can I help you?" - you already know what they need!
   ```
5. **Nova Sonic sees context** and acts on it immediately

## Expected Behavior

### Before Fix ❌
```
Banking: "Hello Sarah, welcome to our banking assistance service. How can I help you today?"
[Waits for user to repeat their request]
```

### After Fix ✅
```
Banking: [Receives context message]
Banking: "Hello Sarah, let me fetch your balance for you..."
[Immediately calls agentcore_balance]
Banking: "Your current balance is £1,234.56"
```

## Files Modified

1. **agents/src/agent-runtime-s2s.ts**
   - Send context message to Nova Sonic after starting session
   - Include userIntent and verified user in message
   - Add explicit instruction to act immediately

## Testing

Restart services:
```bash
./restart-local-services.sh
```

Test journey:
1. Say: "I want to check my balance"
2. Provide: Account 12345678, Sort Code 112233
3. Banking should say: "Hello Sarah, let me fetch your balance for you..."
4. Banking should immediately call agentcore_balance
5. Banking should NOT ask "How can I help you?"

Check logs:
```bash
tail -f logs/agent-banking.log | grep "Injecting context message"
# Expected: [Agent:persona-SimpleBanking] Injecting context message into Nova Sonic
```

## Success Criteria

✅ Context sent to Nova Sonic as initial message  
✅ Nova Sonic sees userIntent before responding  
✅ Nova Sonic sees verified user before responding  
✅ Banking agent acts on intent immediately  
✅ Banking agent does NOT ask "How can I help you?"  
✅ Banking agent calls real tools  

The context is now properly delivered to Nova Sonic! 🎉
