# Product Overview

Voice S2S is a real-time speech-to-speech voice assistant platform powered by Amazon Nova 2 Sonic. It enables natural voice conversations with AI through WebSocket-based bidirectional audio streaming.

## Core Capabilities

- **Real-time voice interaction** with <500ms latency using PCM16 audio (16kHz mono)
- **Dual architecture modes**:
  - Nova Sonic Direct: Fast tool execution for general queries (200-500ms)
  - Bedrock Agent Mode: Complex multi-step workflows for banking operations (1-3s)
- **Native tool system** with 14 built-in tools across banking, mortgage, identity verification, and knowledge base categories
- **Visual workflow system** with drag-and-drop editor for building agent behaviors
- **LLM-driven sentiment analysis** with real-time tracking and visualization
- **Smart caching** for tool results with configurable TTL to optimize costs
- **Session analytics** with token usage, cost tracking, and Langfuse observability

## Key Use Cases

- Banking operations (balance checks, transactions, dispute management)
- Mortgage calculations and property valuations
- Identity verification
- Knowledge base queries with RAG support
- General conversational AI with tool execution

## Architecture

Browser microphone → WebSocket → Backend Server → Amazon Nova 2 Sonic → Tool Execution → Response streaming back to browser speakers
