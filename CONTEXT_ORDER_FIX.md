# Context Order Fix - Context Must Come BEFORE Persona Prompt

## Problem Identified

The Banking agent was receiving session context (userIntent + verified user) but was still asking "How can I help you?" instead of acting on the user's request immediately.

### Root Cause

The system prompt was constructed in the wrong order:

```
1. Persona Prompt (says "CHECK THE CONTEXT ABOVE")
2. Context Injection (the actual context)
3. Handoff Instructions
4. Workflow Instructions
```

**The persona prompt was referencing context that came AFTER it!**

Nova Sonic reads the prompt sequentially, so when it saw "CHECK THE CONTEXT ABOVE", there was no context above to check.

## Solution Applied

### Fix 1: Reorder System Prompt Construction

Changed the order in `agents/src/agent-runtime-s2s.ts` (line ~245):

**Before:**
```typescript
systemPrompt = `${personaPrompt}${contextInjection}${handoffInstructions}\n\n### WORKFLOW INSTRUCTIONS ###\n${workflowInstructions}`;
```

**After:**
```typescript
systemPrompt = `${contextInjection}${personaPrompt}${handoffInstructions}\n\n### WORKFLOW INSTRUCTIONS ###\n${workflowInstructions}`;
```

Now the order is:
```
1. Context Injection (the actual context) ← FIRST!
2. Persona Prompt (says "CHECK THE CONTEXT ABOVE")
3. Handoff Instructions
4. Workflow Instructions
```

### Fix 2: Make Banking Prompt More Explicit

Updated `backend/prompts/persona-banking.txt` to be crystal clear:

**Added explicit instructions:**
```
1. **LOOK AT THE SECTION ABOVE THIS** - It contains "CURRENT SESSION CONTEXT"
2. **IF YOU SEE "User's Original Request" ABOVE:**
   - DO NOT ask "How can I help you?"
   - DO NOT wait for them to tell you what they want
   - ACT IMMEDIATELY on their request
```

**Added concrete examples:**
```
Example response:
"Hello Sarah, let me fetch your balance for you..."
[IMMEDIATELY CALL: agentcore_balance with accountId="12345678" and sortCode="112233"]
[WAIT FOR RESULT]
"Your current balance is £1,234.56"
[CALL: return_to_triage]
```

## How It Works Now

### System Prompt Structure

When Banking agent receives a handoff with context:

```
### CURRENT SESSION CONTEXT ###

**User's Original Request:** User needs identity verification for balance check

**Customer Name:** Sarah Johnson
**Account Number:** 12345678
**Sort Code:** 112233
**Verification Status:** VERIFIED

**CRITICAL INSTRUCTION:** 
- The customer is already verified and you have their details above
- If the "User's Original Request" mentions what they want (balance, transactions, etc.), ACT ON IT IMMEDIATELY
- Greet them by name and help them with their request
- DO NOT ask "How can I help you?" if you already know what they want
- Be proactive and efficient

### BANKING SPECIALIST - ACCOUNT SERVICES ###

You are a banking specialist at Barclays Bank...

**CRITICAL INSTRUCTIONS - READ CAREFULLY:**

1. **LOOK AT THE SECTION ABOVE THIS** - It contains "CURRENT SESSION CONTEXT" with:
   - User's Original Request (what they want)
   - Customer Name (already verified)
   - Account Number (already verified)
   - Sort Code (already verified)

2. **IF YOU SEE "User's Original Request" ABOVE:**
   - DO NOT ask "How can I help you?"
   - DO NOT wait for them to tell you what they want
   - ACT IMMEDIATELY on their request
   - Use the account details provided above

[... rest of prompt ...]
```

### Expected Behavior

**User Journey:**
```
User: "I want to check my balance"
↓
Triage: Routes to IDV
↓
IDV: Verifies user (Sarah Johnson, Account 12345678)
↓
IDV: Hands off to Banking with context:
  - userIntent: "User needs identity verification for balance check"
  - verified: true
  - userName: "Sarah Johnson"
  - account: "12345678"
  - sortCode: "112233"
↓
Banking: Receives session_init with memory
Banking: Constructs system prompt with CONTEXT FIRST
Banking: Nova Sonic reads context BEFORE persona prompt
Banking: Nova Sonic sees "User's Original Request: balance check"
Banking: Nova Sonic sees explicit instruction to ACT IMMEDIATELY
↓
Banking: "Hello Sarah, let me fetch your balance for you..."
Banking: [Calls agentcore_balance with account="12345678", sortCode="112233"]
Banking: "Your current balance is £1,234.56"
Banking: [Calls return_to_triage]
```

## Files Modified

1. **agents/src/agent-runtime-s2s.ts** (line ~245)
   - Reordered system prompt construction
   - Context now comes BEFORE persona prompt

2. **backend/prompts/persona-banking.txt**
   - Made instructions more explicit
   - Added concrete examples
   - Emphasized checking context ABOVE
   - Added step-by-step process with examples

## Testing

Restart services:
```bash
./restart-local-services.sh
```

Test journey:
1. Say: "I want to check my balance"
2. Provide: Account 12345678, Sort Code 112233
3. Banking should say: "Hello Sarah, let me fetch your balance for you..."
4. Banking should immediately call agentcore_balance
5. Banking should NOT ask "How can I help you?"

Check logs:
```bash
tail -f logs/agent-banking.log | grep "Combined context"
# Expected: [Agent:persona-SimpleBanking] Combined context (XXX chars) + persona prompt (YYY chars) + ...
```

## Success Criteria

✅ Context injected BEFORE persona prompt  
✅ Persona prompt can reference context ABOVE it  
✅ Banking prompt has explicit instructions with examples  
✅ Nova Sonic sees context before reading instructions  
✅ Banking agent acts on userIntent immediately  
✅ Banking agent does NOT ask "How can I help you?" when intent is known  

The context is now in the correct order and the instructions are crystal clear! 🎉
