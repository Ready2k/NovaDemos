# Debug Text Chat Issue

## Current Status
- ✅ Frontend code updated to send `type: 'user_input'`
- ✅ Agent code updated to echo transcript
- ✅ Agent rebuilt and restarted
- ❌ User text still not showing on screen

## Debugging Steps

### 1. Hard Refresh Browser
The browser may have cached the old JavaScript. Try:
- **Chrome/Edge:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- **Firefox:** Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
- Or: Open DevTools → Network tab → Check "Disable cache" → Refresh

### 2. Check Browser Console
Open DevTools (F12) and look for these logs when you type a message:

**Expected logs:**
```
[App] handleSendMessage called with: what's my balance
[App] isConnected: true
[App] WebSocket readyState: 1
[App] Sending message to WebSocket
[App] Message payload: {"type":"user_input","text":"what's my balance"}
[App] Message sent
```

**If you see:**
- `type: 'textInput'` → Browser hasn't reloaded new code (hard refresh needed)
- `isConnected: false` → WebSocket not connected
- `readyState: 0 or 2 or 3` → WebSocket not open

### 3. Check WebSocket Messages
In DevTools:
1. Go to **Network** tab
2. Filter by **WS** (WebSocket)
3. Click on the WebSocket connection
4. Go to **Messages** tab
5. Type a message and watch for:
   - Outgoing: `{"type":"user_input","text":"what's my balance"}`
   - Incoming: `{"type":"transcript","role":"user","transcript":"what's my balance"}`

### 4. Check Gateway Logs
```bash
# Watch for incoming messages
tail -f logs/gateway.log | grep -E "user_input|Forward"
```

Expected output when you send a message:
```
[Gateway] Forwarding user_input to agent
```

### 5. Check Agent Logs
```bash
# Watch for text input
tail -f logs/agent.log | grep -E "Text input|transcript"
```

Expected output:
```
[Agent:triage] Text input: what's my balance
```

## Common Issues

### Issue 1: Browser Cache
**Symptom:** Console shows `type: 'textInput'` instead of `type: 'user_input'`
**Solution:** Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Issue 2: WebSocket Not Connected
**Symptom:** `isConnected: false` in console
**Solution:** 
1. Check if services are running: `ps aux | grep -E "gateway|agent"`
2. Restart services: `./start-all-services.sh`

### Issue 3: Message Not Reaching Agent
**Symptom:** Gateway logs show message but agent doesn't
**Solution:** Check agent is registered:
```bash
curl http://localhost:8080/health | jq '.agents'
# Should show: 1
```

### Issue 4: Transcript Not Displaying
**Symptom:** Message reaches agent but doesn't show in UI
**Solution:** Check frontend WebSocket message handler in DevTools console

## Quick Test

### Test 1: Check Frontend Code
```bash
grep "type: 'user_input'" frontend-v2/app/page.tsx
```
Should show: `type: 'user_input',  // Changed from 'textInput'`

### Test 2: Check Agent Code
```bash
grep -A 5 "Echo the user's message" agents/src/agent-runtime-s2s.ts
```
Should show the transcript echo code

### Test 3: Verify Services Running
```bash
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:3000
```
All should respond

## Manual Test via curl

Test the agent directly:
```bash
# Start a WebSocket connection (requires wscat)
npm install -g wscat
wscat -c ws://localhost:8081/session

# Send session init
{"type":"session_init","sessionId":"test-123"}

# Send text message
{"type":"user_input","text":"hello"}

# You should see transcript echo back
```

## If Still Not Working

1. **Check browser console** for the exact message being sent
2. **Check Gateway logs** to see if message is received
3. **Check Agent logs** to see if message is processed
4. **Share the console output** from all three places

The issue is likely:
- Browser cache (most common) → Hard refresh
- WebSocket not connected → Restart services
- Message format mismatch → Check console logs
