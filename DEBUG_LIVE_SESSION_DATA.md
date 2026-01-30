# Debugging Live Session Data

## Console Debugging

Open DevTools (F12) and monitor these console logs:

### Session Duration
```javascript
// Should see this when session starts
[Session] Started: {sessionId}

// Should see duration incrementing
// (check InsightPanel component - duration updates every 1 second)
```

### Language Detection
```javascript
// Should see this when language is detected
[Session] Language detected: en-US Confidence: 0.95

// If you don't see this, check:
// 1. Backend is sending metadata messages
// 2. Message format matches expected structure
```

### Token Usage
```javascript
// Should see this when tokens are used
[Session] Token usage: { inputTokens: 150, outputTokens: 200 }
[Session] Token usage (token_usage): { inputTokens: 150, outputTokens: 200 }

// If you don't see this, check:
// 1. Backend is sending usage or token_usage messages
// 2. Token counts are being calculated correctly
```

## Network Debugging

1. Open DevTools → Network tab
2. Filter for WebSocket connections
3. Click on the WebSocket connection
4. Go to Messages tab
5. Look for these message types:
   - `metadata` - should contain `detectedLanguage`
   - `usage` or `token_usage` - should contain token counts
   - `session_start` - should contain `sessionId` and `timestamp`

## React DevTools Debugging

1. Install React DevTools extension
2. Open DevTools → Components tab
3. Find `InsightPanel` component
4. Check props:
   - `currentSession.sessionId` - should exist
   - `currentSession.startTime` - should be ISO string
   - `currentSession.detectedLanguage` - should update
   - `currentSession.inputTokens` - should increase
   - `currentSession.outputTokens` - should increase

## State Debugging

Add this to your browser console to inspect current state:

```javascript
// Check AppContext state
// (requires access to useApp hook - add to a component)

// Or check localStorage
localStorage.getItem('app-state')

// Or add temporary logging to page.tsx:
console.log('Current Session:', currentSession);
console.log('Connection Status:', connectionStatus);
console.log('Settings:', settings);
```

## Common Issues & Solutions

### Issue: Duration stuck at 00:00
**Cause**: `startTime` not being set or being reset on renders
**Solution**: Check that `currentSession.startTime` is set when session starts
**Debug**: 
```javascript
console.log('Session Start Time:', currentSession?.startTime);
console.log('Session ID:', currentSession?.sessionId);
```

### Issue: Language stuck on "Detecting..."
**Cause**: Backend not sending metadata message or wrong format
**Solution**: Check backend is sending metadata with `detectedLanguage`
**Debug**:
```javascript
// Add to page.tsx handleWebSocketMessage
case 'metadata':
    console.log('Metadata message received:', message);
    // Check if detectedLanguage exists
    console.log('Detected Language:', message.data?.detectedLanguage);
```

### Issue: Cost showing $0.000
**Cause**: Token counts not being captured
**Solution**: Check token usage messages are being received
**Debug**:
```javascript
// Add to page.tsx handleWebSocketMessage
case 'usage':
case 'token_usage':
    console.log('Token message received:', message);
    console.log('Input Tokens:', message.inputTokens || message.data?.inputTokens);
    console.log('Output Tokens:', message.outputTokens || message.data?.outputTokens);
```

### Issue: Input/Output Tokens stuck at 0
**Cause**: Token messages not being received or parsed incorrectly
**Solution**: Verify backend is sending token counts
**Debug**:
```javascript
// Monitor all WebSocket messages
const originalSend = WebSocket.prototype.send;
WebSocket.prototype.send = function(data) {
    console.log('WebSocket sent:', data);
    return originalSend.call(this, data);
};

// Monitor all WebSocket receives
// (requires intercepting message handler)
```

## Performance Debugging

### Check for unnecessary re-renders
1. Open React DevTools
2. Go to Profiler tab
3. Record a session
4. Look for `InsightPanel` component
5. Check if it's re-rendering too frequently

### Check for memory leaks
1. Open DevTools → Memory tab
2. Take heap snapshot
3. Start a session
4. Take another heap snapshot
5. Compare - should not see significant growth

## Backend Integration Debugging

### Verify backend is sending correct messages

**Expected metadata message**:
```json
{
  "type": "metadata",
  "data": {
    "detectedLanguage": "en-US",
    "languageConfidence": 0.95
  }
}
```

**Expected token usage message**:
```json
{
  "type": "usage",
  "data": {
    "inputTokens": 150,
    "outputTokens": 200
  }
}
```

Or:
```json
{
  "type": "token_usage",
  "inputTokens": 150,
  "outputTokens": 200
}
```

### Check backend logs
1. Look for language detection logs
2. Look for token counting logs
3. Look for WebSocket send logs
4. Verify message format matches expected structure

## Testing Checklist

- [ ] Session starts and duration begins incrementing
- [ ] Language updates from "Detecting..." to actual language within 5 seconds
- [ ] Sentiment percentage displays and updates
- [ ] Turns count increments with each message
- [ ] Cost displays with $ prefix and updates as tokens are used
- [ ] Input tokens increase as user sends messages
- [ ] Output tokens increase as assistant responds
- [ ] All values persist during session
- [ ] Values reset when new session starts

## Quick Test Script

Add this to browser console to test:

```javascript
// Check if session is initialized
console.log('Session ID:', window.__appState?.currentSession?.sessionId);
console.log('Start Time:', window.__appState?.currentSession?.startTime);
console.log('Duration:', window.__appState?.currentSession?.duration);
console.log('Input Tokens:', window.__appState?.currentSession?.inputTokens);
console.log('Output Tokens:', window.__appState?.currentSession?.outputTokens);
console.log('Language:', window.__appState?.currentSession?.detectedLanguage);
```

(Note: This requires exposing `__appState` in your app - add for debugging only)
