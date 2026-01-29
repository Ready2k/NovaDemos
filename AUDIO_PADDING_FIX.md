# Audio Padding Fix - Why the Regression?

## Problem
Frontend crashed with:
```
RangeError: byte length of Int16Array should be a multiple of 2
```

## Why This Happened (Regression Analysis)

### Previous Fix Location
The padding logic was added to `frontend-v2/lib/hooks/useWebSocket.ts` for **OUTGOING** audio (microphone → backend).

### Missing Fix Location
We never added padding for **INCOMING** audio (backend → speakers).

### Root Cause
Nova Sonic can send audio chunks with odd byte lengths. When these chunks flow through:
1. **Nova Sonic** → odd-sized chunk
2. **Agent** (agent-runtime-s2s.ts) → forwarded as-is
3. **Gateway** (server.ts) → forwarded as-is  
4. **Frontend** (useAudioProcessor.ts) → CRASH trying to create Int16Array

## Fixes Applied

### 1. Frontend Defense (useAudioProcessor.ts)
Added padding logic in `playAudio()` function to handle odd-sized chunks:
```typescript
// Ensure even byte length for Int16Array
let buffer = audioData;
if (audioData.byteLength % 2 !== 0) {
    console.warn(`[AudioProcessor] Padding odd-sized audio data...`);
    const padded = new Uint8Array(audioData.byteLength + 1);
    padded.set(new Uint8Array(audioData));
    padded[audioData.byteLength] = 0;
    buffer = padded.buffer;
}
```

### 2. Agent Source Fix (agent-runtime-s2s.ts)
Added padding in `handleSonicEvent()` before forwarding audio:
```typescript
// Ensure even byte length before sending
if (audioBuffer.length % 2 !== 0) {
    const padded = Buffer.alloc(audioBuffer.length + 1);
    audioBuffer.copy(padded);
    padded[audioBuffer.length] = 0;
    audioBuffer = padded;
}
```

## Why Regressions Happen

1. **Incomplete Fix Coverage**: Original fix only covered one direction (outgoing)
2. **Multiple Code Paths**: Audio flows through 4 different components
3. **Assumption Mismatch**: Assumed Nova Sonic always sends even-sized chunks
4. **No Integration Tests**: Would have caught this in end-to-end testing

## Prevention Strategy

### Defensive Programming
- Add padding at BOTH source and destination
- Never assume external APIs follow expected formats
- Validate data at boundaries

### Testing Checklist
- [ ] Test microphone → backend (outgoing audio)
- [ ] Test backend → speakers (incoming audio)  
- [ ] Test with real Nova Sonic responses
- [ ] Test handoffs between agents
- [ ] Test error recovery

## Next Steps
1. **Restart services**: `./start-all-services.sh`
2. **Test full flow**: Speak and listen for response
3. **Monitor logs**: Check for padding warnings
4. **Document**: Add to integration test suite

## Files Modified
- ✅ `frontend-v2/lib/hooks/useAudioProcessor.ts` - Added receive padding
- ✅ `agents/src/agent-runtime-s2s.ts` - Added send padding
- ✅ Agent rebuilt with `npm run build`
