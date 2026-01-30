# Live Session Data - Final Fix Instructions

## Issue Found

The `formatCost` function was returning `$${cost.toFixed(3)}` which caused the double dollar sign `$$0.000`.

## Fix Applied

Changed `formatCost` in `frontend-v2/lib/hooks/useSessionStats.ts`:

```typescript
// BEFORE (Wrong)
const formatCost = (cost: number): string => {
    return `$${cost.toFixed(3)}`;
};

// AFTER (Fixed)
const formatCost = (cost: number): string => {
    return `${cost.toFixed(3)}`;
};
```

The dollar sign is now added in the display layer (`InsightPanel.tsx`): `${formatCost(cost)}`

## Why Other Fields Still Show Old Values

The frontend dev server is caching the old code. You need to:

1. **Stop the frontend service**
2. **Clear the cache**
3. **Rebuild**
4. **Restart**

## Quick Fix (Copy & Paste)

```bash
# Kill frontend
pkill -f "next dev" || pkill -f "node.*frontend" || true

# Clear cache
rm -rf frontend-v2/.next frontend-v2/dist frontend-v2/node_modules/.cache

# Rebuild
cd frontend-v2 && npm run build

# Restart (in background)
npm run dev &

# Or restart all services
cd .. && ./start-all-services.sh
```

## Or Use the Script

```bash
chmod +x RESTART_FRONTEND.sh
./RESTART_FRONTEND.sh
```

## What Should Work After Restart

1. **Cost Display**: `$0.000` (not `$$0.000`)
2. **Session Duration**: Should increment every second (00:00 → 00:01 → 00:02...)
3. **Language**: Should update from "Detecting..." to actual language
4. **Tokens**: Should increase as messages are sent/received

## Verification Steps

1. Open http://localhost:3000
2. Open DevTools Console (F12)
3. Look for these logs:
   ```
   [Session] Started: {sessionId}
   [useSessionStats] Timer started at: {timestamp}
   [Session] Language detected: {language}
   [Session] Token usage: { inputTokens, outputTokens }
   ```

4. Verify in UI:
   - Duration increments every second
   - Language updates within 5-10 seconds
   - Cost shows with single $ prefix
   - Tokens increase as you interact

## Files Modified

### Live Session Data Fixes
1. `frontend-v2/lib/hooks/useSessionStats.ts` - Fixed formatCost, enhanced timer
2. `frontend-v2/app/page.tsx` - Enhanced message handlers
3. `frontend-v2/components/layout/InsightPanel.tsx` - Improved display logic

### Build Fixes
1. `frontend-v2/app/api/agents/[id]/route.ts` - Next.js 16 compatibility
2. `frontend-v2/app/api/history/[id]/route.ts` - Next.js 16 compatibility
3. `frontend-v2/app/api/workflow/[id]/route.ts` - Next.js 16 compatibility
4. `frontend-v2/app/api/personas/[id]/route.ts` - Next.js 16 compatibility

## Status

✅ **Code fixes**: Complete
✅ **Build**: Successful
⏳ **Frontend restart**: Required
⏳ **Testing**: Pending

## Next Steps

1. **Restart frontend** using one of the methods above
2. **Test in browser** at http://localhost:3000
3. **Monitor console** for logs
4. **Verify all fields** are working

## If Issues Persist

### Session Duration Still 00:00
- Check if session started (look for `[Session] Started:` log)
- Check if `connectionStatus` is "connected"
- Verify `startTime` is set
- Try refreshing the page

### Language Still "Detecting..."
- Check Network tab for metadata messages
- Check backend logs: `tail -f logs/agent-triage.log`
- Wait 5-10 seconds for detection
- Try speaking in a different language

### Tokens Still 0
- Check Network tab for usage messages
- Send more messages to trigger token counting
- Check backend logs for token counting
- Verify responses are being generated

### Cost Still Shows $$
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R)
- Restart frontend service

## Support

For detailed debugging: See `QUICK_DEBUG_LIVE_SESSION.md`
For architecture details: See `LIVE_SESSION_DATA_VISUAL_GUIDE.md`
For technical details: See `LIVE_SESSION_DATA_CHANGES_SUMMARY.md`

---

**Status**: Ready for restart and testing
**Last Updated**: January 30, 2026
