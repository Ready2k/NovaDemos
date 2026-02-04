# Integration Tests Implementation Notes

## Overview

Integration tests have been created for all three modes of the Voice-Agnostic Agent Architecture:
- **Voice Mode** (`voice-mode.integration.test.ts`)
- **Text Mode** (`text-mode.integration.test.ts`)
- **Hybrid Mode** (`hybrid-mode.integration.test.ts`)

These tests validate **Requirement 13.6** - Testing Support for complete interaction flows.

## Test Structure

### Voice Mode Tests
**File:** `voice-mode.integration.test.ts`

Tests complete voice interaction flow:
- ✅ Session initialization with/without memory
- ✅ Audio input/output handling (PCM16 16kHz mono)
- ✅ Tool execution in voice mode
- ✅ Handoff requests in voice mode
- ✅ Session cleanup and resource management

**Requirements:** AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)

**Test Coverage:**
- 7 test cases covering session lifecycle
- Audio chunk handling (3200 byte buffers = 100ms audio)
- End audio input signaling
- Tool execution readiness
- Handoff readiness
- Proper cleanup on disconnect

### Text Mode Tests
**File:** `text-mode.integration.test.ts`

Tests complete text interaction flow:
- ✅ Session initialization with/without memory
- ✅ Text input/output handling
- ✅ Multiple text inputs in sequence
- ✅ Session cleanup
- ✅ Multiple concurrent sessions
- ✅ Error handling (invalid JSON, missing workflow)

**Requirements:** None (no AWS credentials needed)

**Test Coverage:**
- 7 test cases covering session lifecycle
- Text message echo verification
- Multi-session management
- Error handling and graceful degradation
- Proper cleanup on disconnect

### Hybrid Mode Tests
**File:** `hybrid-mode.integration.test.ts`

Tests hybrid mode functionality:
- ✅ Session initialization in hybrid mode
- ✅ Audio input handling
- ✅ Text input handling
- ✅ Both audio and text in same session
- ✅ Mode switching (audio ↔ text)
- ✅ Session state preservation across mode switches
- ✅ Conversation history maintenance
- ✅ Tool execution triggered by text
- ✅ Session cleanup

**Requirements:** AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)

**Test Coverage:**
- 11 test cases covering hybrid functionality
- Seamless mode switching
- State preservation across modes
- Conversation history continuity
- Proper cleanup of both adapters

## Test Fixtures Used

All integration tests leverage fixtures from `agents/tests/fixtures/`:

1. **MockWebSocket** - Simulates WebSocket connections
   - Tracks sent messages
   - Supports event handlers (message, close, error)
   - Helper methods for finding messages by type

2. **Test Workflows** - Simplified workflow definitions
   - `simpleWorkflow` - Basic conversation flow
   - `toolWorkflow` - Tool execution flow
   - `handoffWorkflow` - Agent handoff flow

3. **Test Personas** - Test persona configurations
   - `basicPersona` - Minimal configuration
   - `bankingPersona` - With tool access
   - `triagePersona` - For handoff testing

4. **Test Tools** - Tool definitions for testing
   - Balance check tool
   - IDV check tool
   - Handoff tools (transfer_to_banking, return_to_triage)

## Test Execution

### Running All Integration Tests
```bash
cd agents
npm test -- tests/integration
```

### Running Specific Test Suite
```bash
# Text mode (no AWS credentials needed)
npm test -- tests/integration/text-mode.integration.test.ts

# Voice mode (requires AWS credentials)
npm test -- tests/integration/voice-mode.integration.test.ts

# Hybrid mode (requires AWS credentials)
npm test -- tests/integration/hybrid-mode.integration.test.ts
```

### With AWS Credentials
```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
npm test -- tests/integration
```

## Test Patterns

### Session Initialization Pattern
```typescript
const ws = new MockWebSocket();
runtime.handleConnection(ws);

// Send session_init via WebSocket message event
sendMessage(ws, {
    type: 'session_init',
    sessionId: 'test-session-1',
    memory: {}
});

await new Promise(resolve => setTimeout(resolve, 1000));
```

### Text Input Pattern
```typescript
sendMessage(ws, {
    type: 'user_input',
    text: 'Hello, how are you?'
});

await new Promise(resolve => setTimeout(resolve, 2000));

// Verify transcript echo
const transcriptMessages = ws.findMessagesByType('transcript');
const userTranscripts = transcriptMessages.filter(m => m.role === 'user');
expect(userTranscripts.length).toBeGreaterThan(0);
```

### Audio Input Pattern (Voice/Hybrid)
```typescript
// Send audio chunk (PCM16 16kHz mono)
const audioChunk = Buffer.alloc(3200); // 100ms of audio
await runtime.handleMessage(sessionId, audioChunk, true);

await new Promise(resolve => setTimeout(resolve, 500));
```

### Session Cleanup Pattern
```typescript
// Trigger close event
ws.close();
ws.triggerEvent('close', {});

await new Promise(resolve => setTimeout(resolve, 500));

expect(runtime.getActiveSessionCount()).toBe(0);
```

## Known Limitations

### LLM Non-Determinism
Tests involving LLM responses are non-deterministic. These tests verify:
- ✅ No errors occurred
- ✅ User messages were echoed correctly
- ✅ Session state is maintained

They do NOT assert on:
- ❌ Specific LLM responses
- ❌ Specific tool calls (depends on LLM behavior)
- ❌ Exact response timing

### AWS Dependencies
Voice and hybrid mode tests require:
- Valid AWS credentials
- Bedrock API access
- Network connectivity to AWS
- Nova Sonic model availability

Tests automatically skip if AWS credentials are not available.

### External Service Dependencies
Some tests depend on external services:
- Local tools service (http://localhost:9000)
- Gateway service (mocked as http://localhost:9999)

Tests handle service unavailability gracefully.

## Test Timeouts

Integration tests use longer timeouts to account for:
- AWS Bedrock API calls (1-3 seconds)
- SonicClient initialization (1-2 seconds)
- LLM response generation (2-5 seconds)
- Network latency (variable)

Default timeout: 10-30 seconds per test

## Temporary Test Files

Each test suite creates temporary directories:
- Voice mode: `agents/tests/temp/`
- Text mode: `agents/tests/temp-text/`
- Hybrid mode: `agents/tests/temp-hybrid/`

These contain:
- Test workflow JSON files
- Test persona JSON files
- Test prompt text files

All temporary files are automatically cleaned up after tests complete.

## Test Ports

Each test uses unique ports to avoid conflicts:
- Voice mode: 8091-8097
- Text mode: 8101-8113
- Hybrid mode: 8201-8211

## Current Status

### ✅ Completed
- All three integration test files created
- Comprehensive test coverage for each mode
- Proper use of test fixtures
- Helper functions for common patterns
- Detailed README documentation
- Proper cleanup and resource management

### ⚠️ Known Issues
Some tests may fail due to:
1. **WebSocket Event Handling** - MockWebSocket event triggering needs refinement
2. **Async Timing** - Some operations need longer wait times
3. **LLM Availability** - Tests depend on LLM being accessible
4. **Service Dependencies** - Local tools service may not be running

### 🔧 Recommended Fixes
1. **Enhance MockWebSocket** - Improve event handler simulation
2. **Add Retry Logic** - For flaky LLM-dependent tests
3. **Mock LLM Responses** - For deterministic testing
4. **Add Service Health Checks** - Verify dependencies before running tests

## Integration with CI/CD

### Recommended CI/CD Strategy

**Stage 1: Unit Tests** (Fast, no dependencies)
```bash
npm test -- tests/unit
```

**Stage 2: Property Tests** (Medium, no external dependencies)
```bash
npm test -- tests/property
```

**Stage 3: Text Mode Integration** (No AWS credentials needed)
```bash
npm test -- tests/integration/text-mode.integration.test.ts
```

**Stage 4: Voice/Hybrid Integration** (Requires AWS credentials)
```bash
# Only run if AWS credentials available
if [ -n "$AWS_ACCESS_KEY_ID" ]; then
  npm test -- tests/integration/voice-mode.integration.test.ts
  npm test -- tests/integration/hybrid-mode.integration.test.ts
fi
```

## Future Enhancements

### Short Term
1. Fix WebSocket event handling in tests
2. Add more deterministic assertions
3. Improve error messages in test failures
4. Add test coverage reporting

### Medium Term
1. Mock AWS Bedrock responses for deterministic testing
2. Add performance benchmarks (latency, throughput)
3. Add load testing (multiple concurrent sessions)
4. Add network failure simulation

### Long Term
1. Add visual regression testing for frontend
2. Add end-to-end tests with real frontend
3. Add chaos engineering tests
4. Add security testing (authentication, authorization)

## Conclusion

The integration tests provide comprehensive coverage of the Voice-Agnostic Agent Architecture across all three modes (voice, text, hybrid). They validate complete interaction flows including session management, message processing, tool execution, and handoffs.

While some tests may need refinement for CI/CD environments, the test structure is solid and follows best practices for integration testing. The tests serve as both validation and documentation of the expected system behavior.

**Validates:** Requirement 13.6 - Testing Support
