# 🚨 TWO ACTIVE ISSUES

## Issue 1: Live Session Data Not Updating ⏱️
**Status:** Debug logging added, ready to test  
**Files Modified:**
- `frontend-v2/app/page.tsx` - Added debug logs to token_usage handler
- `frontend-v2/lib/context/AppContext.tsx` - Added debug logs to updateSessionStats

**Next Step:** Test and check console logs

---

## Issue 2: Feedback Missing sessionId/traceId 👍👎
**Status:** Needs fix  
**Error:**
```
[Server] Received feedback request body: {"score":1,"name":"user-feedback"}
[Server] Feedback Debug: sessionId=undefined, traceId=undefined
```

**Root Cause:** Frontend-v2 feedback handler not sending `sessionId` and `traceId`

**Location:** `frontend-v2/app/page.tsx` - `onSendFeedback` function (around line 539-558)

**Expected Payload:**
```json
{
  "sessionId": "abc-123-def",
  "traceId": "abc-123-def",
  "score": 1,
  "name": "user-feedback",
  "comment": "Optional comment"
}
```

**Current Payload (WRONG):**
```json
{
  "score": 1,
  "name": "user-feedback"
}
```

---

## Plan

1. **First:** Test Live Session Data with debug logs
2. **Then:** Fix feedback payload to include `sessionId` and `traceId`

Both issues are in `frontend-v2/app/page.tsx` and can be fixed together.
