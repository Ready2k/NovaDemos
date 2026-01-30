# End of Speech Fix - Session Closing Too Early

## Problem
User heard a static blip and then nothing. Nova Sonic received the audio (150 speech tokens) but never responded because the session closed immediately after the user stopped speaking.

## Root Cause
When the user clicked the microphone button to stop recording:
1. Frontend stopped recording
2. WebSocket connection closed
3. Agent received `ws.on('close')` event
4. Agent immediately called `stopSession()`
5. Nova Sonic session ended BEFORE it could generate a response

## The Flow That Was Broken
```
User speaks → User stops mic → WebSocket closes → Session ends → ❌ No response
```

## The Correct Flow
```
User speaks → User stops mic → End audio input → Nova responds → Session stays open
```

## Solution

### 1. Frontend: Send End-of-Speech Signal
Modified `frontend-v2/app/page.tsx` to send an explicit message instead of closing:
```typescript
// Stop recording
audioProcessor.stopRecording();

// Send end-of-speech signal to backend
send({ type: 'end_of_speech' });

setConnectionStatus('connected');
```

### 2. Agent: Handle End-of-Speech
Modified `agents/src/agent-runtime-s2s.ts` to handle the message:
```typescript
if (message.type === 'end_of_speech') {
    console.log(`[Agent:${AGENT_ID}] End of speech signal received`);
    const session = activeSessions.get(sessionId!);
    if (session) {
        // End the audio input stream (but keep session open for response)
        await session.sonicClient.endAudioInput();
    }
    return;
}
```

### 3. SonicClient: Add endAudioInput Method
Added new method in `agents/src/sonic-client.ts`:
```typescript
async endAudioInput(): Promise<void> {
    console.log('[SonicClient] Ending audio input stream (user finished speaking)');
    
    // Signal end of input by pushing null to the queue
    this.inputQueue.push(null as any);
}
```

### 4. Input Stream: Handle End Signal
Modified the input stream generator to handle null signal:
```typescript
// Check for end-of-audio signal (null)
if (audioBuffer === null) {
    // End the current audio content if open
    if (this.currentContentName) {
        const contentEndEvent = {
            event: {
                contentEnd: {
                    promptName: promptName,
                    contentName: this.currentContentName
                }
            }
        };
        yield { chunk: { bytes: Buffer.from(JSON.stringify(contentEndEvent)) } };
        console.log('[SonicClient] Sent UserAudioContentEndEvent');
        this.currentContentName = undefined;
    }
    
    // Continue processing (don't break) - wait for Nova's response
    continue;
}
```

## Key Insight
The WebSocket connection must stay open throughout the entire conversation turn:
- User speaks (audio input)
- User stops speaking (end audio input)
- Nova processes (thinking)
- Nova responds (audio output)
- Ready for next turn

Only close the session when the user explicitly disconnects or the conversation ends.

## Files Modified
- ✅ `frontend-v2/app/page.tsx` - Send end_of_speech message
- ✅ `agents/src/agent-runtime-s2s.ts` - Handle end_of_speech message
- ✅ `agents/src/sonic-client.ts` - Add endAudioInput() method
- ✅ `agents/src/sonic-client.ts` - Handle null signal in input stream
- ✅ Agent rebuilt with `npm run build`

## Next Steps
1. **Restart services**: `./start-all-services.sh`
2. **Test**: Click mic, speak, click mic again to stop
3. **Expect**: Nova Sonic should respond with audio
4. **Monitor**: Check logs for "Ending audio input stream" message
