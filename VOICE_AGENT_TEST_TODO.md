# Voice Support for Agent Test Page - Implementation Plan

## Simplified Approach
Add voice mode as a toggle alongside the gateway toggle. Keep it simple and focused.

## Implementation Steps

### ✅ Step 1: Add Voice Mode State (5 min)
- Add `useVoiceMode` state (boolean)
- Add `isRecording` state
- Initialize audio processor hook

### ⏳ Step 2: Add Voice Toggle UI (5 min)
- Add toggle button next to Gateway toggle
- Show "Text Mode" / "Voice Mode" label
- Add microphone button (only visible in voice mode)

### ⏳ Step 3: Integrate Audio Processor (10 min)
- Initialize useAudioProcessor hook
- Handle audio data callback (send to WebSocket)
- Handle binary messages from WebSocket (play audio)

### ⏳ Step 4: Update WebSocket Handling (10 min)
- Detect binary vs text messages
- Send audio chunks as binary frames
- Play received audio chunks

### ⏳ Step 5: Add Microphone Button (5 min)
- Push-to-talk button
- Visual feedback (recording state)
- Start/stop recording on click

### ⏳ Step 6: Test (10 min)
- Test voice input → agent response → voice output
- Test mode switching
- Test with gateway mode

## Total Time: ~45 minutes

## Current Status
🟡 In Progress - Step 1
