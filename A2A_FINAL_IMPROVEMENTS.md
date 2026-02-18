# A2A Final Improvements

## Current Status
✅ End-to-end A2A flow working:
- Triage → IDV → Banking
- IDV verification successful
- Balance check returns £1,200.00

## Issues to Fix

### 1. Duplicate Agent Messages
**Problem**: Agent repeats the same message multiple times
- "Hello! How can I help you today?" appears twice
- "Your account balance is £1,200.00" appears twice
- IDV greeting appears twice

**Root Cause**: Duplicate detection not working properly for agent messages

**Solution**: Improve duplicate detection in frontend to check content similarity for assistant messages

### 2. Multiple Tool Call Display
**Problem**: Same tool appears multiple times in UI
- `perform_idv_check` shows 2-3 times
- `agentcore_balance` shows 2-3 times

**Root Cause**: Tool is being called multiple times (circuit breaker shows call 2/5, 3/5)

**Solution**: 
- Check why tools are being called multiple times
- Improve tool result handling to prevent retries
- Better deduplication in UI for tool events

### 3. Add Voice Toggle
**Problem**: Currently only text mode available

**Solution**: Add toggle button to switch between:
- Text Mode (current)
- Voice Mode (with audio input/output via Nova Sonic)

**Implementation**:
- Add toggle in UI (similar to existing useGateway toggle)
- When voice mode enabled, use audio processor hooks
- Connect to voice-enabled WebSocket endpoint
- Show audio visualizer when in voice mode

## Implementation Plan

### Phase 1: Fix Duplicate Messages (Priority 1)
1. Update frontend duplicate detection logic
2. Add content-based deduplication for assistant messages
3. Test with current flow

### Phase 2: Fix Multiple Tool Calls (Priority 2)
1. Check agent prompts for tool retry logic
2. Verify circuit breaker is working correctly
3. Add tool call deduplication in UI

### Phase 3: Add Voice Toggle (Priority 3)
1. Add voice mode toggle to UI
2. Integrate audio processor when voice enabled
3. Update WebSocket connection to support voice
4. Add audio visualizer component

## Testing Checklist
- [ ] No duplicate agent greetings
- [ ] No duplicate final responses
- [ ] Tool calls appear once in UI
- [ ] Voice toggle switches modes correctly
- [ ] Audio input/output works in voice mode
- [ ] Text mode still works after toggle
