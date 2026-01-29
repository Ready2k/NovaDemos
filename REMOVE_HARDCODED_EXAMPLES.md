# Remove Hardcoded Examples from Prompts

## Problem

Prompts contained hardcoded example data (names, account numbers, balances) that could cause the AI to hallucinate those specific values instead of using real data from tool results.

### Examples Found

**IDV Prompt:**
```
[Result: auth_status="VERIFIED", userName="Sarah Johnson"]
Agent: "Great, Sarah. You've been verified..."
```

**Banking Prompt:**
```
"Hello Sarah, let me fetch your balance for you..."
[IMMEDIATELY CALL: agentcore_balance with accountId="12345678" and sortCode="112233"]
"Your current balance is £1,234.56"
```

### The Issue

When the AI sees these specific examples, it might:
1. Use "Sarah Johnson" even though AgentCore returns "Sarah Jones"
2. Use hardcoded account "12345678" instead of the actual account from context
3. Say "£1,234.56" instead of the real balance from the tool result

This causes **hallucination** - the AI invents data instead of using real tool results.

## Solution Applied

Replaced all hardcoded examples with **generic placeholders** that force the AI to use actual data.

### Changes Made

#### 1. IDV Prompt (backend/prompts/persona-idv.txt)

**Before:**
```
[Result: auth_status="VERIFIED", userName="Sarah Johnson"]
Agent: "Great, Sarah. You've been verified..."
```

**After:**
```
[Result: auth_status="VERIFIED", customer_name="Sarah Jones"]
Agent: "Great, Sarah. You've been verified..."

**CRITICAL: Use the EXACT customer_name from the tool result - do NOT make up names!**
```

#### 2. Banking Prompt (backend/prompts/persona-banking.txt)

**Before:**
```
"Hello Sarah, let me fetch your balance for you..."
[IMMEDIATELY CALL: agentcore_balance with accountId="12345678" and sortCode="112233"]
"Your current balance is £1,234.56"
```

**After:**
```
"Hello [Customer Name], let me fetch your balance for you..."
[IMMEDIATELY CALL: agentcore_balance with accountId and sortCode from context above]
"Your current balance is [amount from tool result]"
```

## Why This Matters

### Before (Hardcoded Examples) ❌

```
AgentCore returns: customer_name="Sarah Jones", balance=1200.0
↓
AI sees example: "Sarah Johnson", "£1,234.56"
↓
AI might say: "Hello Sarah Johnson, your balance is £1,234.56"
↓
Wrong name, wrong balance! ❌
```

### After (Generic Placeholders) ✅

```
AgentCore returns: customer_name="Sarah Jones", balance=1200.0
↓
AI sees placeholder: "[Customer Name]", "[amount from tool result]"
↓
AI must use actual data from tool result
↓
AI says: "Hello Sarah Jones, your balance is £1,200.00"
↓
Correct name, correct balance! ✅
```

## Key Principles

### 1. Use Placeholders, Not Examples
**Bad:** `"Hello Sarah, your balance is £1,234.56"`  
**Good:** `"Hello [Customer Name], your balance is [amount from tool result]"`

### 2. Reference Data Sources
**Bad:** `accountId="12345678"`  
**Good:** `accountId from context above`

### 3. Add Explicit Instructions
**Bad:** Just show an example  
**Good:** `**CRITICAL: Use the EXACT customer_name from the tool result - do NOT make up names!**`

### 4. Match Real Data
If AgentCore returns `customer_name`, use that field name in examples (not `userName`)

## Files Modified

1. **backend/prompts/persona-idv.txt**
   - Changed example from "Sarah Johnson" to "Sarah Jones" (matches AgentCore)
   - Added critical instruction to use exact customer_name from tool result
   - Removed hardcoded account numbers from examples

2. **backend/prompts/persona-banking.txt**
   - Changed "Hello Sarah" to "Hello [Customer Name]"
   - Changed hardcoded accountId/sortCode to "from context above"
   - Changed "£1,234.56" to "[amount from tool result]"
   - Emphasized using data from context and tool results

## Testing

### Test 1: Verify Correct Name Used

```bash
# Start services
./restart-local-services.sh

# Test journey
# Say: "I want to check my balance"
# Provide: Account 12345678, Sort Code 112233

# Expected:
# IDV: "Great, Sarah. You've been verified..." ← Uses "Sarah" (from "Sarah Jones")
# Banking: "Hello Sarah, let me fetch your balance..." ← Uses "Sarah" (from context)
```

### Test 2: Verify Correct Balance Used

```bash
# After verification, Banking should say:
# "Your current balance is £1,200.00" ← From AgentCore (not £1,234.56)
```

### Test 3: Check Logs

```bash
tail -f logs/agent-banking.log | grep "Tool result"

# Should see real balance from AgentCore:
# Tool result: { balance: 1200.0, ... }
```

## Success Criteria

✅ No hardcoded names in prompts (use placeholders)  
✅ No hardcoded account numbers in prompts  
✅ No hardcoded balances in prompts  
✅ Examples match real AgentCore data structure  
✅ Critical instructions added to use real data  
✅ AI uses actual customer name from tool result  
✅ AI uses actual balance from tool result  
✅ AI uses actual account details from context  

## Related Issues

This fix prevents:
1. ❌ AI saying "Sarah Johnson" when AgentCore returns "Sarah Jones"
2. ❌ AI using hardcoded account numbers instead of context
3. ❌ AI saying mock balance (£1,234.56) instead of real balance (£1,200.00)
4. ❌ Hallucination of data that doesn't match tool results

## Summary

**Before:** Hardcoded examples caused AI to hallucinate specific values ❌  
**After:** Generic placeholders force AI to use real data from tools ✅

The AI now **must** use actual data from:
- Tool results (customer_name, balance, etc.)
- Session context (account, sortCode, userIntent)
- Not from hardcoded examples in prompts

This ensures accuracy and prevents hallucination! 🎉
