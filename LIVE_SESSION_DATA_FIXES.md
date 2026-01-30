# Live Session Data Interface Fixes

## Issues Fixed

### 1. Session Duration: 00:00 (not working)
**Problem**: Duration was not updating because the `startTime` was being recalculated on every render.

**Solution**: 
- Added `startTimeRef` to store the initial start time persistently
- Removed `currentSession?.startTime` from dependency array to prevent re-initialization
- Now only depends on `sessionId` and `connectionStatus`

**File**: `frontend-v2/lib/hooks/useSessionStats.ts`

### 2. Language: Detecting... (not working)
**Problem**: Language detection message wasn't being properly captured from the backend.

**Solution**:
- Enhanced message handler to check multiple possible locations for language data
- Added fallback checks for both `message.data?.detectedLanguage` and `message.detectedLanguage`
- Added console logging to debug language detection flow
- Improved condition to only show "Detecting..." when language is actually not set

**File**: `frontend-v2/app/page.tsx` (metadata case handler)
**File**: `frontend-v2/components/layout/InsightPanel.tsx` (display logic)

### 3. Cost: $0.000 (not working)
**Problem**: Cost was displaying but without proper formatting and dollar sign.

**Solution**:
- Added dollar sign prefix to cost display
- Ensured cost calculation uses proper token counts from session state
- Cost now displays as `$X.XXX` format

**File**: `frontend-v2/components/layout/InsightPanel.tsx`

### 4. Input Tokens: 0 (not working)
**Problem**: Token counts weren't being properly captured from WebSocket messages.

**Solution**:
- Enhanced token usage message handlers to check multiple possible data locations
- Added support for both `usage` and `token_usage` message types
- Added fallback checks for `totalInputTokens`, `inputTokens`, etc.
- Added console logging for debugging token updates

**File**: `frontend-v2/app/page.tsx` (usage and token_usage case handlers)

### 5. Output Tokens: 0 (not working)
**Problem**: Same as Input Tokens - not being properly captured.

**Solution**: Same as Input Tokens fix above.

## Testing Checklist

- [ ] Start a new session and verify Session Duration increments every second
- [ ] Speak in different languages and verify Language field updates (not stuck on "Detecting...")
- [ ] Verify Sentiment percentage displays correctly (should be working)
- [ ] Verify Turns count increments with each message (should be working)
- [ ] Verify Cost displays with $ prefix and updates as tokens are used
- [ ] Verify Input Tokens count increases as user sends messages
- [ ] Verify Output Tokens count increases as assistant responds

## Console Logging

The following console logs have been added for debugging:

```
[Session] Language detected: {language} Confidence: {confidence}
[Session] Token usage: { inputTokens, outputTokens }
[Session] Token usage (token_usage): { inputTokens, outputTokens }
```

Monitor these logs to verify data is being received from the backend.

## Backend Integration Points

The frontend expects the following WebSocket messages from the backend:

1. **Metadata Message** (for language detection):
```json
{
  "type": "metadata",
  "data": {
    "detectedLanguage": "en-US",
    "languageConfidence": 0.95
  }
}
```

2. **Usage Message** (for token counts):
```json
{
  "type": "usage",
  "data": {
    "inputTokens": 150,
    "outputTokens": 200
  }
}
```

Or alternatively:
```json
{
  "type": "token_usage",
  "inputTokens": 150,
  "outputTokens": 200
}
```

## Files Modified

1. `frontend-v2/lib/hooks/useSessionStats.ts` - Fixed session duration tracking
2. `frontend-v2/app/page.tsx` - Enhanced WebSocket message handlers
3. `frontend-v2/components/layout/InsightPanel.tsx` - Improved display logic and formatting
