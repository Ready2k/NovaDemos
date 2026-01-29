# Tool Calling Fix - Nova Sonic Not Calling Tools

## Problem
Nova Sonic is receiving tools correctly but NOT calling them. Agent just greets and loops.

## Changes Made

### 1. Added `toolChoice` Parameter
**File:** `agents/src/sonic-client.ts`
- Added `toolChoice: { auto: {} }` to `toolConfiguration`
- This tells Nova Sonic to automatically consider tools

### 2. Updated Triage Routing Logic
**File:** `backend/prompts/persona-triage.txt`
- Changed routing: Balance/Transactions → **IDV first** (not Banking)
- Added explicit JSON tool call examples
- Made instructions more forceful about calling tools

### 3. Updated IDV Agent Flow
**File:** `backend/prompts/persona-idv.txt`
- After verification → **Transfer to Banking** (not back to Triage)
- Added explicit tool call examples
- IDV → Banking → Triage (correct flow)

## Expected Journey

```
User: "I want to check my balance"
↓
Triage: "Sure, let me verify your identity first"
[CALLS: transfer_to_idv]
↓
IDV: "For authentication, please provide your 8-digit account number and 6-digit sort code"
User: "12345678 and 112233"
[CALLS: verify_account]
IDV: "Great, Sarah. You've been verified. Let me connect you to our banking specialist."
[CALLS: transfer_to_banking]
↓
Banking: "Let me fetch your balance..."
[CALLS: get_balance]
Banking: "Your balance is £1,234.56"
[CALLS: return_to_triage]
↓
Triage: "Is there anything else I can help you with today, Sarah?"
```

## How to Test

1. **Rebuild agents:**
   ```bash
   npm run build --prefix agents
   ```

2. **Restart services:**
   ```bash
   ./restart-local-services.sh
   ```

3. **Test the flow:**
   - Connect to frontend
   - Say: "I want to check my balance"
   - **EXPECTED:** Agent should call `transfer_to_idv` tool
   - **WATCH LOGS:** `tail -f logs/agent.log | grep -E "(Tool|toolUse|HANDOFF)"`

## Debugging

### Check if tools are being sent:
```bash
tail -100 logs/agent.log | grep "DEBUG TOOLS"
```

### Check if tools are being called:
```bash
tail -100 logs/agent.log | grep "toolUse"
```

### If NO toolUse events:
- Nova Sonic is not calling tools
- Need to investigate tool format or add more explicit examples

## Next Steps if Still Not Working

1. **Try forcing a specific tool** - Add `toolChoice: { tool: { name: "transfer_to_idv" } }` for first turn
2. **Simplify tool schemas** - Remove optional parameters
3. **Add more examples** - Nova Sonic learns from examples in system prompt
4. **Check AWS Bedrock docs** - Verify Nova Sonic tool calling format

## Files Changed
- `agents/src/sonic-client.ts` - Added toolChoice
- `backend/prompts/persona-triage.txt` - Updated routing + examples
- `backend/prompts/persona-idv.txt` - Updated flow + examples
