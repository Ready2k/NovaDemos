# Integration Tests

This directory contains integration tests for the Voice-Agnostic Agent Architecture. These tests verify end-to-end functionality of the Unified Runtime in all three modes: voice, text, and hybrid.

## Test Structure

### Voice Mode Tests (`voice-mode.integration.test.ts`)
Tests complete voice interaction flow including:
- Session initialization with and without memory
- Audio input/output handling
- Tool execution in voice mode
- Handoff requests in voice mode
- Session cleanup

**Requirements:** AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) must be available for voice tests to run.

### Text Mode Tests (`text-mode.integration.test.ts`)
Tests complete text interaction flow including:
- Session initialization with and without memory
- Text input/output handling
- Multiple text inputs in sequence
- Tool execution in text mode
- Handoff requests in text mode
- Session cleanup
- Error handling (invalid JSON, missing workflow)

**Requirements:** No AWS credentials needed. Text mode works without external dependencies.

### Hybrid Mode Tests (`hybrid-mode.integration.test.ts`)
Tests hybrid mode functionality including:
- Session initialization in hybrid mode
- Audio input handling
- Text input handling
- Both audio and text in same session
- Mode switching (audio ↔ text)
- Session state preservation across mode switches
- Conversation history maintenance
- Tool execution triggered by text
- Session cleanup

**Requirements:** AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) must be available for hybrid tests to run.

## Running Tests

### Run All Integration Tests
```bash
cd agents
npm test -- tests/integration
```

### Run Specific Test Suite
```bash
# Voice mode tests
npm test -- tests/integration/voice-mode.integration.test.ts

# Text mode tests
npm test -- tests/integration/text-mode.integration.test.ts

# Hybrid mode tests
npm test -- tests/integration/hybrid-mode.integration.test.ts
```

### Run with AWS Credentials
```bash
# Set AWS credentials
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key

# Run tests
npm test -- tests/integration
```

### Run Without AWS Credentials
If AWS credentials are not available, voice and hybrid tests will be skipped automatically. Only text mode tests will run:

```bash
npm test -- tests/integration/text-mode.integration.test.ts
```

## Test Configuration

### Temporary Test Files
Each test suite creates temporary directories for test workflows, personas, and prompts:
- Voice mode: `agents/tests/temp/`
- Text mode: `agents/tests/temp-text/`
- Hybrid mode: `agents/tests/temp-hybrid/`

These directories are automatically cleaned up after tests complete.

### Test Ports
Each test uses a unique port to avoid conflicts:
- Voice mode: 8091-8097
- Text mode: 8101-8113
- Hybrid mode: 8201-8211

### Gateway URL
All tests use a non-existent gateway URL (`http://localhost:9999`) to avoid dependencies on external services. The runtime handles gateway registration failures gracefully.

## Test Fixtures

Integration tests use fixtures from `agents/tests/fixtures/`:
- `MockWebSocket`: Mock WebSocket for testing client connections
- `MockSonicClient`: Mock SonicClient for testing voice interactions (not used in integration tests, but available)
- `test-workflows.ts`: Test workflow definitions
- `test-personas.ts`: Test persona configurations
- `test-tools.ts`: Test tool definitions

## Test Coverage

### Validates Requirements
- **Requirement 13.6**: Testing Support - Integration tests for voice, text, and hybrid modes

### Tests Complete Flows
- ✅ Session initialization and cleanup
- ✅ Audio input/output (voice mode)
- ✅ Text input/output (text mode)
- ✅ Hybrid mode (voice + text simultaneously)
- ✅ Mode switching (audio ↔ text)
- ✅ Session state preservation
- ✅ Tool execution (all modes)
- ✅ Handoff requests (all modes)
- ✅ Error handling

## Notes

### LLM Behavior
Some tests involve LLM responses, which are non-deterministic. These tests verify:
- No errors occurred
- User messages were echoed correctly
- Session state is maintained

They do NOT assert on specific LLM responses or tool calls, as these depend on the LLM's behavior.

### Timeouts
Integration tests have longer timeouts (10-30 seconds) to account for:
- AWS Bedrock API calls
- SonicClient initialization
- LLM response generation
- Network latency

### Skipped Tests
Voice and hybrid mode tests are automatically skipped if AWS credentials are not available. This allows CI/CD pipelines to run text mode tests without AWS access.

## Troubleshooting

### Tests Timeout
If tests timeout, check:
- AWS credentials are valid and have Bedrock access
- Network connectivity to AWS Bedrock
- Local tools service is running (if testing tool execution)

### Port Conflicts
If you see "port already in use" errors:
- Ensure no other services are using ports 8091-8211
- Wait for previous test runs to fully clean up
- Kill any hanging processes: `lsof -ti:8091-8211 | xargs kill -9`

### AWS Credential Errors
If you see AWS credential errors:
- Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set
- Verify credentials have Bedrock access
- Check AWS_REGION is set correctly (default: us-east-1)

### Memory Leaks
If tests fail with memory errors:
- Ensure all sessions are properly cleaned up
- Check that runtime.stop() is called in afterEach
- Verify no hanging SonicClient connections

## Future Enhancements

Potential improvements for integration tests:
- Mock AWS Bedrock responses for deterministic testing
- Add performance benchmarks (latency, throughput)
- Add load testing (multiple concurrent sessions)
- Add network failure simulation
- Add tool service failure simulation
- Add Gateway integration tests (when Gateway is available)
