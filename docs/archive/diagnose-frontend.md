# Frontend Diagnosis - Voice Not Working

## Problem Summary
The backend is working perfectly:
- ✅ Agent receives audio input
- ✅ Agent generates text response: "Hello! I can help you with your banking needs. How can I assist you today?"
- ✅ Agent sends audio output (multiple audioOutput events)
- ✅ Gateway forwards all events to frontend (transcript, audio, usage)

**BUT** you're not seeing/hearing anything in the browser.

## Root Cause
This is a **frontend issue** - the browser is not:
1. Displaying the transcript text, OR
2. Playing the audio response, OR
3. Updating the token counter

## Diagnostic Steps

### 1. Open Browser Console (CRITICAL)
Press **F12** to open Developer Tools, then:

1. **Check Console Tab** for errors:
   - Look for red error messages
   - Look for WebSocket errors
   - Look for Audio context errors
   - Screenshot any errors you see

2. **Check Network Tab**:
   - Filter by "WS" (WebSocket)
   - Click on the WebSocket connection
   - Go to "Messages" tab
   - You should see messages being received
   - Screenshot this

### 2. Check What You See in UI

**Connection Status:**
- What does the connection indicator show?
- Is there a "Connected" badge/text?

**Transcript Area:**
- Is there a chat/transcript area?
- Does it show your input: "let's see if this works this time, shall we? hello..."?
- Does it show the agent response: "Hello! I can help you with your banking needs..."?

**Token Counter:**
- Is there a token counter visible?
- Does it show any numbers?
- Expected: Input: 2615, Output: 169

**Audio Indicator:**
- Is there any visual indicator that audio is playing?
- Waveform, speaker icon, etc.?

### 3. Check Audio Playback

**Test if audio is working:**
1. Check your system volume (not muted)
2. Check browser tab is not muted (look for 🔇 icon on tab)
3. Try playing a YouTube video in another tab to verify audio works

**Browser Audio Context:**
In the browser console, run:
```javascript
// Check if audio context exists
console.log('Audio context:', window.audioContext);
console.log('Audio context state:', window.audioContext?.state);
```

If state is "suspended", run:
```javascript
window.audioContext?.resume();
```

### 4. Check WebSocket Messages

In browser console, run:
```javascript
// This will log all incoming WebSocket messages
const originalOnMessage = WebSocket.prototype.onmessage;
WebSocket.prototype.onmessage = function(event) {
  console.log('📨 WebSocket message:', event.data);
  if (originalOnMessage) originalOnMessage.call(this, event);
};
```

Then speak again and watch the console.

### 5. Frontend Environment Check

The frontend might not be configured correctly. Check:

```bash
# Check frontend environment
docker-compose -f docker-compose-unified.yml exec frontend env | grep NEXT_PUBLIC
```

Expected output:
```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

### 6. Try Hard Refresh

Sometimes the frontend has cached old code:

1. Open the page (http://localhost:3000)
2. Press **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac)
3. This does a hard refresh, clearing cache

### 7. Check Frontend Code

The frontend might have a bug in the WebSocket message handler. Let me check:

```bash
# Search for WebSocket message handling
docker-compose -f docker-compose-unified.yml exec frontend find /app -name "*.tsx" -o -name "*.ts" | head -20
```

## Most Likely Issues

### Issue 1: Audio Context Suspended (MOST COMMON)
**Symptoms:** Backend works, no audio plays
**Cause:** Browser autoplay policy blocks audio until user interaction
**Fix:** Click anywhere on the page, then try again

### Issue 2: WebSocket Message Handler Bug
**Symptoms:** Messages received but not processed
**Cause:** Frontend code not handling transcript/audio events
**Fix:** Need to check frontend code

### Issue 3: UI Not Updating
**Symptoms:** Audio plays but transcript doesn't show
**Cause:** React state not updating
**Fix:** Check browser console for React errors

### Issue 4: Wrong WebSocket URL
**Symptoms:** Connection works but messages not received
**Cause:** Frontend connecting to wrong endpoint
**Fix:** Check NEXT_PUBLIC_WS_URL environment variable

## Quick Fixes to Try

### Fix 1: Restart Frontend
```bash
docker-compose -f docker-compose-unified.yml restart frontend
```

Wait 30 seconds, then refresh browser (Ctrl+Shift+R)

### Fix 2: Clear Browser Data
1. Open DevTools (F12)
2. Go to Application tab
3. Click "Clear storage"
4. Click "Clear site data"
5. Refresh page

### Fix 3: Try Different Browser
- Chrome (recommended)
- Firefox
- Edge

### Fix 4: Check Browser Console
This is the MOST IMPORTANT step. The console will tell us exactly what's wrong.

## What I Need From You

Please provide:

1. **Screenshot of browser console** (F12 → Console tab)
   - Include any red errors
   - Include the last 20-30 lines

2. **Screenshot of Network tab** (F12 → Network → WS filter)
   - Show the WebSocket connection
   - Show the Messages tab

3. **Screenshot of the UI**
   - Show what you see on screen
   - Show connection status
   - Show if there's a transcript area

4. **Run this in console and paste output:**
```javascript
console.log('Audio context:', window.audioContext?.state);
console.log('WebSocket:', window.ws?.readyState);
console.log('Location:', window.location.href);
```

## Backend is Working!

Just to confirm - the backend is 100% working:
- ✅ Received your audio
- ✅ Transcribed: "let's see if this works this time, shall we? hello..."
- ✅ Generated response: "Hello! I can help you with your banking needs. How can I assist you today?"
- ✅ Sent audio output (11 audio chunks)
- ✅ Gateway forwarded everything to frontend
- ✅ Token usage: 2615 input, 169 output

The issue is purely on the frontend/browser side.
