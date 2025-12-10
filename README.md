# Real-Time Voice-to-Voice Assistant

A minimal, clean implementation of real-time speech-to-speech interaction using WebSocket audio streaming, designed for integration with Amazon Nova Sonic.

## Architecture

```
Browser (Microphone) → WebSocket → Backend Server → Amazon Nova 2 Sonic → Backend Server → WebSocket → Browser (Speakers)
```

### Current Implementation

- **Frontend**: Captures microphone audio, converts to PCM16, streams via WebSocket, displays transcripts, and visualizes audio
- **Backend**: Routes audio to Amazon Nova 2 Sonic via AWS Bedrock, streams responses back
- **Audio Format**: PCM16, mono, 16kHz sample rate
- **AI Model**: Amazon Nova 2 Sonic (released December 2025) - bidirectional speech-to-speech with 1M token context

### Key Features

- **🎯 100% Native Nova 2 Sonic Tool Capability**: Complete native tool integration with visual and audible feedback
- **🏗️ Dual Architecture Support**: 
  - Nova Sonic Direct Mode (fast, natural tool calls)
  - Bedrock Agent Mode (complex banking workflows)
- **Real-time Audio Visualizer**: Dynamic, reactive waveform visualization of both user input and AI output
- **Text Interface**: Full chat functionality allowing users to type questions and receive voice/text responses
- **Interaction Modes**: Switch between "Chat + Voice", "Voice Only", and "Chat Only" to suit your environment
- **Persona Presets**: Switch between different system prompts (e.g., Coding Assistant, Pirate, French Tutor)
- **Voice Selection**: Choose from available Nova voices (Matthew, Tiffany, Amy, etc.)
- **Session Stats**: Real-time tracking of latency, token usage, and session duration
- **Configuration Persistence**: Settings are automatically saved to `localStorage`
- **Dynamic AWS Configuration**: Set AWS credentials and Agent Core Runtime ARN via GUI without server restart
- **Native Tool Execution**: Time queries, server information, and extensible tool framework
- **Tool Enable/Disable**: Proper frontend control over which tools are available to Nova Sonic
- **🎵 Progressive Filler System**: 
  - Immediate audio filler ("Let me check that for you") on tool execution
  - Cascading secondary fillers for longer operations
  - Works for both fresh executions and cached results
  - Prevents Nova Sonic error messages during tool delays
- **💾 Smart Tool Result Caching**: 
  - Intelligent caching with tool-specific TTL (time: 30s, account: 60s, weather: 5min)
  - Fuzzy query matching for interrupted/repeated questions
  - Cost optimization - prevents redundant AgentCore calls
  - Consistent user experience for cached vs fresh results
- **🔔 Toast Notification System**: 
  - Visual feedback for tool processing
  - Deduplication prevents multiple notifications
  - Clean UI with proper cleanup

### Integration Details

The backend uses AWS Bedrock Runtime's `InvokeModelWithBidirectionalStreamCommand` for real-time streaming:
- Async generator pattern for input audio stream
- Event loop processing for Sonic responses (audio + transcripts)
- Graceful session management and cleanup

## Project Structure

```
Voice_S2S/
├── frontend/
│   ├── index.html      # UI with status indicators and controls
│   ├── main.js         # WebSocket connection and state management
│   └── audio.js        # Audio capture, PCM16 conversion, playback
├── backend/
│   ├── src/
│   │   ├── server.ts           # WebSocket server with dual architecture support
│   │   ├── sonic-client.ts     # Complete Nova Sonic integration
│   │   ├── bedrock-agent-client.ts # Banking Bot integration
│   │   └── transcribe-client.ts    # Audio transcription for agent mode
│   ├── prompts/
│   │   ├── core_guardrails.txt # Native tool usage instructions
│   │   └── agent_echo.txt      # Banking Bot relay configuration
│   ├── package.json
│   └── tsconfig.json
├── tools/
│   └── time_tool.json          # Native tool definitions
├── tests/
│   └── test-complete-native.js # End-to-end tool testing
├── NATIVE_TOOL_SOLUTION.md     # Complete implementation guide
└── README.md
```

## Setup Instructions

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Configure AWS Credentials

Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your AWS credentials:

```env
NOVA_AWS_REGION=us-east-1
NOVA_AWS_ACCESS_KEY_ID=your_access_key_here
NOVA_AWS_SECRET_ACCESS_KEY=your_secret_key_here
NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0
AGENT_CORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/YourRuntimeName
```

**Required IAM Permissions:**
- `bedrock:InvokeModelWithBidirectionalStream`
- `bedrock-agentcore:InvokeAgentRuntime` (for Agent Core Runtime)
- Access to the `amazon.nova-2-sonic-v1:0` model in your region

**Alternative:** If running on AWS infrastructure (EC2/ECS), you can use IAM roles instead of explicit credentials.

### 3. Build Backend

```bash
npm run build
```

### 4. Start Backend Server

```bash
npm start
```

The server will start on port 8080 with WebSocket endpoint: `ws://localhost:8080/sonic`

### 5. Open Frontend
 
Open your browser and navigate to:
 
**http://localhost:8080**
 
(Do not open the `index.html` file directly, as it requires the server to handle CORS and static files)

## Usage

### Basic Setup
1. **Connect**: Click the "Connect" button to establish WebSocket connection
2. **Allow Microphone**: Grant microphone permissions when prompted
3. **Select Brain Mode**:
   - **Nova Sonic Direct**: Fast, natural tool calls (recommended for time queries)
   - **Bedrock Agent**: Complex banking workflows with full agent reasoning

### Interaction Methods
4. **Voice**: Speak into your microphone. The visualizer will react to your voice
5. **Text**: Type in the chat bar at the bottom and press Enter
6. **Modes**: Use the "Interaction Mode" dropdown to switch between:
   - `✨ Chat + Voice`: Full functionality
   - `🎤 Voice Only`: Text input hidden
   - `💬 Chat Only`: Audio muted, mic disabled

### Tool Usage Examples
- **Time Queries**: "What time is it?" → Progressive filler → Native tool execution → Natural speech response
- **Repeated Queries**: "What was the time?" → Instant cached response without re-execution
- **Interrupted Queries**: Ask for time, interrupt, then ask again → Smart cache hit detection
- **Banking Queries**: "Hello" → Banking Bot greeting and assistance
- **General Chat**: Any conversational input → Natural AI responses

### Customization
7. **Persona**: Select different system prompts (Coding Assistant, Pirate, French Tutor)
8. **Voice**: Choose from available Nova voices (Matthew, Tiffany, Amy, etc.)
9. **Tools**: Enable/disable specific tools in the configuration panel
10. **AWS Configuration**: Configure AWS credentials and Agent Core Runtime ARN via the GUI
    - Credentials are stored securely in session storage
    - Agent Core Runtime ARN can be set per session
    - Settings are applied automatically when connecting

**Note**: First response may take 1-2 seconds as Nova Sonic initializes the conversation.

## Audio Specifications

- **Format**: PCM16 (16-bit signed integer)
- **Sample Rate**: 16,000 Hz
- **Channels**: 1 (mono)
- **Chunk Size**: 4,096 samples
- **Latency**: < 500ms (end-to-end)

## Troubleshooting

**AWS Authentication Error**: Verify your `.env` file has correct AWS credentials and the IAM user/role has Bedrock permissions.

**Model Access Denied**: Ensure you have access to the `amazon.nova-2-sonic-v1:0` model in your AWS region. Some regions may require model access requests.

**No Audio Response**: Check browser console for errors. Verify Nova Sonic session started successfully in backend logs.

**High Latency**: 
- Reduce audio chunk size in `audio.js` (currently 4096 samples)
- Ensure stable network connection
- Check AWS region latency (use closest region)

**Microphone not working**: Ensure browser has microphone permissions and page is served over HTTPS (or localhost).

**WebSocket connection failed**: Verify backend server is running on port 8080.

## Nova 2 Sonic Features

- **Multilingual Support**: Expanded language support beyond English
- **Expressive Voices**: More natural-sounding speech synthesis
- **High Accuracy**: Improved speech recognition and understanding
- **Long Context**: 1M token context window for extended conversations
- **Low Latency**: Optimized for real-time interactions

## Development Notes

- **No Build Tools**: Frontend uses vanilla JavaScript (no bundlers, no frameworks)
- **Clean Separation**: WebSocket layer is independent of Nova Sonic integration layer
- **Binary Frames**: WebSocket handles binary audio data efficiently
- **Minimal Dependencies**: Essential packages only (`ws`, `@aws-sdk/client-bedrock-runtime`, `typescript`)
- **Hybrid Filler System**: Removed complex Gen Filler caching in favor of explicit system prompts + visual feedback

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

## License

MIT
