# Quick Debug Guide - Live Session Data

## Issue 1: Session Duration Not Incrementing

### Quick Check
```javascript
// Open DevTools Console and paste:
console.log('Session ID:', window.__appState?.currentSession?.sessionId);
console.log('Start Time:', window.__appState?.currentSession?.startTime);
console.log('Connection Status:', window.__appState?.connectionStatus);
```

### Expected Output
```
Session ID: abc123def456
Start Time: 2024-01-30T12:00:00.000Z
Connection Status: connected
```

### If Session ID is missing
- Session hasn't started yet
- Wait for "Hello" message from agent
- Check if `session_start` message was received

### If Start Time is missing
- Session started but startTime not set
- Check backend is sending timestamp in session_start message

### If Connection Status is not "connected"
- WebSocket not connected
- Check Network tab for WebSocket connection
- Verify gateway is running on port 8080

### Console Logs to Look For
```
[Session] Started: abc123def456
[useSessionStats] Timer started at: 2024-01-30T12:00:00.000Z
[useSessionStats] Initial duration: 0
```

---

## Issue 2: Language Showing "Detecting..."

### Quick Check
```javascript
// Open DevTools Console and paste:
console.log('Detected Language:', window.__appState?.currentSession?.detectedLanguage);
console.log('Language Confidence:', window.__appState?.currentSession?.languageConfidence);
```

### Expected Output
```
Detected Language: en-US
Language Confidence: 0.95
```

### If Both Are Undefined
- Language detection hasn't occurred yet
- Wait 5-10 seconds for detection
- Check Network tab for metadata messages

### Network Tab Check
1. Open DevTools → Network tab
2. Filter for WebSocket
3. Click on WebSocket connection
4. Go to Messages tab
5. Look for message with type: `metadata`
6. Should contain: `detectedLanguage` and `languageConfidence`

### Expected Metadata Message
```json
{
  "type": "metadata",
  "data": {
    "detectedLanguage": "en-US",
    "languageConfidence": 0.95
  }
}
```

### If Metadata Message Not Present
- Backend not sending language detection
- Check backend logs: `tail -f logs/agent-triage.log`
- Look for language detection logs
- Verify audio is being processed

### Console Logs to Look For
```
[Session] Language detected: en-US Confidence: 0.95
```

---

## Issue 3: Cost Showing $0.000

### Quick Check
```javascript
// Open DevTools Console and paste:
console.log('Input Tokens:', window.__appState?.currentSession?.inputTokens);
console.log('Output Tokens:', window.__appState?.currentSession?.outputTokens);
console.log('Brain Mode:', window.__appState?.settings?.brainMode);
```

### Expected Output
```
Input Tokens: 150
Output Tokens: 200
Brain Mode: raw_nova
```

### If Tokens Are 0
- Tokens not being captured
- Check Network tab for usage messages
- Send more messages to trigger token counting

### If Brain Mode is Wrong
- Settings not loaded correctly
- Check if settings were saved
- Try changing brain mode in settings

### Cost Calculation
```
Cost = (inputTokens / 1000) * inputCost + (outputTokens / 1000) * outputCost

For raw_nova:
- inputCost: $0.003 per 1000 tokens
- outputCost: $0.015 per 1000 tokens

Example:
- 150 input tokens: (150/1000) * 0.003 = $0.00045
- 200 output tokens: (200/1000) * 0.015 = $0.003
- Total: $0.00345 ≈ $0.003
```

### Network Tab Check
1. Open DevTools → Network tab
2. Filter for WebSocket
3. Click on WebSocket connection
4. Go to Messages tab
5. Look for message with type: `usage` or `token_usage`
6. Should contain: `inputTokens` and `outputTokens`

### Expected Usage Message
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

### If Usage Message Not Present
- Backend not sending token counts
- Check backend logs: `tail -f logs/agent-triage.log`
- Look for token counting logs
- Verify responses are being generated

### Console Logs to Look For
```
[Session] Token usage: { inputTokens: 150, outputTokens: 200 }
```

---

## Issue 4: Input/Output Tokens at 0

### Same as Issue 3
See "Issue 3: Cost Showing $0.000" above

---

## Complete Debug Checklist

### Step 1: Verify Session Started
- [ ] Session ID exists
- [ ] Start Time is set
- [ ] Connection Status is "connected"
- [ ] Console shows: `[Session] Started:`

### Step 2: Verify Timer Started
- [ ] Duration is incrementing
- [ ] Console shows: `[useSessionStats] Timer started at:`
- [ ] Console shows: `[useSessionStats] Initial duration:`

### Step 3: Verify Language Detection
- [ ] Language is not "Detecting..."
- [ ] Language Confidence is set
- [ ] Network shows metadata message
- [ ] Console shows: `[Session] Language detected:`

### Step 4: Verify Token Counting
- [ ] Input Tokens > 0
- [ ] Output Tokens > 0
- [ ] Cost > $0.000
- [ ] Network shows usage message
- [ ] Console shows: `[Session] Token usage:`

### Step 5: Verify Display
- [ ] Duration shows MM:SS format
- [ ] Language shows language code (e.g., en-US)
- [ ] Cost shows $X.XXX format
- [ ] Tokens show with commas (e.g., 1,000)

---

## Common Issues & Solutions

### Issue: "Session Duration: 00:00"
**Solution**:
1. Check if session started (look for session_start message)
2. Check if startTime is set
3. Check if connectionStatus is "connected"
4. Refresh page and try again

### Issue: "Language: Detecting..."
**Solution**:
1. Wait 5-10 seconds for detection
2. Check Network tab for metadata messages
3. Check backend logs for language detection
4. Try speaking in a different language

### Issue: "Cost: $0.000"
**Solution**:
1. Send more messages to generate tokens
2. Check Network tab for usage messages
3. Check backend logs for token counting
4. Verify brain mode is set correctly

### Issue: "Tokens: 0"
**Solution**:
1. Send more messages to generate tokens
2. Check Network tab for usage messages
3. Check backend logs for token counting
4. Wait for responses to be generated

---

## Backend Logs to Check

### Triage Agent
```bash
tail -f logs/agent-triage.log
```
Look for:
- Language detection logs
- Token counting logs
- Message processing logs

### Gateway
```bash
tail -f logs/gateway.log
```
Look for:
- WebSocket messages
- Message routing
- Error messages

### Local Tools
```bash
tail -f logs/local-tools.log
```
Look for:
- Tool execution logs
- Error messages

---

## Network Messages to Monitor

### Session Start
```json
{
  "type": "session_start",
  "sessionId": "abc123",
  "timestamp": "2024-01-30T12:00:00.000Z"
}
```

### Metadata (Language Detection)
```json
{
  "type": "metadata",
  "data": {
    "detectedLanguage": "en-US",
    "languageConfidence": 0.95
  }
}
```

### Usage (Token Counting)
```json
{
  "type": "usage",
  "data": {
    "inputTokens": 150,
    "outputTokens": 200
  }
}
```

---

## Quick Test Commands

### Test Session Duration
```javascript
// Should increment every second
setInterval(() => {
  console.log('Duration:', window.__appState?.currentSession?.duration);
}, 1000);
```

### Test Language Detection
```javascript
// Should update when language is detected
setInterval(() => {
  console.log('Language:', window.__appState?.currentSession?.detectedLanguage);
}, 1000);
```

### Test Token Counting
```javascript
// Should update when tokens are used
setInterval(() => {
  console.log('Tokens:', {
    input: window.__appState?.currentSession?.inputTokens,
    output: window.__appState?.currentSession?.outputTokens
  });
}, 1000);
```

---

## Still Having Issues?

1. Check all console logs
2. Check Network tab for WebSocket messages
3. Check backend logs
4. Verify all services are running
5. Try refreshing the page
6. Try restarting services: `./start-all-services.sh`
