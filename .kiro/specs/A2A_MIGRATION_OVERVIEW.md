# A2A Migration Phases - Overview

This document provides a high-level overview of the three-phase migration plan to complete the Agent-to-Agent (A2A) system and deprecate the legacy text injection workflow system.

## Phase Summary

| Phase | Name | Status | Duration | Dependencies |
|-------|------|--------|----------|--------------|
| Phase 3 | Complete LangGraph Conversion | 📋 Planned | 2-3 weeks | None |
| Phase 4 | Full A2A with Multi-Agent | 📋 Planned | 2-3 weeks | Phase 3 |
| Phase 5 | Deprecate Text Injection | 📋 Planned | 4 weeks | Phase 3, 4 |

## Phase 3: Complete LangGraph Conversion

**Goal:** Enable true state machine workflow execution with LLM integration, tool calling, and sub-workflow support.

**Key Deliverables:**
- LLM-powered decision nodes
- Actual tool execution (not simulated)
- Sub-workflow invocation
- Streaming graph execution
- Enhanced state management
- Error handling and resilience

**Spec Location:** `.kiro/specs/phase3-langgraph-conversion/requirements.md`

**Success Criteria:**
- ✅ All decision nodes use LLM reasoning (0% → 100%)
- ✅ All tool nodes execute actual tools (0% → 100%)
- ✅ Sub-workflows execute correctly (0% → 100%)
- ✅ State persists across turns (0% → 100%)

## Phase 4: Full A2A with Multi-Agent Orchestration

**Goal:** Build intelligent routing, context-aware handoffs, and multi-agent collaboration.

**Key Deliverables:**
- Intelligent triage routing with intent classification
- Context-aware handoffs (preserve conversation history)
- Multi-agent consultation (agents can ask each other)
- Routing fallbacks and recovery
- User-initiated agent selection
- Unified conversation management

**Spec Location:** `.kiro/specs/phase4-full-a2a-multi-agent/requirements.md`

**Success Criteria:**
- ✅ Intent classification accuracy > 90%
- ✅ Context preservation rate = 100%
- ✅ Successful handoff rate > 95%
- ✅ Consultation success rate > 95%

## Phase 5: Deprecate Text Injection Mode

**Goal:** Remove legacy text injection system and fully migrate to LangGraph.

**Key Deliverables:**
- Remove text injection code from backend
- Update frontend visualizer to use graph events
- Remove dual-mode configuration
- Staged rollout with feature flags
- Complete migration validation

**Spec Location:** `.kiro/specs/phase5-deprecate-text-injection/requirements.md`

**Success Criteria:**
- ✅ All text injection code removed
- ✅ All sessions using LangGraph exclusively
- ✅ Performance metrics stable
- ✅ User satisfaction maintained

## Current Architecture State

### What Exists Today

**Two Parallel Systems:**

1. **Text Injection Mode (Legacy)**
   - Location: `backend/src/services/sonic-service.ts`
   - Workflow JSON → Text instructions
   - AI follows text and outputs `[STEP:]` tags
   - Powers Live Visualization feature
   - Used by regular backend with Nova/Sonic

2. **LangGraph Mode (Current)**
   - Location: `agents/src/`
   - Workflow JSON → LangGraph StateGraph
   - True state machine execution
   - Used by A2A agent containers
   - Partially implemented (missing LLM, tools, sub-workflows)

**Both systems use the SAME workflow JSON files** from `backend/workflows/`

### What We're Building

**Single Unified System:**
- LangGraph-only execution
- Full LLM integration for decision nodes
- Real tool calling
- Sub-workflow support
- Intelligent multi-agent routing
- Context-aware handoffs
- Agent consultation
- Simplified codebase

## Migration Strategy

### Phase 3: Foundation
Build the core LangGraph capabilities that achieve feature parity with text injection mode.

### Phase 4: Enhancement
Add A2A-specific features that go beyond what text injection could do.

### Phase 5: Cleanup
Remove legacy code and fully migrate to the new system.

## Timeline

```
Month 1: Phase 3 (LangGraph Conversion)
├─ Week 1-2: LLM Integration, Tool Execution
├─ Week 3: Sub-Workflows, State Management
└─ Week 4: Observability, Testing

Month 2: Phase 4 (Full A2A)
├─ Week 1-2: Intent Classification, Context Transfer
├─ Week 3: Agent Consultation, Routing Engine
└─ Week 4: Session Continuity, Testing

Month 3: Phase 5 (Deprecation)
├─ Week 1: Preparation (Feature Flags, Audits)
├─ Week 2: Migration (Code Removal, Updates)
├─ Week 3: Rollout (Staged 10%→100%)
└─ Week 4: Stabilization (Monitoring, Cleanup)

Total: ~3 months
```

## Key Technical Components

### Phase 3 Components
- `LLMClient` - Bedrock Nova integration
- `ToolsClient` - MCP and AgentCore tool execution
- `WorkflowLoader` - Sub-workflow management
- `GraphExecutor` - Enhanced with state persistence
- Langfuse tracing integration

### Phase 4 Components
- `IntentClassifier` - Triage routing intelligence
- `HandoffContext` - Context transfer protocol
- `ConsultationAPI` - Agent-to-agent consultation
- `RoutingEngine` - Intelligent routing with fallbacks
- Session continuity and recovery

### Phase 5 Components
- Feature flag system
- Migration monitoring
- Rollback mechanisms
- Code removal checklist

## Dependencies

### External Services
- AWS Bedrock Nova (LLM)
- Redis (state, sessions, routing)
- Langfuse (observability)
- MCP Tools Server (tool execution)
- AgentCore Gateway (external tools)

### Internal Components
- Gateway (`gateway/src/`)
- Agent Runtime (`agents/src/`)
- Workflow Definitions (`backend/workflows/`)
- Frontend Visualizer (`frontend-v2/components/chat/`)

## Risk Management

### High-Risk Areas
1. **LLM Integration** - Parsing failures, latency
2. **Tool Execution** - Timeouts, errors
3. **Context Transfer** - Data loss during handoffs
4. **Migration** - User disruption, rollback needs

### Mitigation Strategies
- Comprehensive testing at each phase
- Feature flags for gradual rollout
- Monitoring and alerting
- Rollback plans
- User communication

## Success Metrics

### Technical Metrics
- Code complexity reduction: ~30%
- Lines of code removed: ~500-1000
- Test coverage: > 80%
- Performance improvement: ~15%

### Operational Metrics
- Workflow execution success: > 95%
- Handoff success rate: > 95%
- Intent classification accuracy: > 90%
- Tool call success rate: > 95%

### User Experience Metrics
- Session success rate: > 95%
- User satisfaction: Maintained or improved
- Reduced "I already told you that" complaints
- Improved workflow visualization clarity

## Documentation

### Existing Documentation
- `docs/WORKFLOW_VS_A2A.md` - Architecture comparison
- `docs/WORKFLOW_STATUS.md` - Current implementation status
- `docs/workflows.md` - Workflow system guide (outdated)

### New Documentation (To Be Created)
- `docs/LANGGRAPH_GUIDE.md` - Developer guide for LangGraph
- `docs/A2A_ARCHITECTURE.md` - Full A2A architecture
- `docs/MIGRATION_GUIDE.md` - Operator migration guide
- `docs/LANGGRAPH_ONLY.md` - Post-migration architecture

## Getting Started

### For Phase 3 Implementation
1. Read `phase3-langgraph-conversion/requirements.md`
2. Review current implementation in `agents/src/`
3. Start with LLM integration (highest priority)
4. Follow implementation plan step-by-step

### For Phase 4 Implementation
1. Ensure Phase 3 is complete
2. Read `phase4-full-a2a-multi-agent/requirements.md`
3. Review gateway implementation in `gateway/src/`
4. Start with intent classification in triage agent

### For Phase 5 Implementation
1. Ensure Phase 3 and 4 are complete
2. Read `phase5-deprecate-text-injection/requirements.md`
3. Implement feature flag system first
4. Follow staged rollout plan carefully

## Questions or Issues?

- Review the detailed spec for each phase
- Check existing documentation in `docs/`
- Review current implementation in codebase
- Consult with team leads before major changes

## Status Updates

This section will be updated as phases progress:

- **Phase 3:** Not started
- **Phase 4:** Not started
- **Phase 5:** Not started

Last Updated: 2026-01-29
