# Tool Speaking Fix - Nova Sonic Speaking Tool Calls Instead of Using Them

## Problem Identified

Nova Sonic was **speaking the tool call JSON** instead of actually calling the tool:

```
Agent: "Let me connect you to our Identity Verification specialist. 
`json "toolUseId": "transfer_001", "name": "transfer_to_idv", ...`"
```

This means:
- ✅ Nova Sonic understands it needs to call a tool
- ❌ Nova Sonic is treating the JSON examples as TEXT to speak
- ❌ The tool is never actually invoked

## Root Cause

The prompt had **explicit JSON examples** like:
```
**THEN IMMEDIATELY CALL THIS TOOL:**
```json
{
  "toolUseId": "transfer_001",
  "name": "transfer_to_idv",
  ...
}
```
```

Nova Sonic was reading these examples as part of the conversation script!

## Fix Applied

### 1. Removed JSON Examples from Prompts
**Files:** 
- `backend/prompts/persona-triage.txt`
- `backend/prompts/persona-idv.txt`

**Changed from:**
```
Agent: "Sure, let me verify your identity first."
**THEN IMMEDIATELY CALL THIS TOOL:**
```json
{ "toolUseId": "transfer_001", "name": "transfer_to_idv", ... }
```
```

**Changed to:**
```
Agent: "Sure, let me verify your identity first."
[Agent uses transfer_to_idv tool]
```

### 2. Added Clear Instructions
Added to top of triage prompt:
```
**CRITICAL: You have tools available. When you need to transfer someone, 
USE THE TOOL - don't describe it or speak about it. Just say your 
acknowledgment and use the tool silently.**
```

### 3. Simplified Tool Usage Section
Removed all JSON formatting examples and replaced with simple list:
```
**Available Tools:**
- transfer_to_idv - For identity verification
- transfer_to_banking - For banking services
- transfer_to_mortgage - For mortgage information
...

**DO NOT speak the tool call - just use it!**
```

## How to Test

1. **Restart services:**
   ```bash
   ./restart-local-services.sh
   ```

2. **Test the flow:**
   - Connect to frontend
   - Say: "I want to check my balance"
   
3. **Expected behavior:**
   - Agent says: "Sure, let me verify your identity first."
   - **NO JSON in transcript**
   - **toolUse event in logs**
   - Transfer happens

4. **Watch logs:**
   ```bash
   tail -f logs/agent.log | grep -E "(Tool called|toolUse|HANDOFF)"
   ```

## What to Look For

### ✅ SUCCESS:
```
[Agent:triage] Tool called: transfer_to_idv
[Agent:triage] 🔄 HANDOFF TRIGGERED: triage → idv
```

### ❌ FAILURE (Still speaking JSON):
```
Agent: "Let me connect you... `json "toolUseId"...`"
```

### ❌ FAILURE (No tool call):
```
Agent: "I'll connect you to our specialist."
[No toolUse event in logs]
```

## Next Steps if Still Not Working

If Nova Sonic still doesn't call tools:

1. **Check tool format** - Verify tools are in correct Bedrock format
2. **Try simpler prompts** - Remove all examples, just list tools
3. **Force tool use** - Try `toolChoice: { any: {} }` instead of `auto`
4. **Check AWS docs** - Verify Nova Sonic supports tool calling in S2S mode

## Files Changed
- `backend/prompts/persona-triage.txt` - Removed JSON examples, added clear instructions
- `backend/prompts/persona-idv.txt` - Removed JSON examples
