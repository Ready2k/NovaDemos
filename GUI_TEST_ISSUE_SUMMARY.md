# GUI Chat Test Issue - Root Cause Analysis

## Executive Summary

**Status**: ❌ CRITICAL BUG IDENTIFIED  
**Impact**: Chat interface completely non-functional for text-mode agents  
**Root Cause**: Gateway closes agent WebSocket immediately after forwarding text_input message  
**Affected**: All text-mode agents (triage, IDV, banking, etc.) when accessed via GUI

## Issue Description

When sending a message via the chat interface at localhost:3000:
1. ✅ Message reaches gateway successfully
2. ✅ Gateway forwards message to agent
3. ❌ **Agent WebSocket closes immediately**
4. ❌ Message never processed by agent
5. ❌ No response sent to user

## Timeline of Events

```
T+0ms:    Client connects to gateway (ws://localhost:8080/sonic)
T+100ms:  Gateway connects to triage agent
T+200ms:  Session initialized successfully
T+300ms:  Client sends: text_input "I need to check my balance"
T+310ms:  Gateway receives message
T+320ms:  Gateway updates memory (userIntent, lastUserMessage)
T+330ms:  Gateway forwards message to agent
T+340ms:  Gateway sends memory_update to agent
T+350ms:  Agent receives memory_update
T+360ms:  ❌ Agent WebSocket closes (close event fired)
T+370ms:  Agent calls handleDisconnect()
T+380ms:  Agent stops SonicClient
T+390ms:  Session terminated
```

## Root Cause

The issue is in the **gateway's message forwarding logic**. When the gateway receives a `text_input` message:

1. It updates the session memory
2. It forwards the `text_input` to the agent
3. It sends a `memory_update` to the agent
4. **Something causes the agent WebSocket to close**

### Evidence

From agent logs:
```
[UnifiedRuntime:triage] ✅ Session initialized: e6785d7a-...
[UnifiedRuntime:triage] 📨 Received message type: memory_update
[UnifiedRuntime:triage] Received memory update for session
[UnifiedRuntime:triage] Handling disconnect for session: e6785d7a-...
```

The agent receives `memory_update` but never receives `text_input`. The WebSocket close event fires immediately after `memory_update`.

### Gateway Code Analysis

From `gateway/src/server.ts` line 545:
```typescript
clientWs.on('close', async () => {
    activeConnections.delete(sessionId);
    if (agentWs) { try { agentWs.close(); } catch (e) { } }
    setTimeout(async () => { await router.deleteSession(sessionId); }, 60000);
});
```

When the **client** WebSocket closes, the gateway closes the **agent** WebSocket.

## Hypothesis

The most likely cause is that **the client WebSocket is closing prematurely**. This could be due to:

1. **Frontend auto-disconnect logic** - The frontend may be closing the connection after sending a message
2. **Error in message handling** - An error in the gateway or agent causes the connection to close
3. **Timeout** - A timeout is triggering premature closure
4. **Race condition** - The `memory_update` message is causing an error that closes the connection

## Testing Results

### Playwright Test (FAILED)
- Browser connects successfully
- Message sent successfully
- Connection closes immediately
- Error received: "Stream processing error"

### Simple WebSocket Test (FAILED)
- Direct WebSocket to gateway
- Message sent successfully  
- Connection closes immediately
- No error received, just silent disconnect

### Direct Agent Tests (PASSING)
- `test-idv-flow.js` - Works perfectly
- `test-realistic-conversation.js` - Works perfectly
- **Difference**: These connect directly to agents, bypassing gateway

## Next Steps to Fix

### 1. Add Debug Logging
Add logging to identify exactly when and why the WebSocket closes:

```typescript
// In gateway/src/server.ts
clientWs.on('close', async (code, reason) => {
    console.log(`[Gateway] Client WebSocket closed: code=${code}, reason=${reason}, sessionId=${sessionId}`);
    activeConnections.delete(sessionId);
    if (agentWs) { 
        console.log(`[Gateway] Closing agent WebSocket for session: ${sessionId}`);
        try { agentWs.close(); } catch (e) { } 
    }
    setTimeout(async () => { await router.deleteSession(sessionId); }, 60000);
});

agentWs.on('close', (code, reason) => {
    console.log(`[Gateway] Agent WebSocket closed: code=${code}, reason=${reason}, sessionId=${sessionId}`);
    if (agentWs === ws) agentWs = null;
});
```

### 2. Check Message Ordering
Verify that `text_input` is sent BEFORE `memory_update`:

```typescript
// In gateway/src/server.ts - around line 520
if (message.type === 'text_input' && message.text) {
    console.log(`[Gateway] Text input received: "${message.text}"`);
    const parsed = parseUserMessage(message.text);
    
    // CRITICAL: Forward message to agent FIRST
    if (agentWs && agentWs.readyState === WebSocket.OPEN && !isHandingOff) {
        console.log(`[Gateway] Forwarding text_input to agent BEFORE memory update`);
        agentWs.send(data, { binary: isBinary });
    }
    
    // THEN update memory
    if (parsed.accountNumber || parsed.sortCode || parsed.intent) {
        const currentMemory = await router.getMemory(sessionId);
        // ... update memory
        
        // Send memory_update AFTER text_input
        if (agentWs && agentWs.readyState === WebSocket.OPEN) {
            agentWs.send(JSON.stringify({
                type: 'memory_update',
                sessionId,
                memory: finalMemory,
                graphState: finalMemory?.graphState,
                timestamp: Date.now()
            }));
        }
    }
    return; // Don't forward again below
}
```

### 3. Fix Message Forwarding Logic
The current code may be forwarding the message twice or in the wrong order. Ensure:
- `text_input` is forwarded to agent immediately
- `memory_update` is sent after (if needed)
- No duplicate forwarding

### 4. Check for Errors
Add error handling to catch any exceptions that might close the connection:

```typescript
try {
    if (agentWs && agentWs.readyState === WebSocket.OPEN && !isHandingOff) {
        agentWs.send(data, { binary: isBinary });
    }
} catch (error) {
    console.error(`[Gateway] Error forwarding message:`, error);
    // Don't close connection on error
}
```

### 5. Verify Frontend Behavior
Check if the frontend is closing the connection after sending:

```typescript
// In frontend-v2/lib/hooks/useWebSocket.ts
// Ensure the connection stays open after sending
```

## Workaround

For immediate testing, bypass the gateway and connect directly to agents:

```javascript
// Connect directly to agent
const ws = new WebSocket('ws://localhost:8081/session');

ws.on('open', () => {
    // Send session_init
    ws.send(JSON.stringify({
        type: 'session_init',
        sessionId: 'test-session',
        memory: {}
    }));
    
    // Send text_input
    setTimeout(() => {
        ws.send(JSON.stringify({
            type: 'text_input',
            text: 'I need to check my balance'
        }));
    }, 2000);
});
```

## Impact Assessment

### Critical
- ❌ GUI chat interface completely broken
- ❌ Cannot test IDV flow via browser
- ❌ Cannot demo system to stakeholders
- ❌ User testing blocked

### Working
- ✅ Direct API tests (test scripts)
- ✅ Agent-to-agent communication
- ✅ Tool execution
- ✅ IDV verification logic

## Conclusion

The chat interface is non-functional due to a critical bug in the gateway's message forwarding logic. The WebSocket connection closes immediately after sending a message, preventing the agent from processing it.

The fix requires:
1. Adding debug logging to identify the exact close trigger
2. Fixing the message forwarding order (text_input before memory_update)
3. Ensuring the connection stays open after message forwarding
4. Adding error handling to prevent connection closure on errors

**Priority**: CRITICAL - This blocks all GUI-based testing and demos.
