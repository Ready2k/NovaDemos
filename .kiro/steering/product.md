# Product Overview

## Real-Time Voice-to-Voice Assistant

A minimal, clean implementation of real-time speech-to-speech interaction using WebSocket audio streaming, designed for integration with Amazon Nova 2 Sonic.

### Core Functionality
- **Real-time audio streaming**: Browser microphone → WebSocket → AWS Nova 2 Sonic → Browser speakers
- **Dual architecture support**: Nova Sonic Direct Mode (fast, natural) and Bedrock Agent Mode (complex workflows)
- **Native tool integration**: Complete tool capability with visual and audible feedback
- **Progressive filler system**: Immediate audio feedback during tool execution to prevent silence
- **Smart caching**: Tool result caching with fuzzy query matching and TTL optimization
- **Multi-modal interaction**: Voice, text chat, and hybrid modes

### Key Features
- Audio visualizer with real-time waveform display
- Persona presets and voice selection
- Session statistics (latency, tokens, duration)
- Toast notification system for tool processing
- AWS configuration via GUI
- Tool enable/disable controls

### Target Use Cases
- Voice-first AI interactions
- Banking and financial service bots
- Educational tutoring (language learning)
- Development assistance with voice interface
- Real-time information queries (time, weather, etc.)

### Architecture Philosophy
- Minimal dependencies and clean separation of concerns
- WebSocket-based for server-controlled audio processing
- No build tools or frameworks in frontend (vanilla JS)
- Efficient binary audio transmission (PCM16)