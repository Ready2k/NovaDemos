# Memory Fix Applied - Verified User Context Passing

## Problem Identified

IDV verification was working correctly - the `perform_idv_check` tool was being called and returning:
```json
{
  "auth_status": "VERIFIED",
  "customer_name": "Sarah Johnson",
  "account_status": "OPEN"
}
```

However, when the IDV agent called `transfer_to_banking`, the verified user information (customer name, account, sort code) was NOT being passed to the Banking agent. The Banking agent had no memory of who the verified user was.

## Root Cause

The handoff context was only passing the `reason` and `context` string from the tool input, but NOT the actual verified user data that was stored in the IDV tool result.

## Solution Implemented

### 1. Session Memory Storage (agents/src/agent-runtime-s2s.ts)

**Added `verifiedUser` to AgentSession interface:**
```typescript
interface AgentSession {
    sessionId: string;
    ws: WebSocket;
    sonicClient: SonicClient;
    graphExecutor: GraphExecutor | null;
    startTime: number;
    messages: any[];
    currentNode?: string;
    verifiedUser?: {
        customer_name: string;
        account: string;
        sortCode: string;
        auth_status: string;
    };
}
```

**Store IDV result in session when tool returns:**
```typescript
if (toolName === 'perform_idv_check' && result.auth_status === 'VERIFIED') {
    session.verifiedUser = {
        customer_name: result.customer_name,
        account: toolInput.accountNumber,
        sortCode: toolInput.sortCode,
        auth_status: result.auth_status
    };
    console.log(`[Agent:${AGENT_ID}] ✅ Stored verified user in session: ${result.customer_name}`);
    
    // Notify gateway to update Redis session memory
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

### 2. Include Verified User in Handoff Context

**When calling handoff tools, include verified user data:**
```typescript
// CRITICAL: Include verified user data from session memory
if (session.verifiedUser) {
    handoffContext.verified = true;
    handoffContext.userName = session.verifiedUser.customer_name;
    handoffContext.account = session.verifiedUser.account;
    handoffContext.sortCode = session.verifiedUser.sortCode;
    console.log(`[Agent:${AGENT_ID}] Including verified user in handoff: ${handoffContext.userName}`);
}
```

### 3. Gateway Memory Management (gateway/src/server.ts)

**Handle memory updates from agents:**
```typescript
if (message.type === 'update_memory') {
    console.log(`[Gateway] Updating session memory:`, message.memory);
    await router.updateMemory(sessionId, message.memory);
    return; // Don't forward to client
}
```

**Pass memory to new agent on handoff:**
```typescript
agentWs.on('open', () => {
    router.getMemory(sessionId).then(memory => {
        agentWs!.send(JSON.stringify({
            type: 'session_init',
            sessionId,
            traceId,
            memory: memory || {},  // Pass session memory to agent
            timestamp: Date.now()
        }));
        
        if (memory && memory.verified) {
            console.log(`[Gateway] Passed verified user to agent: ${memory.userName}`);
        }
    });
});
```

### 4. Restore Verified User in New Agent Session

**When Banking agent receives session_init, restore verified user:**
```typescript
// Restore verified user from session memory if available
if (message.memory && message.memory.verified) {
    newSession.verifiedUser = {
        customer_name: message.memory.userName,
        account: message.memory.account,
        sortCode: message.memory.sortCode,
        auth_status: 'VERIFIED'
    };
    console.log(`[Agent:${AGENT_ID}] ✅ Restored verified user from memory: ${message.memory.userName}`);
}
```

### 5. Updated Banking Agent Prompt

Updated `backend/prompts/persona-banking.txt` to:
- Assume customer is already verified (IDV handles this)
- Use customer name from handoff context
- Use account details from handoff context
- Greet customer by name immediately
- Don't ask for account details again

## Expected Flow Now

```
User: "I want to check my balance"
↓
Triage: "Let me verify your identity first" [calls transfer_to_idv]
↓
IDV: "Please provide your account number and sort code"
User: "12345678 and 112233"
IDV: [calls perform_idv_check via AgentCore]
     → Returns: { auth_status: 'VERIFIED', customer_name: 'Sarah Johnson' }
     → Stores in session.verifiedUser
     → Notifies gateway to update Redis memory
IDV: "Great, Sarah. You've been verified" 
     [calls transfer_to_banking with verified context]
     → Handoff context includes: { verified: true, userName: "Sarah Johnson", account: "12345678", sortCode: "112233" }
↓
Gateway: Receives handoff request
         → Updates Redis session memory
         → Routes to Banking agent
         → Passes memory to Banking agent in session_init
↓
Banking: Receives session_init with memory
         → Restores session.verifiedUser from memory
         → Has access to customer name and account details
Banking: "Hello Sarah, I can help you with your balance. Let me fetch that for you..."
         [calls agentcore_balance with accountId="12345678", sortCode="112233"]
Banking: "Your current balance is £1,234.56"
         [calls return_to_triage]
↓
Triage: "Is there anything else I can help you with today, Sarah?"
```

## Files Modified

1. `agents/src/agent-runtime-s2s.ts` - Session memory storage and handoff context
2. `gateway/src/server.ts` - Memory update handling and passing to new agents
3. `backend/prompts/persona-banking.txt` - Updated to use verified user context

## Testing

Restart services and test the full journey:
```bash
./restart-local-services.sh
```

Then test:
1. Say "I want to check my balance"
2. Provide account: 12345678, sort code: 112233
3. Banking agent should greet you as "Sarah" and fetch your balance
4. Customer name should persist throughout the conversation

## Log Verification

Check logs for:
- `[Agent:idv] ✅ Stored verified user in session: Sarah Johnson`
- `[Gateway] Updating session memory: { verified: true, userName: 'Sarah Johnson', ... }`
- `[Gateway] Passed verified user to agent banking: Sarah Johnson`
- `[Agent:banking] ✅ Restored verified user from memory: Sarah Johnson`
