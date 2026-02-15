# Voice S2S Architecture - Complete Overview

## Two-Layer Architecture

The system uses a **two-layer architecture** where:
1. **Agent Core** (LangGraph workflows) uses Claude for reasoning
2. **Voice Wrapper** (Nova Sonic) handles speech-to-speech

```
┌─────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                        │
│                     (Browser / Frontend)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ WebSocket
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                         GATEWAY                              │
│                  (Routes to Agents)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Routes to specific agent
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    UNIFIED RUNTIME                           │
│                   (Agent Container)                          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              VOICE SIDE-CAR (Optional)                 │ │
│  │                                                        │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │         NOVA SONIC CLIENT                        │ │ │
│  │  │  Model: amazon.nova-2-sonic-v1:0                 │ │ │
│  │  │  • Speech-to-Text (streaming)                    │ │ │
│  │  │  • Text-to-Speech (streaming)                    │ │ │
│  │  │  • Audio I/O handling                            │ │ │
│  │  │  • Tool call detection                           │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  │                         │                              │ │
│  │                         │ Forwards tool calls          │ │
│  │                         ▼                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │                   AGENT CORE                            │ │
│  │                                                         │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │          LANGGRAPH EXECUTOR                       │ │ │
│  │  │  • Workflow state machine                         │ │ │
│  │  │  • Node execution                                 │ │ │
│  │  │  • Edge traversal                                 │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │                         │                               │ │
│  │  ┌───────────────────────▼───────────────────────────┐ │ │
│  │  │        DECISION EVALUATOR                         │ │ │
│  │  │  Model: anthropic.claude-3-5-sonnet-20241022-v2:0│ │ │
│  │  │  • Evaluates decision nodes                       │ │ │
│  │  │  • Determines workflow paths                      │ │ │
│  │  │  • Context-aware routing                          │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │                         │                               │ │
│  │  ┌───────────────────────▼───────────────────────────┐ │ │
│  │  │           TOOLS CLIENT                            │ │ │
│  │  │  • Executes banking tools                         │ │ │
│  │  │  • Calls local-tools MCP server                   │ │ │
│  │  │  • Returns results to workflow                    │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## LLM Models Used

### 1. Nova Sonic (Voice Wrapper)
- **Model**: `amazon.nova-2-sonic-v1:0`
- **Purpose**: Speech-to-speech interface
- **Capabilities**:
  - Real-time speech-to-text streaming
  - Real-time text-to-speech streaming
  - Native tool calling (detects tool use in responses)
  - Low latency (<500ms)
- **Used By**: VoiceSideCar, SonicClient
- **Mode**: Streaming WebSocket connection

### 2. Claude Sonnet (Agent Brain)
- **Model**: `anthropic.claude-3-5-sonnet-20241022-v2:0`
- **Purpose**: Workflow decision making and reasoning
- **Capabilities**:
  - Evaluates decision nodes in LangGraph workflows
  - Determines which path to take based on context
  - Analyzes conversation state
  - High reasoning capability
- **Used By**: DecisionEvaluator
- **Mode**: Request/response via Bedrock Converse API

## Runtime Modes

### Text Mode (`MODE=text`)
```
User Input (Text) → Agent Core → Claude (decisions) → Tools → Response (Text)
```
- No voice processing
- Direct text I/O
- Uses TextAdapter
- Still uses Nova Sonic for LLM responses (text-only mode)

### Voice Mode (`MODE=voice`)
```
User Input (Audio) → Nova Sonic (STT) → Agent Core → Claude (decisions) → 
Tools → Nova Sonic (TTS) → Response (Audio)
```
- Full voice processing
- Audio I/O only
- Uses VoiceSideCar

### Hybrid Mode (`MODE=hybrid`) - CURRENT
```
User Input (Audio OR Text) → Nova Sonic → Agent Core → Claude (decisions) → 
Tools → Nova Sonic → Response (Audio AND Text)
```
- Supports both voice and text
- Uses VoiceSideCar for both modes
- Best of both worlds

## Agent Workflow Execution

### Example: Banking Balance Check

1. **User**: "What's my balance?"
2. **Nova Sonic**: Converts speech to text
3. **Agent Core**: Receives text, starts workflow
4. **LangGraph**: Executes workflow nodes
5. **Decision Node**: "Does user need verification?"
6. **Claude Sonnet**: Evaluates → "Yes, not verified"
7. **Agent Core**: Triggers handoff to IDV agent
8. **Gateway**: Routes to IDV agent
9. **IDV Agent**: Collects credentials
10. **IDV Tool**: Verifies identity
11. **Gateway**: Routes back to Banking agent
12. **Banking Tool**: Checks balance
13. **Agent Core**: Formats response
14. **Nova Sonic**: Converts text to speech
15. **User**: Hears "Your balance is £1,200"

## Key Components

### Agent Core
- **File**: `agents/src/agent-core.ts`
- **Purpose**: Orchestrates workflow execution
- **Uses**: LangGraph, DecisionEvaluator, ToolsClient
- **LLM**: Claude Sonnet (via DecisionEvaluator)

### Voice Side-Car
- **File**: `agents/src/voice-sidecar.ts`
- **Purpose**: Wraps Agent Core with voice capabilities
- **Uses**: SonicClient, Agent Core
- **LLM**: Nova Sonic

### Text Adapter
- **File**: `agents/src/text-adapter.ts`
- **Purpose**: Wraps Agent Core with text-only interface
- **Uses**: SonicClient (text mode), Agent Core
- **LLM**: Nova Sonic (text-only)

### Sonic Client
- **File**: `agents/src/sonic-client.ts`
- **Purpose**: Manages Nova Sonic WebSocket connection
- **Handles**: Audio streaming, tool detection, TTS/STT
- **LLM**: Nova Sonic

### Decision Evaluator
- **File**: `agents/src/decision-evaluator.ts`
- **Purpose**: Evaluates workflow decision nodes
- **Uses**: Claude Sonnet via Bedrock Converse API
- **LLM**: Claude Sonnet

## Tool Execution Flow

```
1. Nova Sonic detects tool call in response
2. VoiceSideCar extracts tool name and parameters
3. Agent Core validates tool access
4. ToolsClient executes tool via local-tools MCP server
5. Tool result returned to Agent Core
6. Agent Core sends result back to Nova Sonic
7. Nova Sonic incorporates result into next response
8. Response converted to speech and sent to user
```

## Why Two LLMs?

### Nova Sonic (Voice Layer)
- **Strength**: Ultra-low latency speech processing
- **Weakness**: Limited reasoning capability
- **Role**: Interface layer (I/O handling)

### Claude Sonnet (Brain Layer)
- **Strength**: Superior reasoning and decision making
- **Weakness**: No native speech capabilities
- **Role**: Logic layer (workflow decisions)

## Configuration

### Agent Configuration
```yaml
environment:
  - MODE=hybrid                    # Runtime mode
  - AGENT_ID=banking              # Agent identifier
  - WORKFLOW_FILE=/app/workflow.json  # LangGraph workflow
  - AWS_ACCESS_KEY_ID=xxx         # For both Nova & Claude
  - AWS_SECRET_ACCESS_KEY=xxx
  - AWS_REGION=us-east-1
```

### Models Used
- **Nova Sonic**: `amazon.nova-2-sonic-v1:0` (voice I/O)
- **Claude Sonnet**: `anthropic.claude-3-5-sonnet-20241022-v2:0` (decisions)

## Summary

The system is a **hybrid architecture** that combines:
- **Nova Sonic** for fast, natural voice interaction
- **Claude Sonnet** for intelligent workflow decisions
- **LangGraph** for structured workflow execution
- **Agent-to-Agent** routing for specialized tasks

This gives you the best of both worlds: natural voice interaction with intelligent reasoning.
