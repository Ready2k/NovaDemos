# Nova Sonic S2S Tool Calling Issue

## Problem
Nova Sonic in S2S mode is **NOT calling tools** despite:
- ✅ Tools being sent correctly in `toolConfiguration`
- ✅ JSON validation passing
- ✅ 9 tools configured (6 handoff + 3 banking)
- ✅ System prompt instructing to use tools
- ❌ **ZERO `toolUse` events in logs**

## Evidence from Logs
```
[SonicClient] Total tools configured: 9
[SonicClient] Handoff tools: transfer_to_banking, transfer_to_idv, ...
[SonicClient] Banking tools: verify_account, get_balance, get_transactions
[SonicClient] JSON validation passed
```

But then:
```
[SonicClient] Received event type: audioOutput
[SonicClient] Received event type: audioOutput
[SonicClient] Received event type: contentEnd
```

**NO `toolUse` events at all!**

## Working Version
Commit `dbdf27fe96dce70f6c0b9948f1692fcc4563f3c0` had working tools in monolithic backend.

Key differences:
1. **Monolithic architecture** - Single backend service
2. **Tools loaded from ToolService** - Not hardcoded
3. **Different prompt structure** - May have had better examples

## Hypothesis
Nova Sonic S2S might have different requirements for tool calling than the standard Bedrock API:

1. **Tool format might be different** - S2S vs standard API
2. **System prompt might need specific phrasing** - "Use tools" vs "Call functions"
3. **Tool schemas might need simplification** - Remove optional params
4. **First turn might need priming** - Force a tool call on first interaction

## Next Steps

### Option 1: Copy Working Tool Format
Extract exact tool format from commit `dbdf27fe96dce70f6c0b9948f1692fcc4563f3c0`:
```bash
git show dbdf27fe96dce70f6c0b9948f1692fcc4563f3c0:backend/src/services/tool-service.ts
```

### Option 2: Simplify Tool Schemas
Remove ALL optional parameters, make tools as simple as possible:
```typescript
{
  toolSpec: {
    name: 'transfer_to_idv',
    description: 'Transfer to IDV agent',
    inputSchema: {
      json: JSON.stringify({
        type: 'object',
        properties: {},  // NO parameters at all
        required: []
      })
    }
  }
}
```

### Option 3: Check AWS Documentation
Verify Nova Sonic S2S tool calling format:
- Is `toolConfiguration` the right key?
- Does S2S support tools at all?
- Is there a different event format needed?

### Option 4: Add Tool Priming
Force Nova Sonic to acknowledge tools exist:
```typescript
// After session start, send:
await sonicClient.sendText("[SYSTEM] You have 9 tools available. Use them when needed.");
```

### Option 5: Revert to Monolithic
If S2S tools don't work, consider:
- Using monolithic backend (working version)
- Or implementing handoffs via text parsing instead of tools

## Critical Question
**Does Nova Sonic S2S mode support tool calling at all?**

This needs to be verified from AWS Bedrock documentation or support.

## Files to Check
- `agents/src/handoff-tools.ts` - Tool definitions
- `agents/src/sonic-client.ts` - Tool configuration
- `agents/src/agent-runtime-s2s.ts` - Tool handling
- `backend/prompts/persona-triage.txt` - System prompt

## Test Command
```bash
# Watch for toolUse events
tail -f logs/agent.log | grep -E "(toolUse|Tool called)"
```

If you see NOTHING, Nova Sonic is not calling tools.
