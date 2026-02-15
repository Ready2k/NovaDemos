# Critical Issues Found - GUI Testing

**Date**: February 15, 2026  
**Status**: 🔴 CRITICAL BUGS DETECTED

## Issue 1: Duplicate Agent Messages (CRITICAL)

### Symptoms
- Agent sends the same message 3 times in a row
- Visible in user screenshot showing 3 identical "Hello, I'm here to verify your identity" messages
- Test output shows duplicate "Hello!How can I help you today?" in response text

### Evidence
From user screenshot:
```
Agent 11:19 AM
Hello, I'm here to verify your identity.
Please provide your 8-digit account number and 6-digit sort code.

Agent 11:19 AM  
Hello, I'm here to verify your identity.
Please provide your 8-digit account number and 6-digit sort code. I can help you check your open disputes, but first I need to verify your identity for security reasons. Please provide your 8-digit account number and 6-digit sort code.

Agent 11:19 AM
Hello, I'm here to verify your identity.
Please provide your 8-digit account number and 6-digit sort code. I can help you check your open disputes, but first I need to verify your identity for security reasons. Please provide your 8-digit account number and 6-digit sort code.
```

### Root Cause Analysis Needed
Possible causes:
1. **Agent sending multiple transcript events** - IDV agent may be emitting multiple transcript events for the same message
2. **Frontend rendering duplicates** - Frontend may be rendering the same message multiple times
3. **WebSocket message duplication** - Messages may be sent multiple times over WebSocket
4. **Agent runtime issue** - Agent may be processing the same input multiple times

### Impact
- **User Experience**: SEVERELY DEGRADED - confusing and unprofessional
- **Usability**: Users see repeated messages cluttering the interface
- **Trust**: Reduces confidence in the system

## Issue 2: IDV Agent Audio Timeout

### Symptoms
```
[SonicClient] CRITICAL ERROR processing output stream: {
  message: 'RequestId=4ebcdeb4-974f-479d-80b4-c26da3d6a883 : Timed out waiting for audio bytes (59 seconds).'
}
```

### Root Cause
- IDV agent is configured for voice mode but receiving text-only input
- Agent waits for audio bytes that never arrive
- Times out after 59 seconds

### Impact
- **Performance**: Unnecessary 59-second delays
- **Resource Usage**: Wasted connections and timeouts
- **Logs**: Cluttered with error messages

### Fix Required
- Configure IDV agent for text mode when used in chat interface
- OR: Detect input mode and configure agent accordingly

## Issue 3: Blocked Handoff from IDV to Banking

### Symptoms
```
[Gateway] ⚠️  Handoff transfer_to_banking failed or blocked: Multiple handoff calls blocked: Already called transfer_to_idv in this turn. Only one handoff tool can be called per turn. Please wait for the handoff to complete.
```

### Root Cause
- IDV agent is trying to call `transfer_to_banking` tool
- But the previous turn already called `transfer_to_idv`
- System blocks multiple handoffs in same turn

### Expected Behavior
- Gateway should auto-route to banking after successful IDV verification
- IDV agent should NOT need to call transfer_to_banking
- This is the "Verified State Gate" pattern we implemented

### Impact
- **Flow Interruption**: Handoff may not complete properly
- **User Experience**: May require additional prompting
- **System Design**: Violates the intended architecture

## Priority Assessment

### P0 - CRITICAL (Must Fix Before Production)
1. **Duplicate Messages** - Breaks user experience completely

### P1 - HIGH (Should Fix Soon)
2. **IDV Audio Timeout** - Performance and resource issue
3. **Blocked Handoff** - May cause flow failures

## Recommended Actions

### Immediate (Today)
1. **Investigate duplicate message root cause**
   - Check IDV agent transcript emission
   - Check frontend message rendering logic
   - Check WebSocket message handling
   - Add deduplication logic if needed

2. **Fix IDV agent mode configuration**
   - Set MODE=text for IDV agent in docker-compose
   - OR: Make agent auto-detect mode from input

3. **Verify auto-routing after IDV**
   - Ensure gateway routes to banking after successful IDV
   - Remove transfer_to_banking from IDV agent tools
   - Test complete flow

### Testing Required
1. Manual GUI testing with visual inspection
2. Check browser DevTools Network tab for WebSocket messages
3. Verify each message is sent only once
4. Verify no duplicate rendering in frontend
5. End-to-end flow test: triage → IDV → banking

## Test Results Summary

### What Works ✅
- WebSocket connection establishment
- Message sending and receiving
- Agent responds to requests
- Balance information retrieved
- Dispute information retrieved (3 disputes)
- Handoff from triage to IDV

### What's Broken ❌
- **Duplicate messages** (CRITICAL)
- IDV agent audio timeout
- Blocked handoff from IDV to banking

## Conclusion

The system is **NOT READY FOR PRODUCTION** due to the critical duplicate message issue. This must be fixed before any user testing or deployment.

The core functionality works (connection, messaging, tool execution, handoffs), but the user experience is severely degraded by message duplication.

**Estimated Fix Time**: 2-4 hours
**Priority**: P0 - CRITICAL

