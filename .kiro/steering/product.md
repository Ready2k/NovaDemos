# Voice S2S - Product Overview

## What is Voice S2S?

Voice S2S is a production-ready real-time speech-to-speech assistant platform powered by Amazon Nova 2 Sonic. It enables natural, bidirectional voice conversations with AI through a WebSocket-based architecture.

## Core Value Proposition

- **Real-time Voice Interaction**: <500ms latency bidirectional streaming with natural conversation flow
- **Dual Architecture Modes**: 
  - Nova Sonic Direct (fast, tool-native)
  - Bedrock Agent (complex workflows, reasoning)
- **Enterprise Banking**: Full banking operations (balance checks, transactions, disputes, mortgages)
- **Visual Workflows**: No-code workflow builder for complex agent behaviors
- **Sentiment Analysis**: Real-time LLM-driven sentiment tracking with live visualization
- **Smart Tool System**: 14 built-in tools with intelligent caching and fuzzy matching

## Key Features

### Voice & Audio
- PCM16 16kHz mono streaming
- Multiple expressive voices (Matthew, Tiffany, Amy, etc.)
- Audio visualization (AntiGravity, Fluid, ParticleVortex, PulseWaveform)
- Interruption handling for natural conversation

### Intelligence
- Native tool calling with visual feedback
- Knowledge base RAG integration
- Multi-step workflow automation
- Sentiment-aware responses

### User Experience
- Chat + Voice, Voice Only, or Chat Only modes
- Dark mode UI with responsive design
- Session analytics (duration, tokens, costs)
- User feedback system (thumbs up/down)

### Enterprise Features
- Langfuse observability and prompt versioning
- AWS Bedrock integration
- Custom tool creation
- Persona management with speech-specific prompts

## Target Users

- **Developers**: Building voice AI applications
- **Enterprises**: Banking, financial services, customer support
- **Researchers**: Voice AI experimentation and optimization
- **End Users**: Natural voice assistant interactions

## Architecture Pattern

```
Browser (WebSocket) ↔ Backend Server ↔ AWS Bedrock (Nova Sonic)
                            ↓
                      Tool Execution
                      Workflow Engine
                      Knowledge Bases
```

## Success Metrics

- Conversation latency <500ms
- Tool execution accuracy >95%
- Sentiment analysis consistency
- Session cost tracking accuracy
- User satisfaction (feedback ratings)
