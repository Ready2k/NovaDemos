# Loop Issue Fixed

## Problem

The agent was stuck in a loop saying "I'll connect you to our banking specialist" but never actually calling the transfer tool. The agent would:
1. Say it will connect you
2. Not call the tool
3. Reset and greet again
4. Repeat

## Root Cause

The system prompt instructions said "call transfer_to_banking" but Nova Sonic was interpreting this as just saying it would connect, not actually invoking the tool.

## Fix

Updated the handoff instructions in `agents/src/agent-runtime-s2s.ts` to be MUCH more explicit:

**Before:**
```
- If user needs BALANCE → IMMEDIATELY call 'transfer_to_banking'
```

**After:**
```
**CRITICAL: YOU MUST CALL A TOOL - DO NOT JUST SAY YOU WILL CONNECT THEM**

- User needs BALANCE → **CALL THE TOOL** 'transfer_to_banking' with reason="User needs banking services"

**CRITICAL PROCESS:**
1. User states their need
2. You say ONE brief sentence acknowledging
3. **YOU MUST IMMEDIATELY CALL THE APPROPRIATE TRANSFER TOOL**
4. Do NOT continue talking - the tool call will handle the transfer

**REMEMBER: Saying you will connect them is NOT enough - you MUST CALL THE TOOL!**
```

## How to Test Fix

```bash
# 1. Restart services (code is already rebuilt)
./restart-local-services.sh

# 2. Open frontend
# http://localhost:3000

# 3. Connect to Triage Agent

# 4. Say: "I want to check my balance"

# 5. Watch logs for tool call
tail -f logs/agent.log | grep "Tool called"
```

## Expected Behavior Now

**Before (Broken):**
```
User: "I want to check my balance"
Agent: "I'll connect you to our banking specialist right away."
[NO TOOL CALL]
[LOOP - Agent resets and greets again]
```

**After (Fixed):**
```
User: "I want to check my balance"
Agent: "I'll connect you to our banking specialist right away."
[TOOL CALL: transfer_to_banking]
[HANDOFF TRIGGERED]
[Voice changes to joanna]
Banking Agent: "I can help with that..."
```

## Verification

Check logs for:
```bash
tail -f logs/agent.log | grep -E "(Tool called|HANDOFF TRIGGERED)"
```

You should see:
```
[Agent:triage] Tool called: transfer_to_banking
[Agent:triage] 🔄 HANDOFF TRIGGERED: triage → banking (persona-SimpleBanking)
```

## Why This Happened

Nova Sonic (and most LLMs) need VERY explicit instructions about tool usage. Saying "call the tool" isn't enough - you need to:
1. Emphasize it's CRITICAL
2. Say "DO NOT just say you will do it"
3. Explain the exact process
4. Repeat the requirement multiple times
5. Use bold/caps for emphasis

## Additional Notes

This is a common issue with tool-using LLMs - they often prefer to talk about what they'll do rather than actually doing it. The fix makes it crystal clear that:
- Talking about connecting is NOT enough
- They MUST call the tool
- The tool call is what triggers the handoff
- Not calling the tool means the handoff won't happen

## Test Again

The code is rebuilt. Restart services and test:

```bash
./restart-local-services.sh
```

Then try the balance check scenario again. You should now see the tool being called and the handoff happening!
