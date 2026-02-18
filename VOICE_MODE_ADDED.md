# Voice Mode Added to Agent Test Page

## Changes Made

### 1. Added Voice Mode State
- New state variable: `useVoiceMode` (boolean)
- Integrated `useAudioProcessor` hook for audio handling
- Audio processor configured for 16kHz PCM audio

### 2. Voice Mode Toggle UI
- Added toggle button below Gateway toggle
- Purple color scheme for voice mode (vs green for gateway)
- Shows "🎤 Audio input/output enabled" when on
- Shows "⌨️ Text-only mode" when off
- Disabled during active connection (must disconnect to switch)

### 3. Voice Controls
When voice mode is enabled, the input area shows:
- **Start/Stop Recording button** (purple/red)
  - Shows "🎤 Start Recording" when idle
  - Shows pulsing dot + "Stop Recording" when active
- **Mute/Unmute button** (🔊/🔇)
  - Toggles audio output muting

### 4. Audio Handling
- **Outgoing audio**: Captured from microphone, sent as binary WebSocket messages
- **Incoming audio**: Received as binary, played through audio processor
- **Binary message handling**: Updated WebSocket onmessage to detect and play audio

### 5. Connection Mode Display
- System message now shows: "Connected via Gateway → Triage Agent (Voice Mode)"
- Or: "Connected via Gateway → Triage Agent (Text Mode)"

## How to Use

1. Select an agent (default: Triage)
2. Enable "Voice Mode" toggle
3. Click "Connect"
4. Click "🎤 Start Recording" to begin speaking
5. Agent responses will be played as audio
6. Click "Stop Recording" when done speaking

## Technical Details

### Audio Format
- Sample rate: 16kHz
- Format: PCM16 (16-bit signed integer)
- Channels: Mono
- Encoding: Raw binary

### WebSocket Protocol
- Text messages: JSON strings
- Audio messages: Binary ArrayBuffer/Blob
- Gateway handles both text and voice modes

### Audio Processor Features
- Echo cancellation
- Noise suppression
- Auto gain control
- Playback queue management

## Testing

To test voice mode:
1. Ensure microphone permissions are granted
2. Enable voice mode toggle
3. Connect to an agent
4. Start recording and speak
5. Verify audio is being sent (check browser console)
6. Verify agent audio responses play back

## Next Steps

- Test end-to-end voice conversation
- Verify handoffs work in voice mode
- Add audio visualizer (optional)
- Improve duplicate message filtering
