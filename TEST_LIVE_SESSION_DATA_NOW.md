# Test Live Session Data Interface - Complete Guide

## Quick Start

1. **Open http://localhost:3000** in your browser
2. **Check the right panel** for "Live Session Data"
3. **Click the microphone button** to start recording
4. **Say something** like "Hello" or "Check my balance"
5. **Watch the Live Session Data panel update**

## What Should Work Now

### ✅ Session Duration
- **Before**: Showed `00:00` and never incremented
- **After**: Should increment every second (e.g., `00:01`, `00:02`, etc.)
- **Why**: Session is no longer being set to null, so the timer can run

### ✅ Language Detection
- **Before**: Showed "Detecting..." and never updated
- **After**: Should update to actual language (e.g., "English", "Spanish")
- **Why**: Session data now persists through message additions

### ✅ Cost
- **Before**: Showed `$$0.000` (double dollar sign)
- **After**: Should show `$0.000` (single dollar sign)
- **Why**: Fixed dependency array issue that was causing session loss

### ✅ Input/Output Tokens
- **Before**: Showed `0` and never updated
- **After**: Should update as tokens are counted (e.g., `150`, `320`)
- **Why**: Session stats now persist and update correctly

### ✅ Sentiment
- **Before**: Working (was not affected)
- **After**: Should continue working (0-100%)

### ✅ Turns
- **Before**: Working (was not affected)
- **After**: Should continue working (message count)

## Detailed Testing Steps

### Test 1: Session Duration Timer
1. Open browser DevTools (F12)
2. Go to Console tab
3. Click microphone to start recording
4. Watch the "Session Duration" field in Live Session Data panel
5. **Expected**: Should show `00:01`, `00:02`, `00:03`, etc. incrementing every second
6. **Check Console**: Should see `[useSessionStats] Timer started at: <timestamp>`

### Test 2: Language Detection
1. Open browser DevTools (F12)
2. Go to Console tab
3. Click microphone and say something in English
4. Watch the "Language" field in Live Session Data panel
5. **Expected**: Should change from "Detecting..." to "English" (or detected language)
6. **Check Console**: Should see `[Session] Language detected: English Confidence: 0.95`

### Test 3: Cost Display
1. Open browser DevTools (F12)
2. Go to Console tab
3. Click microphone and say something
4. Watch the "Cost" field in Live Session Data panel
5. **Expected**: Should show `$0.000` (single dollar sign, not `$$`)
6. **Check Console**: Should see token usage messages

### Test 4: Token Counting
1. Open browser DevTools (F12)
2. Go to Console tab
3. Click microphone and say something
4. Watch "Input Tokens" and "Output Tokens" fields
5. **Expected**: Should update from `0` to actual counts (e.g., `150`, `320`)
6. **Check Console**: Should see `[Session] Token usage: { inputTokens: 150, outputTokens: 320 }`

### Test 5: Full Conversation Flow
1. Open http://localhost:3000
2. Click microphone
3. Say: "I want to check my balance"
4. Wait for response
5. **Observe all fields**:
   - Duration: Incrementing ✓
   - Language: Shows detected language ✓
   - Sentiment: Shows percentage ✓
   - Turns: Shows message count ✓
   - Cost: Shows `$X.XXX` ✓
   - Input Tokens: Shows count ✓
   - Output Tokens: Shows count ✓

## Console Logs to Look For

### Good Signs (Session Working)
```
[AppContext] Setting current session: <sessionId>
[useSessionStats] Timer started at: 2026-01-30T...
[Session] Language detected: English Confidence: 0.95
[Session] Token usage: { inputTokens: 150, outputTokens: 320 }
[WebSocket] Received message: token_usage
```

### Bad Signs (Session Broken)
```
[AppContext] Setting current session: null  ← Repeated many times
[useSessionStats] Timer started at: ... (but duration stays 00:00)
[Session] Language detected: ... (but Language field stays "Detecting...")
```

## Troubleshooting

### Issue: Duration still shows 00:00
**Cause**: Session is null or timer didn't start
**Fix**: 
1. Check console for `[AppContext] Setting current session: null` repeated
2. If fixed, should see `[useSessionStats] Timer started at:` once
3. Restart frontend: `npm run dev` in `frontend-v2/`

### Issue: Cost shows $$0.000
**Cause**: formatCost function returning `$` prefix
**Fix**: Already fixed in code, restart frontend to pick up changes

### Issue: Language stays "Detecting..."
**Cause**: Session data not persisting
**Fix**: Should be fixed by removing `currentSession` from dependency array
**Verify**: Check console for `[Session] Language detected:` message

### Issue: Tokens stay 0
**Cause**: Session stats not updating
**Fix**: Should be fixed by session persistence fix
**Verify**: Check console for `[Session] Token usage:` message

## Performance Notes

- Timer updates every 1 second (not every render)
- Session stats update only when WebSocket messages arrive
- No unnecessary re-renders due to fixed dependency arrays
- All state updates are batched by React

## Browser Compatibility

- Chrome/Edge: ✅ Fully supported
- Firefox: ✅ Fully supported
- Safari: ✅ Fully supported
- Mobile browsers: ✅ Fully supported (responsive design)

## Next Steps After Testing

If all tests pass:
1. ✅ Session Duration increments
2. ✅ Language updates from "Detecting..."
3. ✅ Cost shows single `$`
4. ✅ Tokens update from 0
5. ✅ Sentiment and Turns work

Then the Live Session Data interface is fully fixed!

If any test fails:
1. Check browser console for error messages
2. Check backend logs for WebSocket issues
3. Verify services are running: `./start-all-services.sh`
4. Restart frontend: `npm run dev` in `frontend-v2/`
