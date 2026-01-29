# Phase 3: Complete LangGraph Conversion

## Overview
Complete the LangGraph-based workflow execution system to enable true state machine behavior with full tool calling via Nova Sonic S2S, sub-workflow support, and proper LLM integration for decision nodes.

## Architecture Clarification: Speech-to-Speech (S2S) Pattern

**Critical:** The **legacy backend** successfully implements **Nova Sonic's Speech-to-Speech (S2S) protocol**. The **A2A gateway/agents** need to replicate this architecture.

### Current Working S2S Flow (Legacy Backend):
1. **User speaks** → Audio streamed to Backend WebSocket (`/sonic`)
2. **Backend** → SonicService maintains Nova Sonic S2S session
3. **Nova Sonic** → Processes speech, executes workflow logic, calls tools
4. **Nova Sonic** → Generates speech response (audio)
5. **Backend** → Forwards audio back to user
6. **User hears** → Seamless speech-to-speech experience

### Target A2A S2S Flow (What We Need to Build):
1. **User speaks** → Audio streamed to Gateway WebSocket (`/sonic`)
2. **Gateway** → Routes audio to current agent's WebSocket
3. **Agent** → Maintains Nova Sonic S2S session (like legacy backend does)
4. **Agent** → Forwards audio to Nova Sonic
5. **Nova Sonic** → Processes speech, executes workflow logic, calls tools
6. **Nova Sonic** → Generates speech response (audio)
7. **Agent** → Receives audio + events from Nova Sonic
8. **Agent** → Forwards audio back through Gateway to user
9. **Gateway** → Streams audio to user's browser

### Key Insight

**The A2A agents need to do what the legacy backend does:**
- Maintain Nova Sonic S2S sessions (using `SonicClient`)
- Forward audio bidirectionally
- Handle tool calling via Nova Sonic S2S
- Track workflow state in LangGraph while Nova Sonic handles speech

**Agents are essentially "SonicService + LangGraph":**
- SonicService part: Manages Nova Sonic S2S session (already exists in backend)
- LangGraph part: Tracks workflow state machine (already exists in agents)
- Need to combine them!

### Key S2S Implications:

**Audio Streaming:**
- Bidirectional audio streaming must be maintained through agent handoffs
- Audio packets flow: User → Gateway → Agent → Nova Sonic → Agent → Gateway → User
- Agents are audio proxies, not audio processors

**Tool Calling:**
- Tools are called by Nova Sonic during S2S session (not by agents)
- Agents orchestrate workflow state, Nova Sonic handles speech + tools
- Tool results flow back through Nova Sonic's speech synthesis

**State Management:**
- Graph state tracks workflow position
- Nova Sonic maintains conversation context and audio session
- Handoffs must preserve both graph state AND Nova Sonic session context

**Latency Considerations:**
- Audio streaming adds latency constraints
- Graph execution must not block audio flow
- Tool calls must complete within speech interaction timeouts

### What This Means for LangGraph Integration:

**Agents DON'T:**
- Process audio directly
- Call tools directly
- Generate speech responses
- Handle STT/TTS

**Agents DO:**
- Maintain WebSocket connection to Nova Sonic
- Track workflow state in LangGraph
- Request tool execution from Nova Sonic
- Handle handoffs between agents
- Forward audio bidirectionally

**Nova Sonic DOES:**
- All speech-to-speech processing
- All tool calling via S2S protocol
- All audio streaming
- Conversation context management

## Current State Analysis

## Current State Analysis

### What's Working ✅ (Legacy Backend)
- **True S2S via Nova Sonic**: Backend maintains Nova Sonic S2S sessions
- Audio streaming: User → Backend → Nova Sonic → Backend → User
- Tool calling via Nova Sonic S2S protocol
- Workflow text injection into system prompts
- Live visualization via `[STEP:]` tags

### What's Working ✅ (A2A Gateway)
- Basic workflow JSON to LangGraph conversion (`graph-converter.ts`)
- Simple node execution with state management
- Agent container runtime with WebSocket communication
- Gateway routing and handoff detection
- Docker orchestration for 5 agents (triage, banking, mortgage, idv, disputes)
- Workflow file mounting per agent

### What's Missing ❌ (A2A Gateway)
- **No Nova Sonic S2S Integration**: Agents don't maintain Nova Sonic sessions
- **No Audio Forwarding**: Agents only process text/JSON, not audio
- **No LLM Integration**: Decision nodes use simulated outcomes
- **No Tool Execution**: Tool nodes log but don't invoke Nova Sonic S2S
- **No Sub-Workflow Support**: Workflow nodes don't invoke nested workflows
- **Limited State Management**: Context variables not properly passed
- **No Streaming Support**: Graph execution doesn't stream intermediate results
- **Missing Error Handling**: No retry logic or fallback mechanisms
- **No Observability**: Limited tracing and debugging capabilities

### The Gap
The **legacy backend** has full S2S working, but the **A2A gateway/agents** don't yet integrate with Nova Sonic. Phase 3 needs to bridge this gap by making agents maintain Nova Sonic S2S sessions just like the legacy backend does.

## User Stories

### US-3.1: LLM-Powered Decision Nodes
**As a** workflow designer  
**I want** decision nodes to use LLM reasoning to determine the next path  
**So that** conversations can dynamically branch based on user intent

**Acceptance Criteria:**
- Decision nodes invoke LLM with conversation context
- LLM output is parsed to match edge labels (Yes/No, Proceed/Decline, etc.)
- Fallback to default path if LLM output doesn't match any edge
- Decision reasoning is logged for debugging
- Supports custom decision prompts per node

### US-3.2: Tool Calling Integration via Nova Sonic S2S
**As a** workflow designer  
**I want** tool nodes to execute actual tool calls via Nova Sonic's S2S protocol  
**So that** agents can perform actions like checking balances, verifying identity, etc.

**Acceptance Criteria:**
- Tool nodes trigger Nova Sonic S2S tool execution (not direct tool calls)
- Agents send tool invocation requests to Nova Sonic
- Nova Sonic handles the actual tool execution via its S2S protocol
- Tool results from Nova Sonic are captured and stored in graph state
- Tool errors are handled gracefully with retry logic
- Tool execution time is tracked and logged
- Supports tool input parameter mapping from state
- Maintains compatibility with existing Nova Sonic tool infrastructure

### US-3.3: Sub-Workflow Execution
**As a** workflow designer  
**I want** workflow nodes to invoke nested workflows  
**So that** I can compose complex behaviors from reusable components

**Acceptance Criteria:**
- Workflow nodes load and execute sub-workflows
- Sub-workflow state is isolated but can pass results back
- Sub-workflow outcomes determine parent workflow path
- Supports recursive workflow calls (with depth limit)
- Sub-workflow execution is traced separately

### US-3.4: Streaming Graph Execution
**As a** user  
**I want** to see real-time updates as the workflow executes  
**So that** I understand what the agent is doing

**Acceptance Criteria:**
- Graph events stream to gateway in real-time
- Each node execution emits start/complete events
- LLM streaming tokens are forwarded to client
- Tool execution progress is visible
- Frontend visualizer updates in real-time

### US-3.5: Enhanced State Management
**As a** workflow designer  
**I want** rich context variables accessible across all nodes  
**So that** I can build stateful conversations

**Acceptance Criteria:**
- State includes: messages, context, extractedEntities, workflowHistory
- Nodes can read/write to context variables
- State is persisted to Redis between turns
- State can be inspected via debug API
- Supports state validation and schema enforcement

### US-3.7: S2S Session Management in Agents
**As a** system architect  
**I want** agents to properly manage Nova Sonic S2S sessions  
**So that** audio streaming and tool calling work correctly in A2A mode

**Acceptance Criteria:**
- Each agent maintains a Nova Sonic S2S session
- Audio packets are forwarded bidirectionally (user ↔ agent ↔ Nova Sonic)
- S2S session configuration includes workflow context
- Tool calls are triggered through S2S session
- Session state is preserved during workflow execution
- Audio streaming doesn't block graph execution
- S2S sessions are properly cleaned up on disconnect

### US-3.8: Audio Continuity During Handoffs
**As a** user  
**I want** seamless audio experience during agent handoffs  
**So that** I don't experience audio dropouts or disconnections

**Acceptance Criteria:**
- Audio session transitions smoothly between agents
- No audio dropouts during handoff
- User doesn't need to repeat themselves after handoff
- New agent's S2S session inherits conversation context
- Audio latency remains acceptable during handoff (< 500ms)
- Failed handoffs don't break audio session
**As a** system operator  
**I want** workflows to handle errors gracefully  
**So that** users don't experience crashes

**Acceptance Criteria:**
- Tool failures trigger retry logic (configurable max retries)
- LLM failures fall back to default responses
- Node execution timeouts are enforced
- Errors are logged with full context
- Supports error recovery nodes in workflow definition

## Technical Requirements

### TR-3.1: LLM Integration
- Integrate AWS Bedrock Nova for decision node reasoning
- Support streaming LLM responses
- Implement prompt templates for decision nodes
- Cache LLM responses for identical inputs (optional optimization)

### TR-3.2: Tool Execution via Nova Sonic S2S
- Integrate with Nova Sonic's Server-to-Server (S2S) tool calling protocol
- Agent sends tool invocation requests to Nova Sonic
- Nova Sonic executes tools and returns results
- Implement tool result validation
- Add tool execution metrics (latency, success rate)
- Maintain compatibility with existing tool infrastructure (MCP, AgentCore Gateway)
- Support both synchronous and asynchronous tool execution

### TR-3.3: Sub-Workflow Support
- Implement workflow loader that caches workflow definitions
- Create sub-graph executor that inherits parent state
- Define sub-workflow outcome mapping to parent edges
- Prevent infinite recursion (max depth: 3)

### TR-3.4: State Persistence
- Store graph state in Redis after each node execution
- Implement state serialization/deserialization
- Support state snapshots for debugging
- Add state TTL (default: 1 hour)

### TR-3.5: Observability
- Integrate Langfuse tracing for graph execution
- Log each node execution with timing
- Capture LLM prompts and responses
- Track tool calls and results
- Export execution traces for analysis

### TR-3.6: Testing Infrastructure
- Unit tests for graph converter
- Integration tests for full workflow execution
- Mock LLM and tool responses for deterministic testing
- Performance benchmarks for graph execution

### TR-3.7: S2S Session Management
- Each agent initializes Nova Sonic S2S session on connection
- Audio packets forwarded bidirectionally without processing
- S2S session configuration includes workflow-specific prompts
- Session state synchronized with graph state
- Proper session cleanup on disconnect or handoff
- Audio streaming runs in parallel with graph execution (non-blocking)

### TR-3.8: Audio Continuity During Handoffs
- Implement session transfer protocol for S2S sessions
- New agent initializes S2S session with inherited context
- Audio buffering during handoff transition (< 500ms)
- Fallback to previous agent if new agent S2S session fails
- Monitor audio latency and quality during handoffs

## Implementation Plan

### Step 1: LLM Integration (2-3 days)
1. Create `LLMClient` class for Bedrock Nova integration
2. Update `graph-converter.ts` to inject LLM calls into decision nodes
3. Implement prompt template system for decision nodes
4. Add streaming support for LLM responses
5. Write unit tests for LLM integration

### Step 2: Tool Execution via Nova Sonic S2S (2-3 days)
1. Understand Nova Sonic's S2S tool calling protocol
2. Update `graph-converter.ts` to inject Nova Sonic S2S calls into tool nodes
3. Implement request/response handling for tool execution
4. Implement tool result validation and error handling
5. Add retry logic for failed tool calls
6. Write integration tests for tool execution via S2S

### Step 3: Sub-Workflow Support (2-3 days)
1. Create `WorkflowLoader` class to cache workflow definitions
2. Implement sub-graph execution in `graph-executor.ts`
3. Add outcome mapping from sub-workflow to parent
4. Implement recursion depth limiting
5. Write tests for nested workflow execution

### Step 4: State Management (1-2 days)
1. Implement Redis state persistence in `graph-executor.ts`
2. Add state serialization/deserialization
3. Create state inspection API endpoint
4. Add state TTL configuration
5. Write tests for state persistence

### Step 5: Observability (1-2 days)
1. Integrate Langfuse tracing into graph executor
2. Add node execution logging
3. Capture LLM and tool call traces
4. Create debug dashboard endpoint
5. Write tests for tracing

### Step 6: Error Handling (1-2 days)
1. Implement retry logic for tool calls
2. Add timeout enforcement for node execution
3. Create error recovery mechanisms
4. Add comprehensive error logging
5. Write tests for error scenarios

### Step 7: Integration Testing (2-3 days)
1. Test full workflow execution end-to-end
2. Test handoff scenarios between agents
3. Performance testing and optimization
4. Load testing with multiple concurrent sessions
5. Documentation updates

### Step 8: S2S Session Management (2-3 days)
1. Implement Nova Sonic S2S session initialization in agent runtime
2. Add audio packet forwarding (bidirectional)
3. Integrate workflow context into S2S session config
4. Implement session cleanup on disconnect
5. Test audio streaming with graph execution
6. Write tests for S2S session management

### Step 9: Audio Continuity for Handoffs (2-3 days)
1. Design S2S session transfer protocol
2. Implement context inheritance for new agent S2S sessions
3. Add audio buffering during handoff
4. Implement fallback mechanisms
5. Test handoff audio continuity
6. Monitor and optimize audio latency

## Dependencies

### External Services
- AWS Bedrock Nova (LLM for decisions AND S2S tool calling)
- Redis (state persistence)
- Langfuse (observability)
- MCP Tools Server (via Nova Sonic S2S)
- AgentCore Gateway (via Nova Sonic S2S)

### Internal Components
- Nova Sonic S2S protocol (tool execution)
- `agents/src/tools-client.ts` (may need updates for S2S)
- `gateway/` (already exists)
- `backend/workflows/*.json` (workflow definitions)

## Testing Strategy

### Unit Tests
- Graph converter logic
- LLM client integration
- Tool execution logic
- State serialization
- Error handling

### Integration Tests
- Full workflow execution
- Sub-workflow invocation
- Tool calling with mock responses
- State persistence and recovery
- Handoff scenarios

### End-to-End Tests
- Complete conversation flows
- Multi-agent handoffs
- Error recovery scenarios
- Performance benchmarks

## Success Metrics

### Functional Metrics
- ✅ All decision nodes use LLM reasoning (0% → 100%)
- ✅ All tool nodes execute via Nova Sonic S2S (0% → 100%)
- ✅ Sub-workflows execute correctly (0% → 100%)
- ✅ State persists across turns (0% → 100%)

### Performance Metrics
- Graph execution latency < 500ms per node
- LLM response time < 2s for decision nodes
- Tool execution time < 1s average
- State persistence overhead < 50ms

### Reliability Metrics
- Tool call success rate > 95%
- Error recovery success rate > 90%
- Zero crashes from workflow execution errors

## Risks and Mitigations

### Risk: LLM Output Parsing Failures
**Mitigation:** Implement robust parsing with fallback to default paths

### Risk: Tool Execution Timeouts
**Mitigation:** Implement timeout enforcement and retry logic

### Risk: State Persistence Failures
**Mitigation:** Implement in-memory fallback and state recovery

### Risk: Performance Degradation
**Mitigation:** Implement caching and optimize Redis operations

## Documentation Requirements

- Update `docs/WORKFLOW_VS_A2A.md` with Phase 3 completion status
- Create `docs/LANGGRAPH_GUIDE.md` with developer guide
- Document LLM prompt templates
- Document tool calling conventions
- Create troubleshooting guide

## Definition of Done

- [ ] All user stories implemented and tested
- [ ] All technical requirements met
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] End-to-end tests passing
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Code reviewed and approved
- [ ] Deployed to staging environment
- [ ] User acceptance testing complete
