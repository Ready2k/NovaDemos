# Rebuild Strategy: Chat First, Then Voice

## Goal
Take a LangGraph agent and add a voice layer via Nova2Sonic.

## Architecture Decision

We evaluated two options:
1. **Single voice gateway** - One gateway handles all voice, routes to text agents
2. **Nova2Sonic wrapper per agent** - Each agent has its own voice wrapper

**Decision**: Nova2Sonic wrapper per agent (current unified approach is correct)

## Problem Analysis

The unified architecture is **conceptually correct** but has implementation bugs:
- ✅ Right idea: Each agent can have voice
- ✅ Right idea: Gateway routes between agents
- ❌ Bug: Hybrid mode starting both adapters
- ❌ Bug: JSON parsing errors
- ❌ Bug: Audio not playing

## Rebuild Plan

### Phase 1: Get Chat Working (Text-Only)
**Goal**: Prove the multi-agent architecture works without voice complexity

#### Step 1.1: Set All Agents to TEXT Mode
```yaml
# docker-compose-unified.yml
agent-triage:
  environment:
    - MODE=text  # Changed from hybrid
    
agent-banking:
  environment:
    - MODE=text  # Changed from hybrid
```

**Why**: Remove voice complexity, focus on agent logic and handoffs

#### Step 1.2: Test Text-Only Flow
1. User sends text message
2. Triage agent receives it
3. Triage determines intent
4. Triage hands off to banking agent
5. Banking agent responds
6. Response shows in UI

**Success Criteria**:
- ✅ Messages flow through gateway
- ✅ Agents receive and respond
- ✅ Handoffs work
- ✅ No JSON errors
- ✅ No duplication

### Phase 2: Add Voice to ONE Agent
**Goal**: Prove Nova2Sonic wrapper works on a single agent

#### Step 2.1: Enable Voice on Triage Only
```yaml
agent-triage:
  environment:
    - MODE=voice  # Enable voice
    
agent-banking:
  environment:
    - MODE=text   # Keep text-only
```

#### Step 2.2: Test Voice → Text Handoff
1. User speaks to triage (voice)
2. Triage processes voice input
3. Triage hands off to banking (text)
4. Banking responds (text)
5. Response shows in UI

**Success Criteria**:
- ✅ Voice input works on triage
- ✅ Audio plays from triage
- ✅ Handoff to text agent works
- ✅ Mixed mode (voice + text) works

### Phase 3: Add Voice to All Agents
**Goal**: Full voice-enabled multi-agent system

#### Step 3.1: Enable Voice on All Agents
```yaml
agent-triage:
  environment:
    - MODE=voice
    
agent-banking:
  environment:
    - MODE=voice
```

#### Step 3.2: Test Full Voice Flow
1. User speaks to triage (voice)
2. Triage hands off to banking (voice)
3. Banking responds (voice)
4. Audio plays throughout

**Success Criteria**:
- ✅ Voice works on all agents
- ✅ Voice-to-voice handoffs work
- ✅ Audio plays continuously
- ✅ No interruptions or gaps

## Current Issues to Fix

### Issue 1: Hybrid Mode Bug
**Problem**: Hybrid mode starts both voice AND text adapters, causing duplication

**Fix**: Already applied - hybrid mode now only uses voice adapter

**Status**: ✅ Fixed

### Issue 2: JSON Parsing Errors
**Problem**: Frontend sending malformed data or binary data misidentified as JSON

**Fix**: Added better error handling with logging

**Status**: ⚠️ Needs testing

### Issue 3: Audio Not Playing
**Problem**: Transcripts show but audio doesn't play

**Possible Causes**:
1. SonicClient not generating audio
2. Audio chunks not being sent
3. Frontend not receiving audio
4. Frontend not playing audio

**Fix**: Need to debug in text mode first, then add voice

**Status**: ❌ Not fixed yet

## Implementation Steps

### Step 1: Switch to Text Mode (COMPLETED ✅)

**File**: `docker-compose-unified.yml`

All agents have been changed from `MODE=hybrid` to `MODE=text`:

```yaml
agent-triage:
  environment:
    - MODE=text  # ✅ Changed

agent-banking:
  environment:
    - MODE=text  # ✅ Changed

agent-mortgage:
  environment:
    - MODE=text  # ✅ Changed

agent-idv:
  environment:
    - MODE=text  # ✅ Changed

agent-disputes:
  environment:
    - MODE=text  # ✅ Changed

agent-investigation:
  environment:
    - MODE=text  # ✅ Changed
```

### Step 2: Rebuild and Test

```bash
# Rebuild with text mode
docker-compose -f docker-compose-unified.yml build

# Start services
docker-compose -f docker-compose-unified.yml up -d

# Watch logs
docker-compose -f docker-compose-unified.yml logs -f agent-triage agent-banking
```

### Step 3: Test Chat Flow

1. Open `http://localhost:3000`
2. Type (don't speak): "What's my balance?"
3. Verify:
   - ✅ Message appears in UI
   - ✅ Triage agent responds
   - ✅ Handoff to banking happens
   - ✅ Banking agent responds
   - ✅ No errors in logs

### Step 4: Once Chat Works, Add Voice

After chat is working perfectly:

1. Change triage to `MODE=voice`
2. Test voice input
3. Verify audio plays
4. Add voice to other agents one by one

## Why This Approach Works

### Separation of Concerns
- **Agent logic** (LangGraph, tools, workflows) - Works in text mode
- **Voice layer** (Nova2Sonic) - Added after agent logic works

### Incremental Validation
- Test each layer independently
- Know exactly what breaks when
- Easy to debug

### Proven Pattern
- Text mode is simpler and more reliable
- Voice is just an I/O wrapper
- Agent logic doesn't change

## Architecture Layers

```
┌─────────────────────────────────────┐
│         Frontend (Browser)          │
│  - WebSocket client                 │
│  - Audio recording/playback         │
└─────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────┐
│      Gateway (Router)               │
│  - Routes messages to agents        │
│  - Manages handoffs                 │
└─────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        ↓                 ↓
┌──────────────┐  ┌──────────────┐
│ Agent-Triage │  │Agent-Banking │
│              │  │              │
│ ┌──────────┐ │  │ ┌──────────┐ │
│ │Voice     │ │  │ │Voice     │ │  ← Phase 3
│ │Wrapper   │ │  │ │Wrapper   │ │
│ │(Optional)│ │  │ │(Optional)│ │
│ └──────────┘ │  │ └──────────┘ │
│      ↓       │  │      ↓       │
│ ┌──────────┐ │  │ ┌──────────┐ │
│ │Agent Core│ │  │ │Agent Core│ │  ← Phase 1
│ │(LangGraph│ │  │ │(LangGraph│ │
│ │ + Tools) │ │  │ │ + Tools) │ │
│ └──────────┘ │  │ └──────────┘ │
└──────────────┘  └──────────────┘
```

## Success Metrics

### Phase 1 (Text Mode)
- [ ] Chat messages flow through system
- [ ] Agents respond correctly
- [ ] Handoffs work
- [ ] No errors in logs
- [ ] No message duplication

### Phase 2 (Voice on One Agent)
- [ ] Voice input works
- [ ] Audio output plays
- [ ] Transcripts appear
- [ ] Handoff to text agent works

### Phase 3 (Voice on All Agents)
- [ ] Voice works on all agents
- [ ] Voice-to-voice handoffs work
- [ ] Audio plays continuously
- [ ] Full banking flow completes

## Next Action

**Immediate**: Switch all agents to `MODE=text` and test chat flow.

Once chat works perfectly, we add voice layer incrementally.
