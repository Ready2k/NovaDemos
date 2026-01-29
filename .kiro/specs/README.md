# Specs Directory

This directory contains feature specifications for the A2A (Agent-to-Agent) migration project.

## Overview

The A2A migration is a three-phase project to complete the LangGraph-based workflow execution system and deprecate the legacy text injection mode.

**Start here:** `A2A_MIGRATION_OVERVIEW.md`

## Specs

### Phase 3: Complete LangGraph Conversion
**Status:** 📋 Planned  
**Location:** `phase3-langgraph-conversion/requirements.md`  
**Goal:** Enable true state machine workflow execution with LLM integration, tool calling, and sub-workflow support.

**Key Features:**
- LLM-powered decision nodes
- Actual tool execution
- Sub-workflow invocation
- Streaming graph execution
- Enhanced state management
- Error handling and resilience

**Duration:** 2-3 weeks

---

### Phase 4: Full A2A with Multi-Agent Orchestration
**Status:** 📋 Planned  
**Location:** `phase4-full-a2a-multi-agent/requirements.md`  
**Goal:** Build intelligent routing, context-aware handoffs, and multi-agent collaboration.

**Key Features:**
- Intelligent triage routing with intent classification
- Context-aware handoffs (preserve conversation history)
- Multi-agent consultation (agents can ask each other)
- Routing fallbacks and recovery
- User-initiated agent selection
- Unified conversation management

**Duration:** 2-3 weeks  
**Dependencies:** Phase 3 must be complete

---

### Phase 5: Deprecate Text Injection Mode
**Status:** 📋 Planned  
**Location:** `phase5-deprecate-text-injection/requirements.md`  
**Goal:** Remove legacy text injection system and fully migrate to LangGraph.

**Key Features:**
- Remove text injection code from backend
- Update frontend visualizer to use graph events
- Remove dual-mode configuration
- Staged rollout with feature flags
- Complete migration validation

**Duration:** 4 weeks  
**Dependencies:** Phase 3 and 4 must be complete

---

## How to Use These Specs

### For Implementation
1. Read the overview document first: `A2A_MIGRATION_OVERVIEW.md`
2. Review the specific phase spec you're working on
3. Follow the implementation plan step-by-step
4. Check off items in the Definition of Done

### For Planning
- Each spec includes user stories, technical requirements, and success metrics
- Use the implementation plans for sprint planning
- Refer to the timeline estimates for project scheduling

### For Review
- Each spec includes acceptance criteria for validation
- Testing strategies are defined for each phase
- Success metrics provide clear completion criteria

## Related Documentation

- `docs/WORKFLOW_VS_A2A.md` - Architecture comparison between text injection and LangGraph
- `docs/WORKFLOW_STATUS.md` - Current implementation status
- `docs/workflows.md` - Workflow system guide (needs update)

## Questions?

- Review the detailed spec for each phase
- Check existing documentation in `docs/`
- Review current implementation in codebase
- Consult with team leads before major changes

## Status Tracking

| Phase | Status | Start Date | End Date | Notes |
|-------|--------|------------|----------|-------|
| Phase 3 | 📋 Planned | TBD | TBD | - |
| Phase 4 | 📋 Planned | TBD | TBD | Depends on Phase 3 |
| Phase 5 | 📋 Planned | TBD | TBD | Depends on Phase 3 & 4 |

Last Updated: 2026-01-29
