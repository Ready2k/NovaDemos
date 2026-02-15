# Architecture Confirmation & Test Page Summary

## Architecture Confirmed ✅

### Two-Layer LLM Architecture

The Voice S2S system uses **two different LLMs** working together:

#### Layer 1: Voice Wrapper (Nova Sonic)
- **Model**: `amazon.nova-2-sonic-v1:0`
- **Purpose**: Speech-to-speech interface
- **Responsibilities**:
  - Speech-to-text (streaming)
  - Text-to-speech (streaming)
  - Audio I/O handling
  - Tool call detection
- **Location**: `agents/src/sonic-client.ts`
- **Latency**: <500ms

#### Layer 2: Agent Brain (Claude Sonnet)
- **Model**: `anthropic.claude-3-5-sonnet-20241022-v2:0`
- **Purpose**: Workflow decision making
- **Responsibilities**:
  - Evaluates LangGraph decision nodes
  - Determines workflow paths
  - Context-aware routing
  - Complex reasoning
- **Location**: `agents/src/decision-evaluator.ts`
- **Quality**: Superior reasoning capability

### Why Two LLMs?

```
┌─────────────────────────────────────────────────────────┐
│                    USER INPUT                           │
│                   "What's my balance?"                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              NOVA SONIC (Voice Layer)                   │
│  • Converts speech to text: "What's my balance?"        │
│  • Fast, low latency                                    │
│  • Limited reasoning                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              AGENT CORE (LangGraph)                     │
│  • Receives text input                                  │
│  • Executes workflow nodes                              │
│  • Encounters decision node: "Verified?"                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         CLAUDE SONNET (Decision Layer)                  │
│  • Analyzes context and conversation                    │
│  • Evaluates: "User not verified"                       │
│  • Decides: "Route to IDV agent"                        │
│  • Superior reasoning                                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              AGENT CORE (Continues)                     │
│  • Executes handoff to IDV                              │
│  • After verification, checks balance                   │
│  • Formats response: "Your balance is £1,200"           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              NOVA SONIC (Voice Layer)                   │
│  • Converts text to speech                              │
│  • Streams audio to user                                │
│  • Fast, natural voice                                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    USER OUTPUT                          │
│              🔊 "Your balance is £1,200"                │
└─────────────────────────────────────────────────────────┘
```

### Key Insight

- **Nova Sonic**: Fast interface (I/O) but limited reasoning
- **Claude Sonnet**: Intelligent brain (decisions) but no voice
- **Together**: Natural voice + intelligent workflows

---

## New Test Page Created ✅

### Agent Test Console

**URL**: http://localhost:3000/agent-test

### Purpose

Test agents **directly** without the voice wrapper to demonstrate:
1. **Agent Core** (LangGraph workflows) working independently
2. **Claude Sonnet** making workflow decisions
3. **Tool execution** functioning correctly
4. **Text-only mode** (no Nova Sonic voice layer)

### Features

#### Agent Selection
- Triage Agent (port 8081)
- Banking Agent (port 8082)
- Mortgage Agent (port 8083)
- IDV Agent (port 8084)
- Disputes Agent (port 8085)
- Investigation Agent (port 8086)

#### Direct Connection
- Bypasses Gateway
- Connects directly to agent WebSocket
- Text-only communication
- Shows pure LangGraph execution

#### Architecture Indicator
Shows what's active in this mode:
- ✅ Agent Core (LangGraph)
- ✅ Claude Sonnet (Decisions)
- ✅ Tools Execution
- ❌ Nova Sonic (Voice)
- ❌ Gateway Routing

### How to Use

1. Navigate to http://localhost:3000/agent-test
2. Select an agent from the left panel
3. Click "Connect"
4. Type messages in the chat input
5. Observe:
   - Agent responses (text only)
   - Tool executions (🔧 indicators)
   - Tool results (✅ indicators)
   - System messages

### What This Proves

#### Standard Agent Mode (Text)
```
User Input (Text) → Agent Core → Claude (decisions) → Tools → Response (Text)
```
- No voice processing
- Pure LangGraph workflow execution
- Claude Sonnet making decisions
- Tools executing correctly

#### Voice Wrapper Mode (Main App)
```
User Input (Audio) → Nova Sonic (STT) → Agent Core → Claude (decisions) → 
Tools → Nova Sonic (TTS) → Response (Audio)
```
- Voice processing added
- Same Agent Core underneath
- Same Claude Sonnet decisions
- Same tool execution
- Nova Sonic wraps it all

### Testing Scenarios

#### Test 1: Banking Agent (Pre-verified)
```
Connect to: Banking Agent
Message: "What's my balance?"
Expected: Balance returned immediately (pre-verified in test mode)
```

#### Test 2: IDV Agent
```
Connect to: IDV Agent
Message: "I need to verify my identity"
Expected: Asks for account number and sort code
```

#### Test 3: Triage Agent
```
Connect to: Triage Agent
Message: "I want to check my balance"
Expected: Routes to banking (via handoff tool)
```

---

## Outstanding Issues

### Issue 1: Duplicate Messages ❌
**Status**: NOT FIXED
**Impact**: Every message appears twice in main app
**Next Steps**: 
- Add console logging to see message IDs
- Debug deduplication logic
- Verify updateMessageById function

### Issue 2: Nova Sonic Crash on Large Results ❌
**Status**: CRITICAL
**Impact**: Session crashes when tool returns >2000 characters
**Solution**: Add result truncation in sonic-client.ts
**Priority**: HIGH

### Issue 3: Audio Working ✅
**Status**: FIXED (confirmed by user)
**Note**: Audio playback is now functional

---

## Files Created

1. **ARCHITECTURE.md** - Complete architecture documentation
2. **frontend-v2/app/agent-test/page.tsx** - Agent test console
3. **ARCHITECTURE_AND_TEST_SUMMARY.md** - This file

---

## Next Steps

### Priority 1: Fix Nova Sonic Crash
Add result size limit in `agents/src/sonic-client.ts`:
```typescript
// Before sending tool result to Nova Sonic
const MAX_RESULT_SIZE = 2000;
if (resultString.length > MAX_RESULT_SIZE) {
    result = {
        summary: resultString.substring(0, MAX_RESULT_SIZE),
        truncated: true,
        originalSize: resultString.length
    };
}
```

### Priority 2: Fix Duplicate Messages
Debug the deduplication logic:
1. Add console.log to show message IDs
2. Verify IDs are stable
3. Check updateMessageById is working
4. Investigate if messages come from multiple sources

### Priority 3: Test Agent Console
Use the new test page to verify:
1. Agents work without voice wrapper
2. LangGraph workflows execute correctly
3. Claude Sonnet makes decisions
4. Tools execute successfully
5. Text-only mode is stable

---

## URLs

- **Main App**: http://localhost:3000 (Voice + Text with Gateway)
- **Agent Test**: http://localhost:3000/agent-test (Text-only, Direct)
- **Gateway**: http://localhost:8080
- **Agents**: 
  - Triage: ws://localhost:8081
  - Banking: ws://localhost:8082
  - Mortgage: ws://localhost:8083
  - IDV: ws://localhost:8084
  - Disputes: ws://localhost:8085
  - Investigation: ws://localhost:8086

---

## Summary

✅ **Architecture Confirmed**: Two-layer LLM system (Nova Sonic + Claude Sonnet)
✅ **Test Page Created**: Direct agent testing without voice wrapper
✅ **Audio Working**: Voice mode functional
❌ **Duplicate Messages**: Still need to fix
❌ **Nova Sonic Crash**: Need to add result truncation

The system demonstrates a sophisticated architecture where Nova Sonic provides fast, natural voice interaction while Claude Sonnet handles intelligent workflow decisions. The new test page allows you to verify that agents work correctly in text-only mode, proving the separation between the voice wrapper and the agent brain.
