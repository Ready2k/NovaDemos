# Duplicate Message Root Cause Analysis

## Problem
Agent messages appear 3 times in the UI with slightly different content.

## Root Cause Found

### SonicClient Emits Multiple Transcripts
**File**: `agents/src/sonic-client.ts`

1. **Streaming transcript** (Line 1383): `isFinal: false` - sent during text generation
2. **Final transcript** (Line 1452): `isFinal: true` - sent at END_TURN

This is INTENTIONAL for real-time streaming updates.

### Frontend Deduplication Logic
**File**: `frontend-v2/app/page.tsx` (Line 186-206)

The frontend HAS deduplication logic:
```typescript
const existingMsgIndex = messages.findIndex(m => m.id === messageId);

if (existingMsgIndex >= 0) {
  // Update existing message
  updateLastMessage({...});
} else {
  // Add new message
  addMessage({...});
}
```

## Why Deduplication Fails

### Issue 1: Message ID Generation
**Line 183**: `const messageId = transcriptMsg.id || `msg-${role}-${transcriptMsg.timestamp || Date.now()}``;

If `transcriptMsg.id` is missing or different for each transcript, they're treated as separate messages.

### Issue 2: Text Adapter Not Passing ID
**File**: `agents/src/text-adapter.ts` (Line 447)

```typescript
session.ws.send(JSON.stringify({
    type: 'transcript',
    role: transcriptData.role || 'assistant',
    text,
    isFinal: transcriptData.isFinal !== undefined ? transcriptData.isFinal : true,
    timestamp: Date.now()
}));
```

**MISSING**: `id` field is NOT being passed from text-adapter!

The SonicClient generates stable IDs (`this.currentTurnId`), but the text-adapter doesn't forward them.

## The Fix

### Solution: Pass Stable ID from Text Adapter

**File**: `agents/src/text-adapter.ts` (Line 447)

Add the `id` field:
```typescript
session.ws.send(JSON.stringify({
    type: 'transcript',
    id: transcriptData.id || `turn-${session.sessionId}-${Date.now()}`, // ADD THIS
    role: transcriptData.role || 'assistant',
    text,
    isFinal: transcriptData.isFinal !== undefined ? transcriptData.isFinal : true,
    timestamp: Date.now()
}));
```

This ensures:
1. Streaming transcript has ID: `turn-abc-123`
2. Final transcript has SAME ID: `turn-abc-123`
3. Frontend deduplication works: updates existing message instead of adding new one

## Expected Result

- First transcript (streaming): Creates message with ID
- Second transcript (final): Updates same message (same ID)
- UI shows ONE message that updates in real-time

## Additional Issue: Why 3 Messages?

Looking at the screenshot, there are 3 messages with progressively longer content. This suggests:

1. **Message 1**: Initial greeting (short)
2. **Message 2**: Greeting + additional context (medium)
3. **Message 3**: Full response (long)

This could be:
- Multiple contentBlockDelta events creating separate transcripts
- Agent generating response in multiple chunks
- Each chunk getting a different ID

The stable ID fix should resolve this by ensuring all chunks for the same turn use the same ID.

