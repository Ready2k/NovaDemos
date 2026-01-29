# Tools Not Working - Summary & Next Steps

## Current Status
Nova Sonic S2S is **NOT calling tools** despite correct configuration.

## What We've Tried

### 1. Tool Format ✅
- Verified `inputSchema.json` is a STRING (correct)
- Verified tool structure matches Bedrock format
- 9 tools configured (6 handoff + 3 banking)

### 2. System Prompt Updates ✅
- Added explicit tool calling instructions
- Removed JSON examples (was causing agent to speak them)
- Added "USE THE TOOL" instructions
- Simplified language

### 3. Tool Configuration ✅
- Added `toolUseOutputConfiguration`
- Added `toolConfiguration` with tools array
- Tried with and without `toolChoice` parameter

### 4. Prompt Fixes ✅
- Fixed routing logic (Triage → IDV → Banking)
- Removed JSON examples from being spoken
- Added clear "don't speak the tool call" instructions

## What's NOT Working
**ZERO `toolUse` events in logs**

Logs show:
```
[SonicClient] Total tools configured: 9
[SonicClient] JSON validation passed
[SonicClient] Received event type: audioOutput
[SonicClient] Received event type: contentEnd
```

But NO:
```
[SonicClient] Received event type: toolUse  ← MISSING!
```

## Root Cause Hypothesis

### Most Likely: Nova Sonic S2S Doesn't Support Tools
Nova Sonic in **bidirectional streaming (S2S) mode** might not support tool calling the same way as the standard Bedrock API.

Evidence:
1. Working version (commit `dbdf27fe`) was **monolithic backend** (not S2S)
2. AWS documentation may not clearly state S2S tool support
3. No `toolUse` events despite correct configuration

### Alternative: Missing Configuration
There might be a specific configuration or event format needed for S2S tool calling that we haven't found.

## Solutions

### Solution 1: Revert to Monolithic Backend (RECOMMENDED)
Use the working version from commit `dbdf27fe96dce70f6c0b9948f1692fcc4563f3c0`:

```bash
# Check out working version
git show dbdf27fe96dce70f6c0b9948f1692fcc4563f3c0:backend/src/services/sonic-service.ts > temp-sonic-service.ts

# Compare with current
diff temp-sonic-service.ts agents/src/sonic-client.ts
```

**Pros:**
- Known to work
- Tools functioned correctly
- Simpler architecture

**Cons:**
- Not using agent-based architecture
- Need to refactor

### Solution 2: Text-Based Routing (WORKAROUND)
Instead of tools, use text parsing:

```typescript
// Agent says: "[ROUTE:idv]" in transcript
// Gateway parses and routes

if (transcript.includes('[ROUTE:idv]')) {
  // Trigger handoff to IDV
}
```

**Pros:**
- Works with current S2S setup
- No tool calling needed

**Cons:**
- Hacky
- Less reliable
- Agent might speak the route command

### Solution 3: Use AgentCore Integration
Use AWS Bedrock AgentCore instead of direct Nova Sonic:

```typescript
// Configure agentCoreRuntimeArn
// Let AgentCore handle tool calling
```

**Pros:**
- AWS-managed tool execution
- Designed for this use case

**Cons:**
- More complex setup
- Requires AgentCore configuration

### Solution 4: Contact AWS Support
Open support ticket asking:
- "Does Nova Sonic bidirectional streaming support tool calling?"
- "What is the correct format for tools in S2S mode?"
- "Are there examples of S2S with tools?"

## Recommended Next Step

**Try Solution 1: Check Working Monolithic Version**

1. Extract tool configuration from working commit
2. Compare with current implementation
3. Identify what's different
4. Apply those differences

Command:
```bash
# Show working sonic-service
git show dbdf27fe96dce70f6c0b9948f1692fcc4563f3c0:backend/src/services/sonic-service.ts | less

# Look for:
# - How tools were configured
# - How toolUse events were handled
# - System prompt format
```

## Files to Review
- `backend/src/services/sonic-service.ts` (working version)
- `backend/src/sonic-client.ts` (working version)
- `agents/src/sonic-client.ts` (current S2S version)
- `agents/src/agent-runtime-s2s.ts` (current S2S version)

## Key Question
**Did the working version use S2S mode or standard Bedrock API?**

If it used standard API (not S2S), that explains why tools worked there but not here.
