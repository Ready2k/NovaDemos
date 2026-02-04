# Balance Check Test - Progress Report

## Test Objective
Verify that the banking balance check works correctly for:
- Customer ID: 12345678
- Sort Code: 112233
- Expected Balance: £1200

## Fixes Implemented ✅

### 1. AgentCore Gateway Configuration
**Problem**: AgentCore Gateway URL was incorrectly set to an ARN instead of HTTPS endpoint

**Solution**:
- Fixed `.env` file: Changed `AGENTCORE_GATEWAY_URL` from ARN to `https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp`
- Added AgentCore environment variables to `local-tools` service in `docker-compose-unified.yml`:
  ```yaml
  - AGENTCORE_GATEWAY_URL=${AGENTCORE_GATEWAY_URL}
  - AWS_REGION=${AWS_REGION:-us-east-1}
  - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
  - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
  ```

**Result**: Local-tools now shows `✅ AgentCore credentials available`

### 2. Circuit Breaker for Infinite Tool Loops
**Problem**: Agent was calling tools infinitely when they returned errors

**Solution**:
- Added circuit breaker to `agents/src/agent-core.ts`:
  - Tracks tool call counts per tool per session
  - Maximum 5 calls per tool within 30-second window
  - Returns clear error message when limit exceeded
- Added `toolCallCounts` and `lastToolCallTime` to `SessionContext` interface

**Result**: Tool loops now stop after 5 attempts with clear error message

### 3. JSON String Tool Input Parsing
**Problem**: Tool inputs were being passed as JSON strings instead of objects

**Solution**:
- Modified `agents/src/voice-sidecar.ts` `handleToolUseEvent` method to parse JSON strings:
  ```typescript
  let toolInput = toolData.input || toolData.content;
  if (typeof toolInput === 'string') {
      try {
          toolInput = JSON.parse(toolInput);
      } catch (e) {
          console.warn(`Tool input is a string but not valid JSON, using as-is`);
      }
  }
  ```

**Result**: Most tool inputs are now parsed correctly

## Current Issues ❌

### 1. Handoff Tool Loop
**Symptom**: Agent repeatedly calls `transfer_to_idv` handoff tool

**Evidence**:
- Circuit breaker triggers after 5 calls to `transfer_to_idv`
- Tool input is still a JSON string in some cases: `"{\"reason\":\"...\",\"context\":\"...\"}"`
- Handoff doesn't complete, agent keeps retrying

**Root Cause**: 
- Handoff tools may not be executing properly
- Tool input parsing may not be working for all cases
- Handoff result may not be formatted correctly

### 2. Empty Transcripts
**Symptom**: All transcript messages have empty text

**Evidence**:
```json
{
  "type": "transcript",
  "role": "assistant",
  "text": "",
  "isFinal": false
}
```

**Impact**: No response text is displayed to user

**Root Cause**: Unknown - needs investigation in SonicClient transcript generation

### 3. Balance Tool Not Called
**Symptom**: `agentcore_balance` tool is called once but then agent switches to handoff attempts

**Evidence**:
- First tool call: `agentcore_balance` with correct parameters
- Tool result shows validation error (before JSON parsing fix)
- Agent then tries to handoff to IDV agent instead of retrying balance check

**Root Cause**: Agent workflow logic may be incorrectly routing to handoff after tool failure

## Test Results

### Latest Run
- ❌ **TEST FAILED**: Timeout after 60 seconds
- **Tools Called**: 
  - `agentcore_balance` (1 time) - validation error
  - `transfer_to_idv` (50+ times) - circuit breaker triggered after 5 calls
- **Balance Retrieved**: No
- **Transcripts**: All empty

### Progress
- ✅ AgentCore Gateway configured
- ✅ Circuit breaker prevents infinite loops
- ✅ Tool input parsing implemented
- ❌ Handoff tools not working
- ❌ Empty transcripts
- ❌ Balance not retrieved

## Next Steps

### Priority 1: Fix Handoff Tool Execution
1. Check `agents/src/agent-core.ts` `executeHandoffTool` method
2. Verify handoff tool result format
3. Ensure handoff request is properly formatted
4. Test handoff flow independently

### Priority 2: Debug Empty Transcripts
1. Check `agents/src/sonic-client.ts` transcript generation
2. Verify text content is being extracted from Nova Sonic events
3. Check if text is being stripped in voice-sidecar forwarding
4. Add logging to track where text is lost

### Priority 3: Fix Workflow Logic
1. Review triage workflow to understand routing logic
2. Check why agent switches to handoff after balance tool failure
3. Verify tool retry logic in workflow
4. Test balance check without handoff tools

### Priority 4: Complete JSON Parsing Fix
1. Investigate why some tool inputs are still JSON strings
2. Check if Nova Sonic is sending different formats
3. Add more robust parsing logic
4. Test with all tool types

## Files Modified

1. `.env` - Fixed AGENTCORE_GATEWAY_URL
2. `docker-compose-unified.yml` - Added AgentCore env vars to local-tools
3. `agents/src/agent-core.ts` - Added circuit breaker
4. `agents/src/voice-sidecar.ts` - Added JSON string parsing

## Docker Images Rebuilt

- `local-tools` (with AgentCore credentials)
- `agent-triage` (with circuit breaker and JSON parsing)
- `agent-banking` (with circuit breaker and JSON parsing)

## Conclusion

We've made significant progress:
- AgentCore Gateway is now properly configured
- Infinite tool loops are prevented by circuit breaker
- Tool input parsing is partially working

However, the test still fails because:
- Handoff tools are not executing properly
- Transcripts are empty
- Balance tool is not being retried after initial failure

The next focus should be on fixing the handoff tool execution and understanding why the agent is routing to handoff instead of retrying the balance check.
