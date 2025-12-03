# Real-Time Voice-to-Voice Assistant

A minimal, clean implementation of real-time speech-to-speech interaction using WebSocket audio streaming, designed for integration with Amazon Nova Sonic.

## Architecture

```
Browser (Microphone) → WebSocket → Backend Server → [Nova Sonic] → WebSocket → Browser (Speakers)
```

### Current Implementation (MVP)

- **Frontend**: Captures microphone audio, converts to PCM16, streams via WebSocket
- **Backend**: Receives audio frames and echoes them back (validates end-to-end flow)
- **Audio Format**: PCM16, mono, 16kHz sample rate

### Future Integration

The `sonic-client.ts` module contains placeholder methods ready for Nova Sonic integration:
- `startSession()` - Initialize Sonic bidirectional stream
- `sendAudioChunk()` - Send audio to Sonic
- `receiveEvents()` - Handle Sonic responses (audio, transcripts)
- `stopSession()` - Clean session termination

## Project Structure

```
Voice_S2S/
├── frontend/
│   ├── index.html      # UI with status indicators and controls
│   ├── main.js         # WebSocket connection and state management
│   └── audio.js        # Audio capture, PCM16 conversion, playback
├── backend/
│   ├── src/
│   │   ├── server.ts       # WebSocket server with /sonic endpoint
│   │   └── sonic-client.ts # Placeholder for Nova Sonic integration
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## Setup Instructions

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Build Backend

```bash
npm run build
```

### 3. Start Backend Server

```bash
npm start
```

The server will start on port 8080 with WebSocket endpoint: `ws://localhost:8080/sonic`

### 4. Open Frontend

Simply open `frontend/index.html` in a modern browser (Chrome or Firefox recommended).

## Usage

1. **Connect**: Click the "Connect" button to establish WebSocket connection
2. **Allow Microphone**: Grant microphone permissions when prompted
3. **Start Recording**: Click "Start Recording" and speak into your microphone
4. **Hear Echo**: Your voice will be echoed back through your speakers
5. **Stop Recording**: Click "Stop Recording" when done

## Audio Specifications

- **Format**: PCM16 (16-bit signed integer)
- **Sample Rate**: 16,000 Hz
- **Channels**: 1 (mono)
- **Chunk Size**: 4,096 samples
- **Latency**: < 500ms (end-to-end)

## Next Steps: Nova Sonic Integration

To integrate Amazon Nova Sonic:

1. **Install AWS SDK**:
   ```bash
   cd backend
   npm install @aws-sdk/client-bedrock-runtime
   ```

2. **Configure AWS Credentials**: Set up AWS credentials with Bedrock access

3. **Update `sonic-client.ts`**:
   - Replace placeholder methods with actual Bedrock Runtime API calls
   - Initialize bidirectional stream to Nova Sonic
   - Handle audio events and transcripts from Sonic

4. **Update `server.ts`**:
   - Uncomment Sonic integration code
   - Route received audio to `SonicClient.sendAudioChunk()`
   - Forward Sonic responses back to browser via WebSocket

## Development Notes

- **No Build Tools**: Frontend uses vanilla JavaScript (no bundlers, no frameworks)
- **Clean Separation**: WebSocket layer is independent of Sonic integration layer
- **Binary Frames**: WebSocket handles binary audio data efficiently
- **Minimal Dependencies**: Only essential packages (`ws`, `typescript`)

## Architecture Decisions

### Why WebSocket over WebRTC?

- Simpler implementation for server-controlled audio processing
- Direct integration with backend AI services
- No peer-to-peer complexity needed

### Why PCM16?

- Native format for most speech AI services
- Efficient binary transmission
- No compression overhead

### Why No Bundlers?

- Keeps codebase minimal and transparent
- Easier to understand and modify
- Faster iteration during development

## Troubleshooting

**Microphone not working**: Ensure browser has microphone permissions and page is served over HTTPS (or localhost).

**No audio playback**: Check browser console for errors. Ensure AudioContext is supported.

**WebSocket connection failed**: Verify backend server is running on port 8080.

**High latency**: Check network conditions. Adjust `BUFFER_SIZE` in `audio.js` if needed.

## License

MIT
