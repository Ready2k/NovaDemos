# Requirements Document: Voice-Agnostic Agent Architecture

## Introduction

The Voice S2S project currently has two separate agent runtimes that are tightly coupled to their I/O mechanisms:
- `agent-runtime-s2s.ts` (983 lines) - Voice-first runtime requiring SonicClient for Nova Sonic integration
- `agent-runtime.ts` (200 lines) - Text-only runtime with WebSocket text I/O

This tight coupling creates significant code duplication and makes it difficult to add new agents that work across both voice and text modalities. The goal is to create a voice-agnostic agent architecture that allows developers to write business logic once and enable it for voice, text, or hybrid modes with minimal code (~10 lines).

## Glossary

- **Agent_Core**: Voice-agnostic LangGraph business logic that handles workflow execution, tool calling, and state management
- **Voice_SideCar**: Wrapper component that adds voice I/O capabilities to Agent_Core using SonicClient
- **Text_Adapter**: Wrapper component that adds WebSocket text I/O capabilities to Agent_Core
- **Unified_Runtime**: Single runtime that supports 'voice', 'text', or 'hybrid' modes via environment configuration
- **SonicClient**: Existing AWS Bedrock Nova Sonic client for bidirectional voice streaming (1,636 lines, reusable)
- **Gateway**: Voice-agnostic routing service that connects clients to agents
- **Session**: Stateful connection between client and agent with associated memory and context
- **Handoff**: Transfer of session from one agent to another with context preservation
- **Tool**: External function or service that agents can invoke (banking, IDV, knowledge base, etc.)
- **Persona**: Agent configuration including voice, system prompt, allowed tools, and metadata
- **Workflow**: LangGraph-based node graph defining agent behavior and decision logic

## Requirements

### Requirement 1: Agent Core Extraction

**User Story:** As a developer, I want to write agent business logic once without worrying about I/O mechanisms, so that I can focus on workflow logic and tool integration.

#### Acceptance Criteria

1. THE Agent_Core SHALL provide a voice-agnostic interface for agent business logic
2. WHEN Agent_Core executes workflows, THE System SHALL not depend on SonicClient or WebSocket implementations
3. THE Agent_Core SHALL expose methods for session initialization, message processing, and tool execution
4. THE Agent_Core SHALL manage LangGraph workflow execution independently of I/O layer
5. THE Agent_Core SHALL handle tool calling, handoffs, and state management without I/O coupling
6. THE Agent_Core SHALL support persona configuration including system prompts and allowed tools
7. THE Agent_Core SHALL maintain session state including verified users and user intent

### Requirement 2: Voice Side-Car Implementation

**User Story:** As a developer, I want to add voice capabilities to my agent with minimal code, so that I can enable voice interactions without rewriting business logic.

#### Acceptance Criteria

1. THE Voice_SideCar SHALL wrap Agent_Core with voice I/O using SonicClient
2. WHEN Voice_SideCar receives audio chunks, THE System SHALL forward them to SonicClient
3. WHEN SonicClient emits events, THE Voice_SideCar SHALL translate them to Agent_Core method calls
4. THE Voice_SideCar SHALL handle audio streaming, transcription, and text-to-speech
5. THE Voice_SideCar SHALL manage SonicClient lifecycle (start, stop, error handling)
6. THE Voice_SideCar SHALL forward tool use events from SonicClient to Agent_Core
7. THE Voice_SideCar SHALL support all existing voice features (interruption, sentiment, workflow updates)
8. THE Voice_SideCar SHALL maintain backward compatibility with existing voice agents

### Requirement 3: Text Adapter Implementation

**User Story:** As a developer, I want to add text capabilities to my agent with minimal code, so that I can enable text-based interactions without rewriting business logic.

#### Acceptance Criteria

1. THE Text_Adapter SHALL wrap Agent_Core with WebSocket text I/O
2. WHEN Text_Adapter receives text messages, THE System SHALL forward them to Agent_Core
3. WHEN Agent_Core generates responses, THE Text_Adapter SHALL send them via WebSocket
4. THE Text_Adapter SHALL handle session initialization and cleanup
5. THE Text_Adapter SHALL support tool execution and handoff requests
6. THE Text_Adapter SHALL maintain backward compatibility with existing text agents
7. THE Text_Adapter SHALL echo user messages as transcripts for frontend display

### Requirement 4: Unified Runtime

**User Story:** As a developer, I want a single runtime that supports voice, text, or hybrid modes, so that I can deploy agents flexibly based on use case requirements.

#### Acceptance Criteria

1. THE Unified_Runtime SHALL support 'voice', 'text', and 'hybrid' modes via MODE environment variable
2. WHEN MODE is 'voice', THE Unified_Runtime SHALL use Voice_SideCar exclusively
3. WHEN MODE is 'text', THE Unified_Runtime SHALL use Text_Adapter exclusively
4. WHEN MODE is 'hybrid', THE Unified_Runtime SHALL support both voice and text simultaneously
5. THE Unified_Runtime SHALL load workflow definitions and persona configurations
6. THE Unified_Runtime SHALL register with Gateway on startup
7. THE Unified_Runtime SHALL handle graceful shutdown for all modes
8. THE Unified_Runtime SHALL maintain session state across mode switches (for hybrid)

### Requirement 5: Easy Agent Addition

**User Story:** As a developer, I want to add a new LangGraph agent with ~10 lines of code, so that I can rapidly prototype and deploy new agent capabilities.

#### Acceptance Criteria

1. WHEN adding a new agent, THE Developer SHALL only need to create a workflow JSON file
2. WHEN adding a new agent, THE Developer SHALL only need to create a persona configuration file
3. WHEN adding a new agent, THE Developer SHALL only need to set environment variables (AGENT_ID, WORKFLOW_FILE, MODE)
4. THE System SHALL automatically load workflow and persona from configuration files
5. THE System SHALL automatically register the agent with Gateway
6. THE System SHALL automatically enable voice, text, or hybrid mode based on MODE variable
7. THE System SHALL require no code changes to agent-runtime-unified.ts for new agents

### Requirement 6: Backward Compatibility

**User Story:** As a developer, I want existing agents to migrate seamlessly to the new architecture, so that I don't break production deployments.

#### Acceptance Criteria

1. WHEN migrating existing agents, THE System SHALL preserve all existing functionality
2. THE System SHALL support all existing tool integrations (banking, IDV, handoffs, knowledge base)
3. THE System SHALL support all existing persona features (voice, system prompts, allowed tools)
4. THE System SHALL support all existing workflow features (decision nodes, state management)
5. THE System SHALL support all existing session features (verified users, user intent, memory)
6. THE System SHALL support all existing Gateway integration (registration, heartbeat, handoffs)
7. THE System SHALL maintain API compatibility with frontend clients

### Requirement 7: Code Reduction

**User Story:** As a developer, I want to reduce code duplication and maintenance burden, so that I can focus on building features instead of maintaining infrastructure.

#### Acceptance Criteria

1. THE System SHALL eliminate agent-runtime-s2s.ts (983 lines)
2. THE System SHALL eliminate agent-runtime.ts (200 lines)
3. THE System SHALL create agent-core.ts with voice-agnostic business logic
4. THE System SHALL create voice-sidecar.ts with voice I/O wrapper
5. THE System SHALL create text-adapter.ts with text I/O wrapper
6. THE System SHALL create agent-runtime-unified.ts with mode switching logic
7. THE System SHALL achieve net reduction of ~433 lines of code
8. THE System SHALL reuse existing SonicClient (1,636 lines) without modification

### Requirement 8: Tool Execution

**User Story:** As a developer, I want agents to execute tools consistently across voice and text modes, so that tool behavior is predictable and reliable.

#### Acceptance Criteria

1. THE Agent_Core SHALL handle tool execution for all tool types (handoff, banking, knowledge base)
2. WHEN a tool is called, THE Agent_Core SHALL validate tool input against tool schema
3. WHEN a tool is called, THE Agent_Core SHALL execute the tool via appropriate service (local-tools, AgentCore)
4. WHEN a tool completes, THE Agent_Core SHALL send results back to the LLM
5. THE Agent_Core SHALL handle tool errors gracefully with error messages
6. THE Agent_Core SHALL support tool result caching where appropriate
7. THE Agent_Core SHALL track tool execution for observability (Langfuse)

### Requirement 9: Handoff Management

**User Story:** As a developer, I want agents to hand off sessions to other agents seamlessly, so that users get routed to the right specialist without losing context.

#### Acceptance Criteria

1. THE Agent_Core SHALL detect handoff tool calls (transfer_to_banking, return_to_triage, etc.)
2. WHEN a handoff is requested, THE Agent_Core SHALL extract handoff context (reason, verified user, user intent)
3. WHEN a handoff is requested, THE Agent_Core SHALL send handoff_request to Gateway
4. THE Agent_Core SHALL include full LangGraph state in handoff requests
5. THE Agent_Core SHALL preserve verified user data across handoffs
6. THE Agent_Core SHALL preserve user intent across handoffs
7. THE Agent_Core SHALL support return handoffs (return_to_triage) with task completion status

### Requirement 10: Session Memory

**User Story:** As a developer, I want agents to maintain session memory across interactions, so that users don't have to repeat information.

#### Acceptance Criteria

1. THE Agent_Core SHALL store verified user data in session memory after IDV checks
2. THE Agent_Core SHALL store user intent in session memory for handoff context
3. THE Agent_Core SHALL restore session memory from Gateway on session initialization
4. WHEN session memory is updated, THE Agent_Core SHALL notify Gateway via update_memory message
5. THE Agent_Core SHALL inject session context into system prompts for LLM awareness
6. THE Agent_Core SHALL support memory keys: verified, userName, account, sortCode, userIntent
7. THE Agent_Core SHALL clear session memory on session end

### Requirement 11: Observability

**User Story:** As a developer, I want to track agent performance and behavior, so that I can debug issues and optimize agent quality.

#### Acceptance Criteria

1. THE System SHALL integrate with Langfuse for tracing and observability
2. THE System SHALL track session start and end events
3. THE System SHALL track user inputs and assistant responses
4. THE System SHALL track tool invocations and results
5. THE System SHALL track latency metrics (time to first token, total duration)
6. THE System SHALL track token usage (input, output, total)
7. THE System SHALL track interruptions and errors as events

### Requirement 12: Error Handling

**User Story:** As a developer, I want agents to handle errors gracefully, so that users get helpful error messages instead of crashes.

#### Acceptance Criteria

1. WHEN SonicClient fails to start, THE System SHALL send error message to client
2. WHEN tool execution fails, THE System SHALL send error result to LLM
3. WHEN WebSocket connection drops, THE System SHALL clean up session gracefully
4. WHEN workflow execution fails, THE System SHALL log error and notify client
5. THE System SHALL validate AWS credentials before starting voice sessions
6. THE System SHALL handle missing workflow or persona files with clear error messages
7. THE System SHALL provide stack traces in logs for debugging

### Requirement 13: Testing Support

**User Story:** As a developer, I want to test agents in isolation, so that I can verify behavior without deploying to production.

#### Acceptance Criteria

1. THE Agent_Core SHALL be testable without I/O dependencies (voice or text)
2. THE Voice_SideCar SHALL be testable with mock SonicClient
3. THE Text_Adapter SHALL be testable with mock WebSocket
4. THE System SHALL support unit tests for workflow execution
5. THE System SHALL support integration tests for tool execution
6. THE System SHALL support E2E tests for voice and text modes
7. THE System SHALL provide test fixtures for common scenarios (handoffs, tool calls, errors)
