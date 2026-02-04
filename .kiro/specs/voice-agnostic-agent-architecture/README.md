# Voice-Agnostic Agent Architecture Spec

## Overview

This spec implements a Voice Side-Car Pattern that decouples agent business logic from I/O mechanisms, enabling developers to write agents once and deploy them in voice, text, or hybrid modes with minimal code (~10 lines).

## Problem Statement

The Voice S2S project currently has two separate agent runtimes:
- `agent-runtime-s2s.ts` (983 lines) - Voice-first, requires SonicClient
- `agent-runtime.ts` (200 lines) - Text-only, no voice support

This tight coupling creates code duplication and makes it difficult to add new agents that work across both modalities.

## Solution

Implement a Voice Side-Car Pattern with four main components:

1. **Agent Core** - Voice-agnostic LangGraph business logic
2. **Voice Side-Car** - Wraps Agent Core with voice I/O via SonicClient
3. **Text Adapter** - Wraps Agent Core with WebSocket text I/O
4. **Unified Runtime** - Single entry point supporting voice, text, or hybrid modes

## Key Benefits

- **Write Once, Deploy Anywhere:** Business logic works in voice, text, or hybrid modes
- **Easy Extension:** Add new agents with ~10 lines of configuration
- **Code Reduction:** Net reduction of ~433 lines by eliminating duplication
- **Backward Compatible:** Existing agents migrate seamlessly
- **Testable:** Business logic testable without I/O dependencies

## Files in This Spec

### 📋 requirements.md
- **13 requirements** covering all aspects of the architecture
- **91 acceptance criteria** with EARS patterns (WHEN/THEN, THE System SHALL)
- Key requirements:
  - Agent Core extraction (voice-agnostic business logic)
  - Voice Side-Car implementation (wraps core with voice I/O)
  - Text Adapter implementation (wraps core with text I/O)
  - Unified Runtime (single entry point for all modes)
  - Easy agent addition (~10 lines of code)
  - Backward compatibility with existing agents
  - Code reduction (~433 lines saved)

### 🏗️ design.md
- **Architecture diagrams** showing component interaction
- **4 main components** with detailed interfaces
- **26 correctness properties** for property-based testing
- **Comprehensive error handling** strategy
- **Dual testing approach** (unit tests + property tests)
- **Test fixtures and mocks** for isolated testing

### ✅ tasks.md
- **18 top-level tasks** with detailed sub-tasks
- **All tasks are required** (comprehensive implementation)
- **26 property-based tests** mapped to design properties
- **Integration tests** for voice, text, and hybrid modes
- **Migration tasks** for existing agents (triage, banking, IDV, disputes)
- **Documentation tasks** for developer guides

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Unified Runtime                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Mode Selection (ENV: MODE = voice | text | hybrid)   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Voice        │    │ Text         │    │ Hybrid       │
│ Side-Car     │    │ Adapter      │    │ (Both)       │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Agent Core   │
                    │ (Business    │
                    │  Logic)      │
                    └──────────────┘
```

## Implementation Phases

1. **Phase 1: Extract Agent Core** (2 days)
   - Create voice-agnostic agent interface
   - Extract business logic from existing runtimes

2. **Phase 2: Create Voice Side-Car** (2 days)
   - Wrap AgentCore with voice I/O using SonicClient
   - Handle audio streaming and voice events

3. **Phase 3: Create Text Adapter** (1 day)
   - Wrap AgentCore with WebSocket text I/O
   - Handle text messages and responses

4. **Phase 4: Unified Runtime** (1 day)
   - Single runtime with mode switching
   - Gateway integration and session management

5. **Phase 5: Migration & Testing** (2 days)
   - Migrate existing agents
   - Comprehensive testing (unit, property, integration)
   - Documentation updates

**Total Duration:** ~8 days

## Success Metrics

### Technical Metrics
- Net reduction of **~433 lines of code**
- Add new agents with **~10 lines of configuration**
- **100% backward compatibility** with existing agents
- **26 property-based tests** for correctness
- **Test coverage > 80%**

### Operational Metrics
- All 4 existing agents migrate successfully
- Voice, text, and hybrid modes work correctly
- No breaking changes to Gateway or frontend
- Performance maintained or improved

## Getting Started

### Option 1: Execute All Tasks
```bash
# Tell Kiro to execute all tasks in the spec
"Run all tasks for voice-agnostic-agent-architecture"
```

### Option 2: Execute Tasks Incrementally
1. Open `tasks.md`
2. Start with Task 1: "Create Agent Core with voice-agnostic interface"
3. Tell Kiro: "Execute task 1 from voice-agnostic-agent-architecture spec"

### Option 3: Review First
1. Review `requirements.md` to understand acceptance criteria
2. Review `design.md` to understand architecture and interfaces
3. Review `tasks.md` to understand implementation approach
4. Then proceed with execution

## Related Documentation

- **IMPLEMENTATION_PLAN.md** - Original implementation plan (now references this spec)
- **docs/structure.md** - Project structure and file organization
- **docs/tech.md** - Tech stack and build system
- **.kiro/specs/README.md** - Overview of all specs in the project

## Questions?

- Review the detailed requirements in `requirements.md`
- Check the architecture and interfaces in `design.md`
- See the implementation tasks in `tasks.md`
- Consult with team leads before major changes

## Status

- **Created:** 2026-02-03
- **Status:** 📋 Ready for Implementation
- **Dependencies:** None (can start immediately)
- **Estimated Duration:** 8 days
- **Priority:** High (enables easy agent addition)

---

**Ready to start?** Open `tasks.md` and begin with Task 1!
