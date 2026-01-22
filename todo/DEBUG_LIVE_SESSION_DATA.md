# 🔍 DEBUG: Live Session Data Not Updating

## Problem
The Live Session Data panel in frontend-v2 is showing zeros for:
- Duration: 00:00
- Cost: $0.000
- Input Tokens: 0
- Output Tokens: 0

## Investigation

### What We Know
1. **Backend is sending token updates** ✅
   - Format: `{ type: 'token_usage', inputTokens, outputTokens }`
   - Sent after each turn

2. **Frontend has handlers** ✅
   - `page.tsx` has `case 'token_usage'` handler
   - Calls `updateSessionStats({ inputTokens, outputTokens })`

3. **Context has update function** ✅
   - `AppContext.tsx` has `updateSessionStats` function
   - Merges stats into `currentSession`

4. **Display reads from context** ✅
   - `useSessionStats` hook reads `currentSession.inputTokens/outputTokens`
   - `InsightPanel` displays these values

### Debug Logging Added

#### 1. Token Usage Handler (`page.tsx`)
```typescript
case 'token_usage':
  console.log('[WebSocket] Received token usage:', { inputTokens, outputTokens });
  console.log('[WebSocket] Current session before update:', currentSession);
  
  updateSessionStats({ inputTokens, outputTokens });
  
  console.log('[WebSocket] Called updateSessionStats with:', { inputTokens, outputTokens });
  break;
```

#### 2. Update Function (`AppContext.tsx`)
```typescript
const updateSessionStats = useCallback((stats: Partial<Session>) => {
    console.log('[AppContext] updateSessionStats called with:', stats);
    setCurrentSession(prev => {
        const updated = prev ? { ...prev, ...stats } : null;
        console.log('[AppContext] Updated session:', updated);
        return updated;
    });
}, []);
```

## Testing Steps

1. **Restart frontend-v2** (already built)
2. **Open browser console** (Cmd+Option+J)
3. **Start a session**
4. **Send a message** (voice or text)
5. **Watch console logs** for:
   ```
   [WebSocket] Received token usage: { inputTokens: X, outputTokens: Y }
   [WebSocket] Current session before update: { ... }
   [WebSocket] Called updateSessionStats with: { inputTokens: X, outputTokens: Y }
   [AppContext] updateSessionStats called with: { inputTokens: X, outputTokens: Y }
   [AppContext] Updated session: { sessionId: '...', inputTokens: X, outputTokens: Y, ... }
   ```

## Possible Issues

### Scenario 1: Not Receiving Messages
**Symptom:** No `[WebSocket] Received token usage` logs  
**Cause:** Backend not sending or WebSocket not connected  
**Fix:** Check backend logs for `[Session] Sent token update`

### Scenario 2: Not Calling Update
**Symptom:** Logs show received but no `[AppContext]` logs  
**Cause:** `updateSessionStats` not being called  
**Fix:** Check if handler is breaking early

### Scenario 3: Update Not Persisting
**Symptom:** `[AppContext]` logs show update but UI doesn't change  
**Cause:** React state not triggering re-render  
**Fix:** Check if `currentSession` reference is changing

### Scenario 4: Display Not Reading
**Symptom:** State updates but display shows zeros  
**Cause:** `useSessionStats` not reading updated values  
**Fix:** Check if hook dependencies are correct

## Expected Console Output

```
[WebSocket] Received message: session_start
[Session] Started: abc-123-def
[Session] Capture Ref Updated: abc-123-def
[AppContext] Setting current session: abc-123-def

... user sends message ...

[WebSocket] Received message: token_usage
[WebSocket] Received token usage: { inputTokens: 150, outputTokens: 75 }
[WebSocket] Current session before update: { sessionId: 'abc-123-def', inputTokens: 0, outputTokens: 0, ... }
[WebSocket] Called updateSessionStats with: { inputTokens: 150, outputTokens: 75 }
[AppContext] updateSessionStats called with: { inputTokens: 150, outputTokens: 75 }
[AppContext] Updated session: { sessionId: 'abc-123-def', inputTokens: 150, outputTokens: 75, ... }
```

## Next Steps

1. **Test with debug logs** - See what's happening
2. **Identify which scenario** - Match symptoms to scenarios above
3. **Apply targeted fix** - Based on findings

---

**Status:** 🔍 Debug logging added, ready to test  
**Build:** ✅ Frontend-v2 rebuilt  
**Action:** Restart frontend-v2 and check console logs
