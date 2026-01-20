# Quick Testing Guide - Phase 1 Fixes

## Prerequisites
- Backend is built (`npm run build` in backend/)
- Backend server is running (`npm start` in backend/)
- Frontend is accessible at `http://localhost:8080`

---

## Test 1: Feedback API Fix

### Steps:
1. **Start Session**
   - Open `http://localhost:8080`
   - Open browser DevTools (F12) → Console tab
   - Click "Connect" button
   - Have a brief conversation (2-3 exchanges)

2. **Disconnect**
   - Click "Disconnect" button
   - Feedback modal should appear

3. **Submit Feedback**
   - Click either 👍 (thumbs up) or 👎 (thumbs down)
   - Watch browser console for:
     ```
     [Feedback] Sending payload: {sessionId: "...", traceId: "...", score: 1, ...}
     [Feedback] Successfully submitted feedback
     ```

4. **Check Backend Logs**
   - Look for in terminal:
     ```
     [Server] Received feedback request body: {...}
     [Server] Found active session, using Langfuse trace ID: xxx
     [Server] Recorded feedback for trace xxx: score=1
     [Server] Updated local history file xxx with feedback.
     ```

5. **Verify in UI**
   - Click "Chat History" in sidebar
   - Find the session you just completed
   - Verify feedback icon (👍 or 👎) appears next to timestamp

6. **Verify in Langfuse**
   - Open Langfuse dashboard
   - Find the trace for your session
   - Verify score is attached (value: 1 or 0)

### Expected Results:
- ✅ No "undefined" in logs
- ✅ Feedback successfully submitted
- ✅ Icon appears in history
- ✅ Score visible in Langfuse

### If It Fails:
- Check `sessionId` is not null in browser console
- Check backend has active session in `activeSessions` map
- Verify Langfuse credentials are set in `.env`

---

## Test 2: Sentiment Initialization

### Steps:
1. **Start New Session**
   - Reload page (Ctrl+R / Cmd+R)
   - Click "Connect" button
   - Look at "Live Sentiment" panel (should appear immediately)

2. **Check Initial State**
   - Verify chart shows ONE data point
   - Data point should be at y=0 (middle of chart)
   - Horizontal line at y=0 should be highlighted (thicker, brighter)
   - Main sentiment stat should show "Neutral (0.00)"

3. **Send First Message**
   - Type a message or speak
   - Wait for assistant response
   - Check if sentiment updates from neutral baseline

4. **Continue Conversation**
   - Have 3-4 more exchanges
   - Watch sentiment chart update
   - Verify it progresses naturally from neutral

5. **Check Historical Data**
   - Disconnect
   - Go to "Chat History"
   - Load the session you just completed
   - Verify sentiment chart shows progression starting from neutral

### Expected Results:
- ✅ Chart starts with 1 data point at y=0
- ✅ Neutral line (y=0) is visually highlighted
- ✅ Main stat shows "Neutral" initially
- ✅ Sentiment updates naturally from baseline
- ✅ Historical view shows correct progression

### If It Fails:
- Check browser console for errors
- Verify `this.sentimentData` has initial neutral object
- Check Chart.js is loaded (typeof Chart !== 'undefined')
- Verify sentiment tags are being extracted from LLM responses

---

## Test 3: Integration Test (Both Fixes)

### Steps:
1. Start fresh session
2. Verify sentiment starts at neutral ✅
3. Have conversation
4. Watch sentiment update ✅
5. Disconnect
6. Submit feedback (👍 or 👎) ✅
7. Go to Chat History
8. Verify:
   - Feedback icon appears ✅
   - Sentiment chart shows correct progression ✅
9. Reload page
10. Go to Chat History again
11. Verify both feedback and sentiment persist ✅

---

## Debug Commands

### Check Active Sessions (Backend)
Add this temporarily to server.ts after feedback handler:
```typescript
console.log('Active sessions:', Array.from(activeSessions.values()).map(s => ({
  sessionId: s.sessionId,
  hasTrace: !!s.langfuseTrace,
  traceId: s.langfuseTrace?.id
})));
```

### Check Sentiment Data (Frontend)
In browser console:
```javascript
// Check current sentiment data
app.sentimentData

// Check if chart exists
app.liveSentimentChart

// Check initial data
app.sentimentData[0]
```

### Check Feedback Payload (Frontend)
In browser console before clicking feedback:
```javascript
// Check session ID
app.sessionId

// Check trace ID
app.currentTraceId
app.pendingFeedbackTraceId
```

---

## Common Issues

### Issue: "sessionId is undefined"
**Cause:** Session not properly initialized  
**Fix:** Ensure `this.sessionId` is set when WebSocket connects

### Issue: "Sentiment chart not appearing"
**Cause:** Chart.js not loaded or canvas element missing  
**Fix:** Check Chart.js CDN link in HTML, verify canvas element exists

### Issue: "Feedback not in Langfuse"
**Cause:** Trace ID mismatch or Langfuse credentials  
**Fix:** Verify `LANGFUSE_SECRET_KEY` in `.env`, check trace ID in logs

### Issue: "Sentiment starts negative"
**Cause:** Neutral baseline not initialized  
**Fix:** Verify `this.sentimentData` has initial object with score: 0

---

## Success Criteria

### All Tests Pass If:
1. ✅ Feedback logs show sessionId and traceId (not undefined)
2. ✅ Feedback appears in Langfuse dashboard
3. ✅ Feedback icon shows in history list
4. ✅ Sentiment chart starts at y=0 (neutral)
5. ✅ Neutral line is visually distinct
6. ✅ Sentiment updates naturally from baseline
7. ✅ Both features persist across page reload

---

## Next Steps After Testing

If all tests pass:
1. Commit changes with descriptive message
2. Tag release: `git tag v1.1-feedback-sentiment-fix`
3. Update CHANGELOG.md
4. Proceed with Phase 2 (Langfuse Prompt Management)

If tests fail:
1. Review error logs
2. Check implementation against plan
3. Debug specific failing test
4. Fix and re-test
5. Consider rollback if critical

---

**Testing Status:** Ready for Testing  
**Estimated Time:** 15-20 minutes  
**Last Updated:** 2026-01-20
