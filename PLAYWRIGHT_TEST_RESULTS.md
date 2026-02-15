# Playwright Chat Interface Test Results

## Test Execution Summary

**Date**: February 14, 2026  
**Test**: Send "I need to check my balance" via chat interface  
**Status**: ❌ FAILED - Message not processed by agent

## Test Flow

1. ✅ Browser opened at http://localhost:3000
2. ✅ Page loaded successfully
3. ✅ Connect button clicked
4. ✅ WebSocket connection established to ws://localhost:8080/sonic
5. ✅ Session initialized (sessionId: b46d9990-4f96-4c64-8af1-803584fbcc08)
6. ✅ Message typed: "I need to check my balance"
7. ✅ Message sent via Enter key
8. ❌ **ERROR**: Stream processing error received
9. ❌ No transcript messages received
10. ❌ No agent response

## Message Flow Analysis

### Frontend → Gateway
```
[Test] → Sent: text_input "I need to check my balance"
[Gateway] Text input received: "I need to check my balance"
[SessionRouter] Updated memory: [ 'userIntent', 'lastUserMessage' ]
[Gateway] Forwarding message to agent (binary: false)
```
✅ **Status**: Working correctly

### Gateway → Triage Agent
```
[UnifiedRuntime:triage] ✅ Session initialized: b46d9990-4f96-4c64-8af1-803584fbcc08
[UnifiedRuntime:triage] 📨 Received message type: memory_update
[UnifiedRuntime:triage] Received memory update for session
```
✅ **Status**: Session initialized, memory_update received

### Triage Agent Processing
```
[SonicClient] CRITICAL ERROR processing output stream: 
{ message: 'Timed out waiting for input events' }
[SonicClient] Output event processing ended
```
❌ **Status**: FAILED - SonicClient timeout

## Root Cause Analysis

### Issue: SonicClient Timeout in Text Mode

**Agent Configuration**:
- Agent: triage
- Mode: TEXT (MODE=text)
- Adapter: TextAdapter
- Client: SonicClient

**Problem**:
The SonicClient is timing out because it's not receiving input events after session initialization. The text_input messages from the gateway are not being processed by the TextAdapter.

**Evidence**:
1. No `text_input` or `handleUserInput` logs in triage agent
2. SonicClient reports "Timed out waiting for input events"
3. Gateway successfully forwards messages but agent doesn't process them
4. Session disconnects after timeout

### Suspected Code Path Issue

The message flow should be:
```
Gateway → Agent WebSocket → UnifiedRuntime.handleMessage() 
→ TextAdapter.handleUserInput() → SonicClient.sendText()
```

But it appears to stop at:
```
Gateway → Agent WebSocket → UnifiedRuntime.handleMessage() 
→ [STOPS HERE - text_input not routed to TextAdapter]
```

## Comparison with Working Tests

### test-idv-flow.js (PASSING)
- Uses direct WebSocket to agent
- Sends text_input messages
- Agent processes and responds
- **Difference**: Direct connection, not through gateway

### test-realistic-conversation.js (PASSING)  
- Uses direct WebSocket to IDV agent
- Sends text_input messages
- Agent processes and responds
- **Difference**: Direct connection, not through gateway

### Playwright test (FAILING)
- Uses frontend → gateway → agent
- Sends text_input messages
- Agent receives but doesn't process
- **Difference**: Goes through gateway layer

## Hypothesis

The issue may be in how the UnifiedRuntime handles messages when they come through the gateway vs. direct connection. The gateway may be sending messages in a format that the UnifiedRuntime doesn't recognize or route correctly to the TextAdapter.

## Next Steps

1. **Add debug logging** to UnifiedRuntime.handleMessage() to see what messages are received
2. **Check message format** - compare direct vs. gateway message structure
3. **Verify TextAdapter routing** - ensure text_input messages reach handleUserInput()
4. **Test with direct connection** - bypass gateway to isolate the issue
5. **Review gateway message forwarding** - ensure message structure is preserved

## Workaround

For now, the system works with:
- Direct agent connections (test scripts)
- Voice mode (not tested in this session)

The issue is specific to:
- Text mode agents
- Messages routed through gateway
- Frontend chat interface

## Impact

- ❌ Chat interface unusable for text-mode agents
- ❌ Cannot test IDV flow via GUI
- ✅ Direct API tests still work
- ✅ Voice mode may still work (not tested)

## Files Involved

- `gateway/src/server.ts` - Message forwarding
- `agents/src/agent-runtime-unified.ts` - Message handling
- `agents/src/text-adapter.ts` - Text input processing
- `agents/src/sonic-client.ts` - Stream management
- `frontend-v2/app/page.tsx` - Message sending
- `frontend-v2/lib/hooks/useWebSocket.ts` - WebSocket client
