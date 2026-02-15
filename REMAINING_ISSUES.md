# Remaining Issues - February 15, 2026

## Critical Issues Found During Testing

### 1. Duplicate Messages Still Appearing ❌
**Status**: NOT FIXED

**Evidence**: Every message appears twice in the chat:
```
Agent: Hello! Welcome to our banking services...
Agent: Hello! Welcome to our banking services...
```

**Root Cause**: The stable ID fix didn't work as expected. Need to investigate:
- Frontend deduplication logic may not be matching IDs correctly
- IDs may still be varying between duplicate messages
- Need to add console logging to see actual IDs being generated

**Next Steps**:
1. Add console.log in frontend to show message IDs
2. Check if IDs are truly identical for duplicates
3. Verify updateMessageById is being called correctly

---

### 2. Nova Sonic Crashes on Large Tool Results ❌
**Status**: CRITICAL BUG

**Error**:
```
[SonicClient] CRITICAL ERROR processing output stream: {
  message: 'The system encountered an unexpected error during processing. 
           Try your request again.'
}
```

**Root Cause**: Tool result too large (727 tokens of transaction data)
- Nova Sonic has limits on tool result size
- When checking disputes, the full transaction list is returned
- This causes Nova Sonic to crash and disconnect the session

**Impact**:
- Session crashes when asking about disputes
- No audio plays
- Connection becomes unresponsive
- User must reconnect

**Solution Options**:
1. **Truncate tool results** before sending to Nova Sonic
2. **Summarize large results** using a separate LLM call
3. **Paginate results** - only return relevant subset
4. **Filter results** - only return disputed transactions when asked about disputes

**Recommended Fix**:
Add result truncation in `sonic-client.ts` before sending tool results:
```typescript
// Truncate large tool results to prevent Nova Sonic crashes
const MAX_TOOL_RESULT_LENGTH = 2000; // characters
if (resultText.length > MAX_TOOL_RESULT_LENGTH) {
    resultText = resultText.substring(0, MAX_TOOL_RESULT_LENGTH) + 
                 '... [truncated for length]';
}
```

---

### 3. No Audio Playback ❌
**Status**: NOT WORKING

**Observations**:
- Microphone works (speech recognition functional)
- Text responses appear correctly
- No audio plays from agent responses
- Audio visualization doesn't animate

**Possible Causes**:
1. Audio events not reaching frontend from agents
2. Frontend audio processor not initialized properly
3. Audio WebSocket messages being dropped
4. Browser audio permissions issue

**Next Steps**:
1. Check browser console for audio errors
2. Verify audio events in WebSocket messages (DevTools Network tab)
3. Check if AudioContext is initialized
4. Verify audio processor playAudio() is being called

---

## Test Results Summary

### What Works ✅
- Connection to gateway
- Agent handoffs (Triage → IDV → Banking)
- IDV verification flow
- Balance check tool execution
- Transaction history tool execution (until crash)
- Speech recognition (microphone input)
- Text chat interface

### What Doesn't Work ❌
- Duplicate messages (every message shows twice)
- Audio playback (no sound from agents)
- Large tool results (causes Nova Sonic crash)
- Session recovery after crash

---

## Immediate Action Items

### Priority 1: Fix Nova Sonic Crash
**Impact**: HIGH - Blocks core functionality
**Effort**: LOW - Simple truncation fix

Add result size limit in `agents/src/sonic-client.ts`:
```typescript
// Before sending tool result to Nova Sonic
const resultString = JSON.stringify(result);
if (resultString.length > 2000) {
    // Truncate and add warning
    result = {
        ...result,
        truncated: true,
        note: 'Result truncated due to size limits'
    };
}
```

### Priority 2: Fix Duplicate Messages
**Impact**: HIGH - Poor user experience
**Effort**: MEDIUM - Requires debugging

Steps:
1. Add logging to see actual message IDs
2. Verify deduplication logic
3. Check if messages are coming from multiple sources

### Priority 3: Fix Audio Playback
**Impact**: MEDIUM - Voice mode doesn't work
**Effort**: MEDIUM - Requires investigation

Steps:
1. Check browser console for errors
2. Verify audio events in WebSocket
3. Test audio processor initialization

---

## Test Transcript

```
User: what can you help me with?
Agent: I can help with a variety of banking services... [DUPLICATE]

User: let's get my bank balance first.
Agent: I'll connect you to our banking specialist... [DUPLICATE]
Agent: Hello, I'm here to verify your identity... [DUPLICATE]

User: act digit is one two three four five
Agent: Thank you for providing your account number... [DUPLICATE]

User: one one two two three three
Agent: Thank you. Let me verify those details now... [DUPLICATE]
Agent: Let me check your balance for you right away... [DUPLICATE]
Agent: Your current balance is 1,200.00 GBP. [DUPLICATE]

User: what's my last two transactions?
Agent: Your last two transactions are: [DUPLICATE]
Agent: 1. On February 10th at Tesco Superstore for £45.67 (disputed)
Agent: 2. On February 9th at Shell Petrol for £52.30

User: how many open disputes do i have?
Agent: Let me check your open disputes for you...
[CRASH - Nova Sonic error, session disconnected]
```

---

## Docker Logs Analysis

### Banking Agent Log:
- Tool execution successful: `get_account_transactions`
- Tool result: 727 tokens (very large)
- **CRITICAL ERROR**: Nova Sonic rejected the large result
- Session disconnected immediately after error

### Gateway Log:
- Handoffs working correctly
- Message routing functional
- No errors in gateway itself

### Frontend Log:
- Need to check browser console
- Likely showing WebSocket disconnect error
- May show audio initialization errors

---

## Configuration Status

### Current Setup:
- All agents running in `MODE=hybrid` ✅
- AWS credentials configured ✅
- Gateway routing working ✅
- Tool execution working ✅ (until crash)

### Issues:
- Tool result size not limited ❌
- Duplicate message deduplication not working ❌
- Audio playback not functional ❌

---

## Recommended Next Steps

1. **Immediate**: Add tool result truncation to prevent crashes
2. **High Priority**: Debug and fix duplicate messages
3. **High Priority**: Investigate and fix audio playback
4. **Medium Priority**: Add better error handling for Nova Sonic errors
5. **Low Priority**: Add session recovery after crashes

---

## Files That Need Changes

1. `agents/src/sonic-client.ts` - Add tool result truncation
2. `frontend-v2/app/page.tsx` - Debug duplicate message logic
3. `frontend-v2/lib/hooks/useAudioProcessor.ts` - Check audio playback
4. `agents/src/voice-sidecar.ts` - Verify audio event forwarding

---

## Status: Partially Working

The system is functional for basic chat interactions but has critical issues:
- ❌ Duplicate messages make chat confusing
- ❌ Large tool results crash the session
- ❌ No audio playback (voice mode broken)

**Recommendation**: Fix tool result truncation first (prevents crashes), then tackle duplicates and audio.
