# Balance Check Test - Fix Summary

## Date: 2026-02-04

## Issues Fixed ✅

### 1. JSON String Tool Input Parsing
**Problem**: Tool inputs were being passed as JSON strings instead of objects, causing validation errors.

**Root Cause**: Nova Sonic sends tool inputs as JSON strings in the format `"{\"key\":\"value\"}"`.

**Solution**: Enhanced `agents/src/voice-sidecar.ts` `handleToolUseEvent()` method to:
- Detect JSON string inputs
- Parse them into objects
- Handle parsing errors gracefully
- Wrap non-object inputs in an object structure
- Add comprehensive logging for debugging

**Code Changes**:
```typescript
// Parse tool input if it's a JSON string
let toolInput = toolData.input || toolData.content;

// Handle JSON string inputs
if (typeof toolInput === 'string') {
    try {
        toolInput = JSON.parse(toolInput);
        console.log(`[VoiceSideCar] ✅ Parsed tool input from JSON string`);
    } catch (e) {
        console.warn(`[VoiceSideCar] ⚠️  Tool input is a string but not valid JSON, using as-is: ${toolInput}`);
        // If it's not valid JSON, wrap it in an object
        toolInput = { value: toolInput };
    }
}

// Ensure toolInput is an object
if (typeof toolInput !== 'object' || toolInput === null) {
    console.warn(`[VoiceSideCar] ⚠️  Tool input is not an object, wrapping: ${typeof toolInput}`);
    toolInput = { value: toolInput };
}
```

**Result**: ✅ Tool inputs now parse correctly as objects

### 2. Empty Transcripts
**Problem**: All transcript messages had empty text fields, so users saw no responses.

**Root Cause**: Transcript data was being extracted from `transcriptData.text` or `transcriptData.content`, but Nova Sonic was sending it in a different field.

**Solution**: Enhanced `agents/src/voice-sidecar.ts` `handleTranscriptEvent()` method to:
- Check multiple possible field names: `text`, `content`, `transcript`
- Add logging to show what text is being extracted
- Provide better fallback handling

**Code Changes**:
```typescript
// Extract text from various possible fields
const text = transcriptData.text || transcriptData.content || transcriptData.transcript || '';

console.log(`[VoiceSideCar] Transcript event - Role: ${transcriptData.role}, Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
```

**Result**: ✅ Transcripts now display correctly with actual text content

### 3. Handoff Tool Validation
**Problem**: Handoff tool validation was too strict and didn't provide helpful error messages.

**Solution**: Enhanced `agents/src/agent-core.ts` `validateHandoffInput()` method to:
- Add logging to show what input is being validated
- Validate optional fields more leniently
- Provide clearer error messages

**Code Changes**:
```typescript
// Log input for debugging
console.log(`[AgentCore:${this.agentId}] Validating handoff input for ${toolName}:`, JSON.stringify(input).substring(0, 200));

// ... validation logic ...

console.log(`[AgentCore:${this.agentId}] ✅ Handoff input validation passed`);
```

**Result**: ✅ Better validation and error reporting

### 4. Handoff Tool Execution Logging
**Problem**: Handoff tool execution had minimal logging, making it hard to debug.

**Solution**: Enhanced `agents/src/agent-core.ts` `executeHandoffTool()` method to:
- Add comprehensive logging at each step
- Show target agent and context
- Log handoff request details
- Use emoji indicators for better visibility

**Code Changes**:
```typescript
console.log(`[AgentCore:${this.agentId}] 🔄 Executing handoff tool: ${toolName}`);
console.log(`[AgentCore:${this.agentId}] Handoff input:`, JSON.stringify(toolInput).substring(0, 300));
// ... execution logic ...
console.log(`[AgentCore:${this.agentId}] ✅ Handoff request built: ${this.agentId} → ${targetAgent}`);
```

**Result**: ✅ Much better visibility into handoff execution

## Current Status

### Test Results
- ✅ WebSocket connection successful
- ✅ Workflow selection (triage) successful
- ✅ Text message sent and received
- ✅ Tool input parsing working (JSON strings → objects)
- ✅ Transcripts displaying with actual text
- ✅ Tool `agentcore_balance` called with correct parameters: `{"accountId":"12345678","sortCode":"112233"}`
- ❌ Tool execution failed: "Tool not found: agentcore_balance"

### Remaining Issue

**Problem**: Banking tools (like `agentcore_balance`) are not loaded in the local-tools service.

**Evidence**:
- Local-tools only has 2 tools loaded: `calculator` and `string_formatter`
- Banking tools from `/tools` directory are not being loaded
- Tool execution returns 404 "Tool not found"

**Next Steps**:
1. Check local-tools service configuration
2. Verify tool loading mechanism
3. Ensure banking tools are properly registered
4. Test balance check end-to-end

## Files Modified

1. `agents/src/voice-sidecar.ts`
   - Enhanced `handleTranscriptEvent()` - better text extraction
   - Enhanced `handleToolUseEvent()` - JSON string parsing

2. `agents/src/agent-core.ts`
   - Enhanced `validateHandoffInput()` - better validation and logging
   - Enhanced `executeHandoffTool()` - comprehensive logging

## Docker Images Rebuilt

- `voice_s2s-agent-triage:latest` (using docker-compose build)
- `voice-s2s-agent-banking:latest` (using docker build)
- `voice-s2s-agent-idv:latest` (using docker build)

## Key Learnings

1. **Docker Build Context**: When using `docker-compose build`, it builds from the Dockerfile in the context directory, not from pre-built images. Always use `docker-compose build` to ensure latest code is included.

2. **JSON String Parsing**: Nova Sonic sends tool inputs as JSON strings, not objects. This needs to be handled at the adapter level before validation.

3. **Multiple Field Names**: Different parts of the system may use different field names for the same data (text vs content vs transcript). Always check multiple possibilities.

4. **Logging is Critical**: Comprehensive logging with emoji indicators and truncated JSON makes debugging much easier.

## Progress Summary

We've made significant progress on the balance check test:
- ✅ Fixed JSON string parsing (major blocker)
- ✅ Fixed empty transcripts (user experience issue)
- ✅ Improved handoff tool execution (better debugging)
- ✅ Circuit breaker working correctly (prevents infinite loops)
- ⏳ Need to fix tool loading in local-tools service

The test is now much closer to passing. Once we fix the tool loading issue, the balance check should work end-to-end.
