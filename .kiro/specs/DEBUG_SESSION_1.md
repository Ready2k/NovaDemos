# Debug Session 1: Message Not Forwarded

## Problem
User typed "hi" but nothing happened. No response, no message in UI.

## Investigation

### Frontend Logs
```
[WebSocket] Connected
[WebSocket] Sending workflow selection: triage
[App] Sending message to WebSocket
[App] Message payload: {"type":"text_input","text":"hi"}
[App] Message sent
[App] Disconnecting... hasInteracted: true
[WebSocket] Disconnected 1005
```

### Gateway Logs
```
[Gateway] New WebSocket connection: 7070f6a5-cd71-41aa-a717-4cdfb97ded49
[SessionRouter] Created session 7070f6a5-cd71-41aa-a717-4cdfb97ded49 → triage
[Gateway] Routing session 7070f6a5-cd71-41aa-a717-4cdfb97ded49 to agent: triage
[Gateway] Connected to agent: triage
[SessionRouter] Deleted session 7070f6a5-cd71-41aa-a717-4cdfb97ded49
```

**NO LOG OF RECEIVING text_input MESSAGE!**

### Agent Logs
```
[UnifiedRuntime:triage] Initialized in text mode
[TextAdapter] Text session started successfully: 7070f6a5-cd71-41aa-a717-4cdfb97ded49
[SonicClient] Received event type: usageEvent (multiple times)
[UnifiedRuntime:triage] Handling disconnect for session: 7070f6a5-cd71-41aa-a717-4cdfb97ded49
```

**Agent never received the "hi" message!**

## Root Cause

The gateway is NOT forwarding `text_input` messages to the agent. The message flow breaks at the gateway.

Looking at the gateway code, the issue is:
1. Frontend sends `text_input` with "hi"
2. Gateway receives it and parses it
3. Gateway does some processing (memory updates, etc.)
4. Gateway should forward to agent BUT...
5. The forwarding logic might not be working correctly

## Fix Applied

Added debug logging to gateway to see:
- When JSON messages are received
- What type they are
- Whether they're being forwarded
- Why they might not be forwarded

Changes in `gateway/src/server.ts`:
- Added `console.log` for received JSON messages
- Added `console.log` for text_input specifically
- Added `console.log` for forwarding status
- Added `console.log` for buffering status
- Added `console.log` when no agent connection

## Next Steps

1. **Test again** with the new logging
2. **Watch gateway logs** to see if text_input is received
3. **Check if message is forwarded** to agent
4. **If not forwarded**, identify why (initialization state, agent connection, etc.)

## Hypothesis

Possible causes:
1. **Session not fully initialized** - Gateway thinks session isn't ready
2. **Agent connection not established** - agentWs is null or not OPEN
3. **Message being buffered** - isInitializing or isHandingOff is true
4. **Race condition** - Message arrives before agent connection completes

## Test Commands

```bash
# Watch gateway logs
docker-compose -f docker-compose-unified.yml logs -f gateway

# Watch agent logs
docker-compose -f docker-compose-unified.yml logs -f agent-triage

# Test in browser
# 1. Open http://localhost:3000
# 2. Type "hi"
# 3. Watch logs for message flow
```

## Expected Behavior

With new logging, we should see:
```
[Gateway] Received JSON message from client: text_input
[Gateway] Text input received: "hi"
[Gateway] Forwarding message to agent (binary: false)
```

Then in agent logs:
```
[TextAdapter] Received text input: hi
[Agent] Processing message
[Agent] Generating response
```

## Status

- ✅ Logging added to gateway
- ✅ Gateway rebuilt and restarted
- ⏳ Ready for testing
- ❌ Root cause not yet confirmed

---

**Next**: Test again and analyze new logs
