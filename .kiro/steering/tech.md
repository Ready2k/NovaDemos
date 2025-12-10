# Technology Stack & Build System

## Backend Stack
- **Runtime**: Node.js with TypeScript
- **WebSocket**: `ws` library for real-time audio streaming
- **AWS SDK**: Multiple Bedrock clients for Nova Sonic and Agent integration
- **Environment**: dotenv for configuration management
- **Build**: TypeScript compiler (tsc) with ES2020 target

## Frontend Stack
- **Pure JavaScript**: No frameworks or bundlers (vanilla JS/HTML/CSS)
- **WebSocket API**: Native browser WebSocket for audio streaming
- **Web Audio API**: For microphone capture and audio playback
- **Canvas API**: Real-time audio visualization

## Audio Specifications
- **Format**: PCM16 (16-bit signed integer)
- **Sample Rate**: 16,000 Hz
- **Channels**: 1 (mono)
- **Chunk Size**: 4,096 samples
- **Target Latency**: < 500ms end-to-end

## AWS Services
- **Amazon Nova 2 Sonic**: Primary AI model for speech-to-speech
- **Bedrock Runtime**: `InvokeModelWithBidirectionalStreamCommand` for streaming
- **Bedrock Agent Runtime**: For complex banking workflows
- **Bedrock AgentCore**: Native tool execution platform
- **Polly**: Text-to-speech fallback
- **Transcribe Streaming**: Audio transcription for agent mode

## Common Commands

### Backend Development
```bash
cd backend
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm start           # Start production server
npm run dev         # Build and start (development)
```

### Testing
```bash
cd tests
npm install          # Install test dependencies
./run-test.sh       # Run basic Nova Sonic test
./run-native-test.sh # Run native tool capability test
./restart.sh        # Restart Voice S2S service
```

### Project Setup
```bash
# Root level dependencies (minimal)
npm install

# Backend setup
cd backend
cp .env.example .env  # Configure AWS credentials
npm install
npm run build
npm start

# Frontend access
# Open http://localhost:8080 (do not open index.html directly)
```

## Environment Configuration
- **AWS Credentials**: Via `.env` file or IAM roles
- **Required Permissions**: `bedrock:InvokeModelWithBidirectionalStream`, `bedrock-agentcore:InvokeAgentRuntime`
- **Model Access**: `amazon.nova-2-sonic-v1:0` in target region
- **Port**: Default 8080 for WebSocket server

## Development Philosophy
- **No Build Tools**: Frontend uses vanilla JavaScript for transparency
- **Minimal Dependencies**: Only essential packages
- **Clean Separation**: WebSocket layer independent of AI integration
- **Binary Efficiency**: Direct PCM16 transmission without compression