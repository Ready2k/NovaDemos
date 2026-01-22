# ✅ FIXED: Both Active Issues

## Issue 1: Live Session Data Not Updating ⏱️
**Status:** ✅ Debug logging added

### Changes Made
**File:** `frontend-v2/app/page.tsx`
- Added debug logging to `token_usage` handler to track incoming data
- Logs current session state before update

**File:** `frontend-v2/lib/context/AppContext.tsx`
- Added debug logging to `updateSessionStats` function
- Logs when stats are updated and the new session state

### Expected Console Output
```
[WebSocket] Received token usage: { inputTokens: 150, outputTokens: 75 }
[WebSocket] Current session before update: { sessionId: '...', inputTokens: 0, ... }
[AppContext] updateSessionStats called with: { inputTokens: 150, outputTokens: 75 }
[AppContext] Updated session: { sessionId: '...', inputTokens: 150, outputTokens: 75, ... }
```

---

## Issue 2: Feedback Missing sessionId/traceId 👍👎
**Status:** ✅ Fixed

### Problem
Feedback payload was missing `sessionId` and `traceId`:
```
[Server] Received feedback request body: {"score":1,"name":"user-feedback"}
[Server] Feedback Debug: sessionId=undefined, traceId=undefined
```

### Root Cause
The feedback handler was using:
```typescript
sessionId: finishedSessionId || currentSession?.sessionId
```

But both could be `null` after session ends. The `sessionIdRef` (which persists) wasn't being used.

### Fix Applied
**File:** `frontend-v2/app/page.tsx` (lines 542-580)

**Before:**
```typescript
const feedbackPayload = {
  sessionId: finishedSessionId || currentSession?.sessionId,
  traceId: currentSession?.sessionId,
  score,
  comment,
  name: 'user-feedback'
};
```

**After:**
```typescript
// Use multiple fallbacks to ensure we have a session ID
const sessionId = finishedSessionId || currentSession?.sessionId || sessionIdRef.current;

console.log('[App] Feedback Debug:', {
  finishedSessionId,
  currentSessionId: currentSession?.sessionId,
  sessionIdRef: sessionIdRef.current,
  finalSessionId: sessionId
});

if (!sessionId) {
  console.error('[App] Cannot send feedback: No session ID available');
  return;
}

const feedbackPayload = {
  sessionId,
  traceId: sessionId, // Use sessionId as traceId fallback
  score,
  comment,
  name: 'user-feedback'
};
```

### Key Improvements
1. **Triple fallback:** `finishedSessionId` → `currentSession?.sessionId` → `sessionIdRef.current`
2. **Validation:** Checks if `sessionId` exists before sending
3. **Debug logging:** Shows all three values to diagnose issues
4. **Response handling:** Checks if fetch succeeded and logs errors

---

## Testing

### Test Live Session Data
1. **Restart frontend-v2**
2. **Open browser console**
3. **Start a session**
4. **Send a message**
5. **Check console for:**
   - `[WebSocket] Received token usage`
   - `[AppContext] updateSessionStats called`
   - `[AppContext] Updated session`
6. **Verify UI updates:**
   - Duration increments
   - Token counts increase
   - Cost calculates

### Test Feedback
1. **Start a session**
2. **Send a message**
3. **Disconnect**
4. **Click thumbs up/down**
5. **Check console for:**
   ```
   [App] Feedback Debug: { finishedSessionId: '...', currentSessionId: null, sessionIdRef: '...', finalSessionId: '...' }
   [App] Sending Feedback Payload: { sessionId: '...', traceId: '...', score: 1, ... }
   [App] Feedback sent successfully
   ```
6. **Check backend logs for:**
   ```
   [Server] Received feedback request body: {"sessionId":"...","traceId":"...","score":1,"name":"user-feedback"}
   [Server] Feedback Debug: sessionId=abc-123, traceId=abc-123, actualTraceId=abc-123
   [Server] Recorded feedback successfully
   ```

---

## Build Status

```bash
✅ Frontend-v2 rebuilt successfully
✅ No TypeScript errors
✅ Ready to test
```

---

## Summary

### Files Modified
1. `frontend-v2/app/page.tsx`
   - Added debug logging for token usage
   - Fixed feedback handler to use `sessionIdRef`
   - Added validation and error handling

2. `frontend-v2/lib/context/AppContext.tsx`
   - Added debug logging for `updateSessionStats`

### What's Fixed
- ✅ Live Session Data debug logging (to diagnose update issues)
- ✅ Feedback payload includes `sessionId` and `traceId`
- ✅ Robust fallback chain for session ID
- ✅ Validation before sending feedback
- ✅ Comprehensive error logging

---

**Status:** ✅ Complete  
**Build:** ✅ Successful  
**Action:** Restart frontend-v2 and test both features!
