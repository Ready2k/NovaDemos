# Voice S2S - Comprehensive Fix Implementation Plan

**Created:** 2026-01-20  
**Status:** Ready for Implementation

---

## Overview

This plan addresses three critical issues in the Voice S2S application:

1. **Langfuse Prompt Management** - Save/Push prompts functionality
2. **Feedback/Scores API** - Fix undefined traceId/sessionId issues
3. **Sentiment Initialization** - Start at neutral (50%) instead of negative

---

## Issue 1: Langfuse Prompt Management

### Current State
- Prompts can be loaded from Langfuse
- Save and push functionality is not working
- Need to implement version management and promotion to production

### Implementation Steps

#### Backend Changes (server.ts)

**Step 1.1: Create Prompt Service Module**
- Location: `backend/src/services/prompt-service.ts`
- Implement:
  - `getLatestPrompt(name, label)` - Fetch with cache control
  - `saveNewPromptVersion(name, text, config)` - Create new version
  - `promoteToProduction(name, version)` - Update labels
  - `listAllPrompts()` - Get all available prompts with versions

**Step 1.2: Update API Endpoints**
- Modify `/api/prompts` POST endpoint to:
  - Accept `{ name, content, config, sync: boolean }`
  - Call `saveNewPromptVersion()` when sync=true
  - Automatically promote to production
  - Return new version number

**Step 1.3: Add Version Management Endpoint**
- Create `/api/prompts/:name/versions` GET endpoint
- Return all versions for a specific prompt
- Include metadata: version number, labels, created date

**Step 1.4: Add Promotion Endpoint**
- Create `/api/prompts/:name/promote` POST endpoint
- Accept `{ version }` in body
- Move "production" label to specified version

#### Frontend Changes (main.js)

**Step 1.5: Add Version Selector UI**
- Add dropdown to prompt editor for version selection
- Display current production version
- Show version history with timestamps

**Step 1.6: Update Save Handler**
- Modify save button to:
  - Show "Save & Promote to Production" option
  - Display confirmation dialog with version info
  - Show success message with new version number
  - Refresh version list after save

**Step 1.7: Add Sync Toggle**
- Add checkbox: "Sync to Langfuse"
- Store preference in localStorage
- Show sync status indicator (cloud icon)

### Testing Checklist
- [ ] Can fetch latest prompt from Langfuse
- [ ] Can save new version locally
- [ ] Can sync to Langfuse and create new version
- [ ] Version is automatically promoted to production
- [ ] Can view version history
- [ ] Can manually promote older versions
- [ ] Cache is properly invalidated after changes

---

## Issue 2: Feedback/Scores API Fix

### Current State
```
[Server] Feedback Debug: traceId=undefined, sessionId=undefined, targetId=undefined, score=0
```

### Root Cause Analysis
- Frontend not sending sessionId in feedback payload
- Langfuse trace not properly initialized or stored
- Session ID mapping between WebSocket and Langfuse is broken

### Implementation Steps

#### Backend Changes (server.ts)

**Step 2.1: Fix Session-Trace Mapping**
- Ensure `session.langfuseTrace` is set when session starts
- Store mapping: `sessionId -> traceId` in memory
- Add debug logging for trace creation

**Step 2.2: Update Feedback Handler**
- Location: Line ~1230-1290 in server.ts
- Changes:
  ```typescript
  // Extract sessionId from request
  const { sessionId, score, comment, name } = JSON.parse(body);
  
  // Look up session to get traceId
  const session = Array.from(activeSessions.values())
    .find(s => s.sessionId === sessionId);
  
  const traceId = session?.langfuseTrace?.id || sessionId;
  
  console.log(`[Server] Feedback: sessionId=${sessionId}, traceId=${traceId}, score=${score}`);
  ```

**Step 2.3: Add Trace Validation**
- Verify trace exists before sending feedback
- Return helpful error if trace not found
- Log trace creation and lifecycle events

#### Frontend Changes (main.js)

**Step 2.4: Fix Feedback Payload**
- Search for feedback submission code
- Ensure payload includes:
  ```javascript
  {
    sessionId: this.sessionId,
    score: score, // 1 for thumbs up, 0 for thumbs down
    comment: comment || '',
    name: 'user-feedback'
  }
  ```

**Step 2.5: Add Feedback UI Indicators**
- Show loading state during feedback submission
- Display success/error toast
- Update history item with feedback icon immediately
- Store feedback state locally for offline resilience

#### SonicClient Changes (sonic-client.ts)

**Step 2.6: Ensure Trace Initialization**
- Verify `this.langfuseTrace` is created in `startSession()`
- Add trace to session object
- Log trace ID for debugging

**Step 2.7: Add Score Method**
- Create helper method: `recordFeedback(score, comment)`
- Call Langfuse score API directly from client
- Return promise for error handling

### Testing Checklist
- [ ] Trace is created when session starts
- [ ] Trace ID is logged and accessible
- [ ] Session ID is sent in feedback payload
- [ ] Backend receives both sessionId and traceId
- [ ] Feedback is successfully recorded in Langfuse
- [ ] Feedback appears in Langfuse dashboard
- [ ] Feedback icon appears in history list
- [ ] Feedback persists in local history file

---

## Issue 3: Sentiment Initialization Fix

### Current State
- Sentiment starts at negative 0% (or very low value)
- Should start at neutral 50%

### Root Cause
- Initial sentiment score not set to 0 (neutral)
- Chart initialization doesn't include neutral baseline
- First message might be setting negative sentiment

### Implementation Steps

#### Frontend Changes (main.js)

**Step 3.1: Initialize Sentiment Data with Neutral**
- Location: Constructor or session start
- Add initial neutral data point:
  ```javascript
  this.sentimentData = [{
    timestamp: new Date().toLocaleTimeString(),
    score: 0, // Neutral
    label: 'Neutral',
    role: 'system',
    text: 'Session Start'
  }];
  ```

**Step 3.2: Update Chart Initialization**
- In `initializeLiveSentimentChart()` (line ~647)
- Ensure Y-axis shows 0 as neutral midpoint
- Add reference line at y=0 for visual clarity

**Step 3.3: Update Sentiment Display**
- In `updateLiveSentiment()` (line ~723)
- Ensure first real message doesn't override neutral baseline
- Calculate average including neutral start point

**Step 3.4: Add Visual Neutral Indicator**
- Add horizontal line at y=0 on chart
- Use annotation plugin or custom drawing
- Color code: green (positive), gray (neutral), red (negative)

#### Backend Changes (server.ts)

**Step 3.5: Initialize Session Sentiment**
- When creating new session transcript
- Add initial neutral sentiment entry:
  ```typescript
  transcript: [{
    role: 'system',
    text: 'Session started',
    timestamp: Date.now(),
    sentiment: { score: 0, label: 'Neutral' }
  }]
  ```

**Step 3.6: Validate Sentiment Scores**
- Add validation in sentiment update handler
- Ensure scores are between -1 and 1
- Log warning if out of range

### Testing Checklist
- [ ] New session starts with neutral sentiment (0)
- [ ] Chart displays neutral baseline
- [ ] First message updates from neutral correctly
- [ ] Average sentiment calculation includes neutral start
- [ ] Visual indicator shows neutral zone clearly
- [ ] Sentiment persists correctly in history
- [ ] Historical sessions show correct sentiment progression

---

## Implementation Order

### Phase 1: Critical Fixes (Priority: HIGH)
1. **Feedback API Fix** (Issue 2) - 2-3 hours
   - Most critical for user feedback collection
   - Blocking Langfuse observability
   - Steps 2.1 - 2.7

2. **Sentiment Initialization** (Issue 3) - 1 hour
   - Quick win, improves UX immediately
   - Steps 3.1 - 3.6

### Phase 2: Feature Enhancement (Priority: MEDIUM)
3. **Langfuse Prompt Management** (Issue 1) - 4-5 hours
   - Enables better prompt versioning
   - Improves team collaboration
   - Steps 1.1 - 1.7

---

## Testing Strategy

### Unit Tests
- Prompt service methods
- Feedback payload validation
- Sentiment score calculations

### Integration Tests
- End-to-end feedback flow
- Langfuse API interactions
- Session-trace mapping

### Manual Testing
1. Start new session
2. Verify sentiment starts at neutral
3. Send feedback (thumbs up/down)
4. Check Langfuse dashboard for feedback
5. Save prompt with sync enabled
6. Verify new version in Langfuse
7. Load historical session
8. Verify sentiment and feedback display

---

## Rollback Plan

### If Issues Arise
1. **Feedback API**: Revert to simple file-based feedback storage
2. **Sentiment**: Disable chart, keep numerical display
3. **Prompt Management**: Disable sync, keep local-only saves

### Backup Points
- Create git branch before starting: `fix/langfuse-feedback-sentiment`
- Tag current state: `v1.0-pre-fixes`
- Backup critical files:
  - `backend/src/server.ts`
  - `frontend/main.js`
  - `backend/src/sonic-client.ts`

---

## Success Criteria

### Issue 1: Langfuse Prompt Management
- ✅ Can save prompts to Langfuse
- ✅ New versions are created automatically
- ✅ Production label is updated
- ✅ Version history is visible
- ✅ Can promote older versions

### Issue 2: Feedback/Scores API
- ✅ No more "undefined" in debug logs
- ✅ Feedback appears in Langfuse dashboard
- ✅ Feedback icons show in history
- ✅ Feedback persists across restarts

### Issue 3: Sentiment Initialization
- ✅ Sessions start at 50% neutral
- ✅ Chart shows neutral baseline
- ✅ Sentiment progresses naturally from neutral
- ✅ Historical data displays correctly

---

## Dependencies

### NPM Packages
- `langfuse` - Already installed
- `chart.js` - Already installed

### Environment Variables
- `LANGFUSE_SECRET_KEY` - Required for prompt management
- `LANGFUSE_PUBLIC_KEY` - Required for tracing
- `LANGFUSE_HOST` - Optional, defaults to cloud.langfuse.com

### API Endpoints
- Langfuse Prompts API
- Langfuse Scores API
- Langfuse Traces API

---

## Notes

### Langfuse Prompt Management
- Use `cacheTtlSeconds: 0` for instant sync
- `createPrompt()` with same name creates new version
- `updatePrompt()` moves labels between versions
- Labels: ["production", "latest", "dev"]

### Feedback API
- Score values: 1 (positive), 0 (negative)
- Can include optional comment
- Requires valid traceId
- Async operation, handle errors gracefully

### Sentiment
- Score range: -1 (very negative) to +1 (very positive)
- 0 is neutral
- Extracted from LLM response tags: `[SENTIMENT: 0.5]`
- Stored in transcript for historical analysis

---

## Timeline Estimate

- **Phase 1**: 3-4 hours
- **Phase 2**: 4-5 hours
- **Testing**: 2 hours
- **Documentation**: 1 hour

**Total**: 10-12 hours

---

## Next Steps

1. Review this plan with team
2. Create feature branch
3. Start with Phase 1 (Feedback + Sentiment)
4. Test thoroughly
5. Deploy to staging
6. Proceed with Phase 2 (Prompt Management)
7. Final testing and deployment

---

**Plan Status**: ✅ Ready for Implementation  
**Last Updated**: 2026-01-20
