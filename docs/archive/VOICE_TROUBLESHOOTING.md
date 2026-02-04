# Voice Interaction Troubleshooting Guide

## Issue: "Said hello and nothing happens"

### Root Cause
The agent is receiving the connection but **no audio data** is being sent from the frontend. The error in logs shows:
```
[SonicClient] CRITICAL ERROR processing output stream: { message: 'Timed out waiting for input events' }
```

This means the SonicClient is waiting for audio input but not receiving any.

## Diagnostic Steps

### 1. Check Browser Console
Open your browser's Developer Tools (F12) and check the Console tab for errors:

**Look for:**
- ❌ Microphone permission denied errors
- ❌ WebSocket connection errors
- ❌ Audio context errors
- ✅ "WebSocket connected" messages
- ✅ "Microphone access granted" messages

### 2. Check Microphone Permissions

**Chrome/Edge:**
1. Click the lock icon in the address bar
2. Check if "Microphone" is set to "Allow"
3. If blocked, change to "Allow" and refresh the page

**Firefox:**
1. Click the lock icon in the address bar
2. Check "Permissions" → "Use the Microphone"
3. If blocked, change to "Allow" and refresh

**Safari:**
1. Safari → Settings → Websites → Microphone
2. Find localhost:3000 and set to "Allow"

### 3. Check Frontend UI State

**Connection Status:**
- ✅ Should show "Connected" or similar status
- ❌ If showing "Disconnected", click "Connect" button

**Microphone Button:**
- 🎤 Should have a microphone button/icon
- 🔴 When recording, should show visual indicator (red dot, pulsing, etc.)
- 📊 Should show audio waveform or level indicator when speaking

**Mode Selection:**
- Check if you're in "Voice Only" or "Chat + Voice" mode
- "Chat Only" mode won't send audio

### 4. Test Audio Input

**Browser Test:**
1. Open a new tab
2. Go to: https://www.onlinemictest.com/
3. Click "Allow" for microphone
4. Speak and verify you see audio levels

If this doesn't work, your microphone isn't working in the browser.

### 5. Check WebSocket Connection

**In Browser Console, run:**
```javascript
// Check if WebSocket is connected
console.log('WebSocket state:', window.ws?.readyState);
// 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
```

**Expected:** Should show `1` (OPEN)

### 6. Check Audio Stream

**In Browser Console, run:**
```javascript
// Check if audio stream is active
console.log('Audio stream:', window.audioStream);
console.log('Audio tracks:', window.audioStream?.getAudioTracks());
```

**Expected:** Should show MediaStream with active audio tracks

## Common Issues & Solutions

### Issue 1: Microphone Permission Denied
**Symptoms:**
- No audio being sent
- Browser shows blocked microphone icon
- Console error: "Permission denied"

**Solution:**
1. Click the blocked microphone icon in address bar
2. Change to "Allow"
3. Refresh the page
4. Click "Connect" again

### Issue 2: Wrong Audio Input Device
**Symptoms:**
- Permission granted but no audio detected
- Audio levels show zero

**Solution:**
1. Check browser settings → Privacy → Microphone
2. Verify correct microphone is selected
3. Test with system sound settings
4. Try a different browser

### Issue 3: HTTPS Required
**Symptoms:**
- Microphone access blocked
- Error: "getUserMedia requires HTTPS"

**Solution:**
- For localhost, HTTP should work
- For remote access, use HTTPS or SSH tunnel

### Issue 4: WebSocket Not Connected
**Symptoms:**
- UI shows "Disconnected"
- No response when speaking

**Solution:**
1. Check Gateway is running: `docker-compose -f docker-compose-unified.yml ps gateway`
2. Check Gateway logs: `docker-compose -f docker-compose-unified.yml logs gateway`
3. Verify port 8080 is accessible: `curl http://localhost:8080/health`
4. Click "Connect" button in UI

### Issue 5: Audio Context Suspended
**Symptoms:**
- Connection works but no audio processing
- Console warning: "AudioContext was not allowed to start"

**Solution:**
1. Click anywhere on the page to activate audio context
2. Refresh and try again
3. Check browser autoplay policies

## Testing Procedure

### Step-by-Step Test

1. **Open Frontend**
   ```bash
   open http://localhost:3000
   ```

2. **Open Browser Console** (F12)

3. **Click "Connect"**
   - Should see "Connected" status
   - Console should show: "WebSocket connected"

4. **Grant Microphone Permission**
   - Browser will prompt for permission
   - Click "Allow"
   - Console should show: "Microphone access granted"

5. **Click Microphone Button** (if needed)
   - Some UIs require clicking to start recording
   - Look for 🎤 icon or "Start Recording" button

6. **Speak Clearly**
   - Say "Hello" or "Hi there"
   - Watch for visual feedback (waveform, levels)
   - Should see audio being sent in console

7. **Wait for Response**
   - Agent should respond within 2-3 seconds
   - Should hear audio response
   - Should see transcript in UI

## Verification Commands

### Check Services Are Running
```bash
docker-compose -f docker-compose-unified.yml ps
```

**Expected:** All services should show "Up" and "healthy"

### Check Gateway Logs
```bash
docker-compose -f docker-compose-unified.yml logs --tail=50 gateway
```

**Look for:**
- ✅ "New WebSocket connection"
- ✅ "Connected to agent: triage"
- ❌ No "error" messages

### Check Agent Logs
```bash
docker-compose -f docker-compose-unified.yml logs --tail=50 agent-triage
```

**Look for:**
- ✅ "Started successfully"
- ✅ "Loaded dialect detection prompt"
- ❌ "Timed out waiting for input events" = No audio received

### Monitor Real-Time
```bash
# Watch Gateway
docker-compose -f docker-compose-unified.yml logs -f gateway

# In another terminal, watch Agent
docker-compose -f docker-compose-unified.yml logs -f agent-triage
```

**When you speak, you should see:**
- Gateway: Messages being forwarded
- Agent: Audio input events, transcription, responses

## Frontend Configuration

### Check Environment Variables
```bash
docker-compose -f docker-compose-unified.yml exec frontend env | grep NEXT_PUBLIC
```

**Expected:**
```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

### Restart Frontend (if needed)
```bash
docker-compose -f docker-compose-unified.yml restart frontend
```

## Quick Fixes

### Fix 1: Restart Everything
```bash
docker-compose -f docker-compose-unified.yml restart
```

### Fix 2: Clear Browser Cache
1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

### Fix 3: Try Different Browser
- Chrome/Edge (recommended)
- Firefox
- Safari (may have stricter permissions)

### Fix 4: Check Microphone in System
**macOS:**
```bash
# Check microphone permissions
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
```

**Linux:**
```bash
# Test microphone
arecord -d 5 test.wav && aplay test.wav
```

## Expected Behavior

### Successful Voice Interaction

1. **Connect:** Click "Connect" → See "Connected" status
2. **Permission:** Browser prompts → Click "Allow"
3. **Speak:** Say "Hello" → See waveform/levels
4. **Processing:** See "Listening..." or similar indicator
5. **Response:** Hear agent voice + see transcript
6. **Tokens:** See token count update in UI

### What You Should See in Logs

**Gateway:**
```
[Gateway] New WebSocket connection: xxx
[Gateway] Connected to agent: triage
[Gateway] Forwarding audio to agent
[Gateway] Received from agent: transcript
[Gateway] Received from agent: audio
```

**Agent:**
```
[SonicClient] Received audio input
[SonicClient] Transcript: "hello"
[SonicClient] Generating response
[SonicClient] Sending audio output
```

## Still Not Working?

### Collect Debug Info

1. **Browser Console Output:**
   - Copy all console messages
   - Include any errors (red text)

2. **Gateway Logs:**
   ```bash
   docker-compose -f docker-compose-unified.yml logs --tail=100 gateway > gateway.log
   ```

3. **Agent Logs:**
   ```bash
   docker-compose -f docker-compose-unified.yml logs --tail=100 agent-triage > agent.log
   ```

4. **Browser Info:**
   - Browser name and version
   - Operating system
   - Microphone device name

5. **Network Tab:**
   - Open DevTools → Network tab
   - Filter by "WS" (WebSocket)
   - Check WebSocket frames being sent/received

### Report Issue

Include:
- What you did (step by step)
- What you expected to happen
- What actually happened
- Browser console errors
- Gateway and agent logs
- Screenshots of UI state

---

## Quick Checklist

Before asking for help, verify:

- [ ] All Docker services are running and healthy
- [ ] Frontend is accessible at http://localhost:3000
- [ ] Browser console shows no errors
- [ ] Microphone permission is granted
- [ ] Correct microphone is selected in browser
- [ ] Microphone works in other apps/websites
- [ ] WebSocket shows "Connected" status
- [ ] You clicked the microphone button (if present)
- [ ] You spoke clearly and loudly enough
- [ ] Audio levels/waveform shows activity when speaking

If all checked and still not working, collect debug info above.
