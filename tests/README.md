# Test Suite

This directory contains all test files, scripts, and logs for the Voice S2S project.

## Test Files

### JavaScript Test Clients
- `test-client.js` - Basic test client for Nova Sonic Direct Mode
- `test-native-client.js` - Native tool capability test client
- `test-complete-native.js` - Complete native tool test
- `test-progressive-filler.js` - Progressive filler and caching system test
- `test-chat-duplication.js` - Chat response deduplication test
- `test-balance-duplication.js` - Banking balance request duplication test
- `test-internal-duplication.js` - Internal response duplication test
- `test-bedrock-agent-mode.js` - Bedrock Agent mode configuration test
- `test-bedrock-agent-simple.js` - Simple Bedrock Agent mode test
- `test-brain-mode-switching.js` - Brain mode switching verification test
- `verify-bedrock-agent-fix.js` - Bedrock Agent frontend fix verification
- `debug-test.js` - Debug mode test
- `simple-config-test.js` - Simple configuration test
- `tool-config-test.js` - Tool configuration test
- `debug-tool-config.js` - Debug tool configuration

### TypeScript Test Files
- `test-agent-core.ts` - Agent core functionality tests
- `test-agent.ts` - Agent tests
- `test-tool-logic.ts` - Tool logic tests
- `get-time-agent-core.ts` - Time agent core tests

## Test Scripts

- `run-test.sh` - Run the basic Nova Sonic test
- `run-native-test.sh` - Run the native tool capability test
- `run-chat-duplication-test.sh` - Run the chat deduplication test
- `restart.sh` - Restart the Voice S2S service

## Usage

### Running Tests

From the tests directory:

```bash
# Run basic test
./run-test.sh

# Run native tool test
./run-native-test.sh

# Restart the service
./restart.sh
```

From the project root:

```bash
# Run basic test
./tests/run-test.sh

# Run native tool test
./tests/run-native-test.sh

# Restart the service
./tests/restart.sh
```

### Individual Test Files

```bash
# From tests directory
node test-client.js
node test-native-client.js
node test-complete-native.js
# etc.
```

## Logs

All test logs are stored in the `logs/` subdirectory:
- `server.log` - Server output logs
- `test-output.log` - Test execution logs
- Various other test-specific log files

## Dependencies

The test files use the same prompt system as the main application, loading prompts from `../backend/prompts/` with the new naming convention:
- Core prompts: `core-*.txt`
- Persona prompts: `persona-*.txt`

## Notes

- All test files have been updated to work from the tests directory
- Path references have been adjusted to point to the correct backend/prompts location
- Log files are automatically organized in the logs subdirectory