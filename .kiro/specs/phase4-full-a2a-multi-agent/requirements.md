# Phase 4: Full A2A with Multi-Agent Orchestration

## Overview
Build a complete Agent-to-Agent (A2A) system with intelligent routing, context-aware handoffs, multi-agent collaboration, and unified conversation management across specialized agents.

## Prerequisites
- ✅ Phase 3 (LangGraph Conversion) must be complete
- ✅ All agents running with functional workflows
- ✅ Gateway routing operational
- ✅ State persistence working

## Current State Analysis

### What's Working ✅
- Basic handoff detection in agent runtime
- Gateway intercepts handoff requests
- Session transfer between agents
- Agent registry with health checks
- Redis-based session management

### What's Missing ❌
- **No Intelligent Routing**: Triage agent doesn't analyze intent for routing
- **No Context Preservation**: Handoffs lose conversation context
- **No Collaboration**: Agents can't consult each other without full handoff
- **No Routing Fallbacks**: No handling of unavailable agents
- **Limited Observability**: Handoffs not fully traced
- **No User Control**: Users can't request specific agents
- **No Routing Rules**: Static routing based on workflow outcomes only

## User Stories

### US-4.1: Intelligent Triage Routing
**As a** user  
**I want** the triage agent to understand my intent and route me to the right specialist  
**So that** I get expert help without manual navigation

**Acceptance Criteria:**
- Triage agent analyzes user's first message for intent
- Intent classification covers: banking, mortgage, disputes, identity verification
- Routing decision is made within 2 seconds
- User is notified which specialist they're being connected to
- Routing decision is logged with confidence score
- Supports multi-intent scenarios (e.g., "I want to dispute a charge and check my balance")

### US-4.2: Context-Aware Handoffs with S2S Continuity
**As a** user  
**I want** my conversation history AND audio session preserved when transferred between agents  
**So that** I don't have to repeat myself and experience seamless audio

**Acceptance Criteria:**
- Full conversation history transferred to new agent
- Extracted entities (account numbers, dates, amounts) preserved
- User authentication state carried over
- Workflow progress indicators transferred
- **Nova Sonic S2S session context transferred**
- **Audio session continues without dropouts**
- **New agent's voice/persona matches context**
- New agent acknowledges context: "I can see you were discussing..."
- Context includes sentiment analysis and user preferences
- Handoff latency < 500ms (audio continuity requirement)

### US-4.3: Multi-Agent Collaboration
**As a** specialist agent  
**I want** to consult other agents without full handoff  
**So that** I can provide comprehensive answers

**Acceptance Criteria:**
- Agents can invoke other agents as "consultants"
- Consultant responses returned to calling agent
- User sees seamless experience (no visible handoff)
- Consultation requests are async and non-blocking
- Supports chaining consultations (A asks B, B asks C)
- Consultation results cached for session

### US-4.4: Routing Fallbacks and Recovery
**As a** system  
**I want** to handle unavailable agents gracefully  
**So that** users always get service

**Acceptance Criteria:**
- If target agent unavailable, route to backup agent
- If no specialist available, triage agent handles request
- User is notified of any routing changes
- Failed handoffs trigger alerts
- Automatic retry with exponential backoff
- Fallback to human escalation after 3 failures

### US-4.5: User-Initiated Agent Selection
**As a** user  
**I want** to request a specific agent or department  
**So that** I have control over my experience

**Acceptance Criteria:**
- User can say "I want to speak to mortgage specialist"
- User can say "Transfer me to disputes"
- System validates agent availability before transfer
- User can return to previous agent
- Agent history tracked per session
- Supports agent preferences (e.g., "always route me to banking first")

### US-4.6: Unified Conversation Management
**As a** user  
**I want** a single conversation thread across all agents  
**So that** I have a coherent experience

**Acceptance Criteria:**
- Single conversation ID spans all agents
- Transcript shows all agent interactions
- Handoffs marked clearly in transcript
- User can review full conversation history
- Conversation can be resumed after disconnect
- Supports conversation export

## Technical Requirements

### TR-4.1: Intent Classification System
- Implement LLM-based intent classifier in triage agent
- Support multi-label classification (multiple intents)
- Return confidence scores for each intent
- Cache intent classifications for similar queries
- Support custom intent definitions per deployment

### TR-4.2: Context Transfer Protocol with S2S Session State
- Define standard context schema for handoffs
- Include: messages, entities, auth state, workflow state, sentiment, **S2S session state**
- **Include: audio session parameters (voice ID, language, conversation history)**
- Implement context serialization/deserialization
- Support partial context transfer (privacy-aware)
- Version context schema for backward compatibility
- **Implement S2S session state transfer between agents**
- **Ensure audio continuity during context transfer**

### TR-4.3: Agent Consultation API
- Create consultation request/response protocol
- Implement async consultation handling
- Support consultation timeouts (default: 5s)
- Cache consultation results per session
- Track consultation chains for debugging

### TR-4.4: Routing Engine
- Implement routing rules engine in gateway
- Support priority-based routing (e.g., VIP customers)
- Implement load balancing across agent instances
- Support agent capability matching
- Implement routing decision logging

### TR-4.5: Session Continuity
- Implement session recovery after disconnect
- Support session migration across gateway instances
- Implement session state snapshots
- Support session replay for debugging
- Add session TTL management

### TR-4.6: Observability and Tracing
- Trace full conversation across all agents
- Track handoff latency and success rate
- Monitor agent utilization and load
- Alert on routing failures
- Dashboard for real-time A2A metrics

## Implementation Plan

### Step 1: Intent Classification (2-3 days)
1. Create `IntentClassifier` class in triage agent
2. Define intent taxonomy (banking, mortgage, disputes, idv, general)
3. Implement LLM-based classification with prompt engineering
4. Add confidence scoring and multi-intent support
5. Write tests for intent classification
6. Integrate with triage workflow

### Step 2: Context Transfer Protocol (2-3 days)
1. Define `HandoffContext` schema
2. Implement context serialization in agent runtime
3. Update gateway to pass context in handoff requests
4. Update agents to consume handoff context
5. Add context validation and versioning
6. Write tests for context transfer

### Step 3: Agent Consultation API (3-4 days)
1. Create consultation request/response protocol
2. Implement consultation handler in gateway
3. Add consultation invocation to agent runtime
4. Implement consultation caching
5. Add consultation timeout handling
6. Write tests for consultation scenarios

### Step 4: Routing Engine (2-3 days)
1. Create `RoutingEngine` class in gateway
2. Implement routing rules (intent → agent mapping)
3. Add load balancing logic
4. Implement fallback routing
5. Add routing decision logging
6. Write tests for routing scenarios

### Step 5: Session Continuity (2-3 days)
1. Implement session recovery in gateway
2. Add session state snapshots to Redis
3. Implement reconnection handling
4. Add session migration support
5. Write tests for session continuity

### Step 6: Observability (2-3 days)
1. Integrate Langfuse tracing for A2A flows
2. Add handoff metrics to gateway
3. Create A2A dashboard endpoint
4. Implement alerting for routing failures
5. Write tests for observability

### Step 7: Integration Testing (3-4 days)
1. Test full A2A flows end-to-end
2. Test consultation scenarios
3. Test routing fallbacks
4. Test session continuity
5. Performance and load testing
6. Documentation updates

## Architecture Diagrams

### High-Level A2A Flow
```
User → Gateway → Triage Agent (Intent Classification)
                      ↓
                 Routing Engine
                      ↓
         ┌────────────┼────────────┐
         ↓            ↓            ↓
    Banking      Mortgage      Disputes
    Agent         Agent         Agent
         ↓            ↓            ↓
    (Consultation) ←→ (Consultation)
         ↓
    Gateway → User
```

### Context Transfer Flow
```
Agent A                Gateway              Agent B
   |                      |                    |
   |--handoff_request--→  |                    |
   |  (with context)      |                    |
   |                      |--session_init---→  |
   |                      |  (with context)    |
   |                      |                    |
   |                      |  ←--session_ack--  |
   |                      |                    |
   |  ←--handoff_ack---   |                    |
   |                      |                    |
```

### Consultation Flow
```
Agent A              Gateway              Agent B
   |                    |                    |
   |--consult_request→  |                    |
   |                    |--consult_invoke→   |
   |                    |                    |
   |                    |  ←--consult_result-|
   |  ←--consult_result-|                    |
   |                    |                    |
```

## Dependencies

### External Services
- AWS Bedrock Nova (intent classification)
- Redis (session state, routing cache)
- Langfuse (A2A tracing)

### Internal Components
- All Phase 3 components (LangGraph, tools, state management)
- Gateway routing infrastructure
- Agent registry and health checks

## Testing Strategy

### Unit Tests
- Intent classification accuracy
- Context serialization/deserialization
- Routing engine logic
- Consultation protocol

### Integration Tests
- Full handoff scenarios
- Consultation between agents
- Routing fallbacks
- Session recovery

### End-to-End Tests
- Multi-agent conversations
- Complex routing scenarios
- Load testing with concurrent sessions
- Failure recovery scenarios

## Success Metrics

### Functional Metrics
- ✅ Intent classification accuracy > 90%
- ✅ Context preservation rate = 100%
- ✅ Successful handoff rate > 95%
- ✅ Consultation success rate > 95%

### Performance Metrics
- Intent classification latency < 1s
- Handoff latency < 500ms
- Consultation latency < 5s
- Session recovery time < 2s

### User Experience Metrics
- User satisfaction with routing > 4/5
- Reduction in "I already told you that" complaints
- Reduction in manual agent selection requests

## Risks and Mitigations

### Risk: Intent Misclassification
**Mitigation:** Implement confidence thresholds and fallback to triage agent

### Risk: Context Loss During Handoff
**Mitigation:** Implement context validation and retry logic

### Risk: Consultation Timeouts
**Mitigation:** Implement async consultations with caching

### Risk: Routing Loops
**Mitigation:** Track agent history and prevent circular handoffs

### Risk: Session State Corruption
**Mitigation:** Implement state validation and recovery mechanisms

## Documentation Requirements

- Update `docs/WORKFLOW_VS_A2A.md` with Phase 4 completion status
- Create `docs/A2A_ARCHITECTURE.md` with detailed architecture
- Document intent taxonomy and routing rules
- Document context transfer protocol
- Document consultation API
- Create operator runbook for A2A troubleshooting

## Definition of Done

- [ ] All user stories implemented and tested
- [ ] All technical requirements met
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] End-to-End tests passing
- [ ] Performance benchmarks met
- [ ] Intent classification accuracy > 90%
- [ ] Handoff success rate > 95%
- [ ] Documentation complete
- [ ] Code reviewed and approved
- [ ] Deployed to staging environment
- [ ] User acceptance testing complete
- [ ] A2A dashboard operational
- [ ] Alerting configured
