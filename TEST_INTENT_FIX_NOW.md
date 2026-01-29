# Test User Intent Fix - Quick Guide

## What Was Fixed

The Banking agent now receives BOTH:
1. ✅ Verified user information (name, account, sort code)
2. ✅ Original user intent (what they wanted to do)

Banking agent will now act immediately instead of asking "How can I help you?"

## Restart Services

```bash
./restart-local-services.sh
```

## Test the Journey

1. **Open Frontend:** http://localhost:3000

2. **Start Conversation:**
   - Say: "I want to check my balance"
   - Triage routes to IDV

3. **Verify Identity:**
   - IDV asks for account and sort code
   - Say: "12345678 and 112233"
   - IDV: "Great, Sarah. You've been verified"

4. **Banking Service (THE FIX):**
   - Banking should say: **"Hello Sarah, let me fetch your balance for you..."**
   - Banking immediately calls agentcore_balance
   - Banking speaks: "Your current balance is £1,234.56"
   - **NO "How can I help you?" question!**

## What to Look For

### ✅ Success (After Fix)
```
Banking: "Hello Sarah, let me fetch your balance for you..."
[Immediately fetches balance]
Banking: "Your current balance is £1,234.56"
```

### ❌ Failure (Before Fix)
```
Banking: "Hello! Welcome to our banking services. How can I assist you today?"
[Waits for user to repeat their request]
```

## Check Logs

### Gateway Storing Intent
```bash
tail -f logs/gateway.log | grep "Storing user intent"
```
Expected: `[Gateway] Storing user intent: User needs identity verification for balance check`

### Banking Receiving Context
```bash
tail -f logs/agent-banking.log | grep "Injecting session context"
```
Expected: `[Agent:persona-SimpleBanking] Injecting session context with userIntent: User needs...`

### Banking System Prompt
```bash
tail -f logs/agent-banking.log | grep "CURRENT SESSION CONTEXT" -A 5
```
Should show the injected context with userIntent, userName, account, sortCode

## Full Expected Flow

```
User: "I want to check my balance"
  ↓
Triage: "Let me verify your identity first"
  → Stores intent: "User needs identity verification for balance check"
  ↓
IDV: "Please provide your account number and sort code"
User: "12345678 and 112233"
  ↓
IDV: Verifies → "Great, Sarah. You've been verified"
  → Stores: verified=true, userName="Sarah Johnson", account="12345678"
  ↓
Banking: Receives BOTH verified user AND user intent
  → System prompt includes: "User Intent: User needs...for balance check"
  → System prompt includes: "Customer Name: Sarah Johnson"
  ↓
Banking: "Hello Sarah, let me fetch your balance for you..."
  → Immediately calls agentcore_balance(accountId="12345678", sortCode="112233")
  ↓
Banking: "Your current balance is £1,234.56"
  ↓
Banking: Returns to Triage
  ↓
Triage: "Is there anything else I can help you with, Sarah?"
```

## Key Differences

| Before Fix | After Fix |
|-----------|-----------|
| Banking: "How can I help you?" | Banking: "Let me fetch your balance..." |
| User has to repeat request | User doesn't repeat - agent knows! |
| Generic greeting | Personalized + proactive |
| Reactive | Proactive |

## Success Criteria

✅ Banking greets user by name  
✅ Banking acts on intent immediately  
✅ Banking does NOT ask "How can I help?"  
✅ User does NOT repeat their request  
✅ Balance is fetched automatically  

If all criteria are met, the intent fix is working! 🎉

## Troubleshooting

### Banking Still Asks "How Can I Help?"

**Check if intent was stored:**
```bash
grep "Storing user intent" logs/gateway.log
```

**Check if intent was injected:**
```bash
grep "Injecting session context" logs/agent-banking.log
```

**If missing, restart services:**
```bash
./restart-local-services.sh
```

### Banking Doesn't Use Customer Name

This is the previous fix (memory). Check:
```bash
grep "Restored verified user" logs/agent-banking.log
```

## Documentation

- Full details: `USER_INTENT_FIX.md`
- Memory fix: `MEMORY_HANDOFF_COMPLETE.md`
- Architecture: `EXPECTED_JOURNEY_ARCHITECTURE.md`
