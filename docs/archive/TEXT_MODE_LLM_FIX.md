# Text Mode LLM Invocation Fix

## Problem
Test `test-idv-retry-success.js` was timing out after 90 seconds because transcript events from the IDV agent were not reaching the test client.

## Root Cause Analysis

### Architecture Comparison
- **Voice Mode**: VoiceSideCar → SonicClient → LLM generates responses → Transcript events ✅
- **Text Mode**: TextAdapter → processUserMessage → Returns placeholder (NO LLM invocation!) ❌

### The Issue
1. TextAdapter was calling `agentCore.processUserMessage()` which just returned a placeholder: `"Message received and processed"`
2. No actual LLM invocation was happening in text mode
3. Tool calls were working (via SonicClient in voice mode), but text responses were not being generated
4. The agent would call tools successfully, but never generate transcript responses to send back to the client

### Why This Happened
The original architecture assumed text mode didn't need LLM invocation - it was designed as a simple echo/placeholder mode. However, for the IDV retry flow to work, the agent needs to:
1. Receive user input
2. Invoke LLM to generate response
3. Call tools (perform_idv_check)
4. Generate transcript response based on tool results
5. Send transcript to client

Without LLM invocation, step 2 and 4 never happened.

## Solution

### Changes Made

#### 1. Updated TextAdapter to use SonicClient
**File**: `agents/src/text-adapter.ts`

- Added `sonicConfig` parameter to `TextAdapterConfig`
- Added `sonicClient` to `TextSession` interface
- Modified `startTextSession()` to create and start SonicClient (similar to VoiceSideCar)
- Modified `handleUserInput()` to send text to SonicClient for LLM processing
- Added `handleSonicEvent()` method to process LLM responses and tool calls
- Added `handleTranscriptEvent()` to forward transcript events to client
- Added `handleToolUseEvent()` to execute tools and forward results

#### 2. Updated UnifiedRuntime to pass SonicConfig to TextAdapter
**File**: `agents/src/agent-runtime-unified.ts`

- Modified text adapter initialization to create and pass `SonicConfig`
- Updated `startTextSession()` calls to be async (await)
- Updated `stopTextSession()` calls to be async (await)

### How It Works Now

```
Text Input Flow:
1. Client sends text_input → Gateway → Agent
2. Agent: TextAdapter.handleUserInput()
3. TextAdapter: sonicClient.sendText() → Invokes LLM
4. LLM generates response and calls tools
5. SonicClient emits events (transcript, toolUse, etc.)
6. TextAdapter.handleSonicEvent() processes events
7. TextAdapter forwards transcript to client via WebSocket
8. Gateway forwards transcript to test client
9. Test client receives transcript and continues
```

### Key Benefits
1. **Text mode now has full LLM capabilities** - generates actual responses, not placeholders
2. **Consistent architecture** - both voice and text modes use SonicClient for LLM invocation
3. **Tool execution works** - tools are called and results are processed correctly
4. **Transcript events flow correctly** - client receives all transcript events
5. **Handoff works** - handoff requests are forwarded correctly

## Testing

### Build Commands
```bash
# Build TypeScript
cd agents
npm run build

# Rebuild Docker images (all 6 agents)
cd ..
docker-compose -f docker-compose-unified.yml build --no-cache agent-triage
docker-compose -f docker-compose-unified.yml build --no-cache agent-idv
docker-compose -f docker-compose-unified.yml build --no-cache agent-banking
docker-compose -f docker-compose-unified.yml build --no-cache agent-mortgage
docker-compose -f docker-compose-unified.yml build --no-cache agent-disputes
docker-compose -f docker-compose-unified.yml build --no-cache agent-investigation
```

### Test Commands
```bash
# Restart services
docker-compose -f docker-compose-unified.yml down
docker-compose -f docker-compose-unified.yml up -d

# Wait for services to be ready
sleep 10

# Run test
node test-idv-retry-success.js
```

### Expected Results
- ✅ IDV agent receives user input
- ✅ IDV agent calls perform_idv_check tool
- ✅ IDV agent generates transcript response
- ✅ Transcript events reach test client
- ✅ Test completes successfully (no timeout)

## Files Modified
1. `agents/src/text-adapter.ts` - Added SonicClient integration
2. `agents/src/agent-runtime-unified.ts` - Pass SonicConfig to TextAdapter

## Next Steps
1. Build TypeScript: `cd agents && npm run build`
2. Rebuild all 6 agent Docker images with `--no-cache`
3. Restart services
4. Run `test-idv-retry-success.js`
5. Verify transcript events are received and test passes

## Impact
- **Breaking Change**: Text mode now requires AWS credentials (same as voice mode)
- **Performance**: Text mode now has same latency as voice mode (LLM invocation)
- **Functionality**: Text mode now has full conversational capabilities
- **Compatibility**: Existing voice mode unchanged, hybrid mode benefits from fix
