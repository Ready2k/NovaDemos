# CRITICAL FIX: Message Duplication in Hybrid Mode

## Problem

After deploying the initial fixes, a **critical bug** was discovered:
- Messages were duplicated 2-3 times in the UI
- System became unresponsive after asking "what's my balance?"
- Both voice and text adapters were running simultaneously in hybrid mode

## Root Cause

In `agents/src/agent-runtime-unified.ts`, the `initializeSession()` method was starting BOTH adapters in hybrid mode:

```typescript
// BROKEN CODE
else if (this.config.mode === 'hybrid') {
    // In hybrid mode, start both adapters
    if (this.voiceSideCar) {
        await this.voiceSideCar.startVoiceSession(sessionId, ws, memory);
    }
    if (this.textAdapter) {
        await this.textAdapter.startTextSession(sessionId, ws, memory);
    }
}
```

This caused:
1. Voice adapter sends transcript → UI displays message
2. Text adapter ALSO sends transcript → UI displays SAME message again
3. Both adapters process the same input → duplicate responses
4. System gets confused with multiple handlers

## Solution

**Hybrid mode should ONLY use the voice adapter**, which already handles text input via `handleTextInput()`.

### Changes Made

**File**: `agents/src/agent-runtime-unified.ts`

#### 1. Fixed initializeAdapters()
```typescript
// Initialize Text Adapter ONLY for text-only mode
// In hybrid mode, voice adapter handles text input via handleTextInput()
if (this.config.mode === 'text') {
    // Only initialize text adapter for pure text mode
    this.textAdapter = new TextAdapter(textAdapterConfig);
}
```

#### 2. Fixed initializeSession()
```typescript
else if (this.config.mode === 'hybrid') {
    // FIXED: In hybrid mode, ONLY start voice adapter
    // Voice adapter handles both voice and text input via handleTextInput()
    if (this.voiceSideCar) {
        await this.voiceSideCar.startVoiceSession(sessionId, ws, memory);
    }
    // DO NOT start text adapter - it causes duplication
}
```

#### 3. Fixed handleDisconnect()
```typescript
else if (this.config.mode === 'hybrid') {
    // FIXED: In hybrid mode, only voice adapter was started
    if (this.voiceSideCar) {
        await this.voiceSideCar.stopVoiceSession(sessionId);
    }
    // DO NOT stop text adapter - it was never started
}
```

## How Hybrid Mode Works Now

### Voice Mode
- Uses: Voice Side-Car only
- Input: Audio chunks
- Output: Audio + transcripts

### Text Mode
- Uses: Text Adapter only
- Input: Text messages
- Output: Text responses + transcripts

### Hybrid Mode (FIXED)
- Uses: Voice Side-Car only
- Input: Audio chunks OR text messages (via `handleTextInput()`)
- Output: Audio + transcripts
- **Key**: Voice adapter has built-in text input handling, no need for text adapter

## Testing

After fix:
```bash
# Rebuild
docker-compose -f docker-compose-unified.yml build agent-triage agent-banking

# Restart
docker-compose -f docker-compose-unified.yml up -d

# Verify no duplication
docker-compose -f docker-compose-unified.yml logs agent-triage | grep "Hybrid mode"
# Should show: "Hybrid mode: Voice adapter handles both voice and text input"
```

## Expected Behavior

### Before Fix ❌
- "Hello!" appears 2-3 times
- "I can help you check your balance" appears 2-3 times
- System hangs after user input
- Logs show both adapters processing messages

### After Fix ✅
- Each message appears exactly once
- System responds normally
- Only voice adapter logs appear
- No duplication in UI

## Deployment Status

- ✅ Code fixed in `agents/src/agent-runtime-unified.ts`
- ✅ Containers rebuilt
- ✅ Services restarted
- ✅ Verified in logs

## Related Files

- `agents/src/agent-runtime-unified.ts` - Main fix
- `agents/src/voice-sidecar.ts` - Handles text input in hybrid mode
- `agents/src/text-adapter.ts` - Only used in text-only mode now

## Lessons Learned

1. **Hybrid mode ≠ Both adapters running** - It means one adapter that handles both input types
2. **Voice adapter already supports text** - via `handleTextInput()` method
3. **Multiple message handlers = duplication** - Only one adapter should send transcripts
4. **Test mode changes thoroughly** - Especially when multiple components can handle same events

## Next Steps

1. Test full conversation flow
2. Verify no more duplication
3. Test handoffs between agents
4. Monitor for any other issues
5. Update documentation about hybrid mode behavior
