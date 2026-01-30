# Banking Workflow - Fix Required for Intent Preservation

## Issue Summary

**Problem**: After IDV completes, the user's original intent ("balance") is lost, causing the system to ask "What would you like to do today?" instead of executing the balance check.

**Expected**: System should remember the user asked for balance and execute `show_balance` immediately after IDV.

**Current**: System asks generic question, losing the original intent.

---

## Root Cause

The workflow has two separate decision nodes:
1. **check_intent** - Determines if query is General or Account-specific
2. **route_service** - Determines if user wants Balance or Transactions

**Problem**: Between these two nodes, the IDV flow occurs. The original intent context is not preserved through this flow.

### Current Flow
```
check_intent (Intent: "balance")
    ↓
check_auth (UNVERIFIED)
    ↓
request_details (IDV) ← Intent context lost here
    ↓
check_auth (VERIFIED)
    ↓
route_service (Intent: ???) ← Can't determine what user wanted
    ↓
Response: "What would you like to do today?"
```

---

## Solution: Add Intent Extraction Node

### Step 1: Add New Node to Workflow

Add an `extract_intent` node after `check_intent`:

```json
{
  "id": "extract_intent",
  "label": "Extract and Store User Intent (Balance/Transactions/Dispute)",
  "type": "process",
  "description": "Parse user message to determine intent and store in context for later use after IDV"
}
```

### Step 2: Update Workflow Edges

**Before**:
```json
{
  "from": "check_intent",
  "to": "check_auth",
  "label": "Account Query"
}
```

**After**:
```json
{
  "from": "check_intent",
  "to": "extract_intent",
  "label": "Account Query"
},
{
  "from": "extract_intent",
  "to": "check_auth",
  "label": ""
}
```

### Step 3: Update System Prompt

Add instructions to extract and preserve intent:

```
### INTENT PRESERVATION PROTOCOL ###

**CRITICAL**: After determining this is an Account Query, you MUST:
1. Extract the user's specific intent from their message
2. Store it in your context as: userIntent = "balance" | "transactions" | "dispute"
3. Preserve this intent through the entire IDV flow
4. After IDV completes, use the stored intent to route to the appropriate service

**Intent Classification**:
- "balance" intent: User asks for "balance", "how much", "account balance", "funds", "money"
- "transactions" intent: User asks for "transactions", "statement", "history", "recent activity"
- "dispute" intent: User asks for "dispute", "complaint", "issue", "problem", "unauthorized"

**CRITICAL RULE**: Do NOT ask "What would you like to do today?" if you already know the user's intent.
```

### Step 4: Update route_service Decision Logic

**Current Logic** (Broken):
```
route_service:
  if (userMessage contains "balance")
    → show_balance
  else if (userMessage contains "transaction")
    → query_txn
  else
    → Ask "What would you like to do?"
```

**New Logic** (Fixed):
```
route_service:
  if (storedIntent == "balance")
    → show_balance
  else if (storedIntent == "transactions")
    → query_txn
  else if (storedIntent == "dispute")
    → manage_dispute
  else
    → Ask "What would you like to do?"
```

---

## Implementation Details

### Modified Workflow JSON

```json
{
  "nodes": [
    {
      "id": "start",
      "label": "Welcome",
      "type": "start"
    },
    {
      "id": "check_intent",
      "label": "Is this a General Query or Account Specific?",
      "type": "decision"
    },
    {
      "id": "extract_intent",
      "label": "Extract and Store User Intent (Balance/Transactions/Dispute)",
      "type": "process",
      "description": "Parse user message to determine specific intent and store in context"
    },
    {
      "id": "check_auth",
      "label": "Is 'auth_status' VERIFIED?",
      "type": "decision"
    },
    {
      "id": "request_details",
      "label": "Identity Verification",
      "type": "tool",
      "toolName": "perform_idv_check"
    },
    {
      "id": "route_service",
      "label": "Route to Service Based on Stored Intent",
      "type": "decision",
      "description": "Use storedIntent to determine if Balance/Transactions/Dispute"
    },
    {
      "id": "show_balance",
      "label": "Call 'agentcore_balance'",
      "type": "tool",
      "toolName": "agentcore_balance"
    }
  ],
  "edges": [
    {
      "from": "start",
      "to": "check_intent"
    },
    {
      "from": "check_intent",
      "to": "extract_intent",
      "label": "Account Query"
    },
    {
      "from": "extract_intent",
      "to": "check_auth",
      "label": ""
    },
    {
      "from": "check_auth",
      "to": "request_details",
      "label": "No (UNVERIFIED)"
    },
    {
      "from": "request_details",
      "to": "check_auth",
      "label": "Retry"
    },
    {
      "from": "check_auth",
      "to": "route_service",
      "label": "Yes (VERIFIED)"
    },
    {
      "from": "route_service",
      "to": "show_balance",
      "label": "Balance"
    }
  ]
}
```

---

## Expected Behavior After Fix

### Test Case: User says "balanxe"

**Before Fix**:
```
User: "balanxe"
System: "Let me verify your identity..."
(IDV completes)
System: "What would you like to do today?" ✗
```

**After Fix**:
```
User: "balanxe"
System: "Let me verify your identity..."
(IDV completes)
System: "Your balance is $X,XXX. Is there anything else I can help with?" ✓
```

### Test Case: User says "show me my transactions"

**Before Fix**:
```
User: "show me my transactions"
System: "Let me verify your identity..."
(IDV completes)
System: "What would you like to do today?" ✗
```

**After Fix**:
```
User: "show me my transactions"
System: "Let me verify your identity..."
(IDV completes)
System: "Here are your recent transactions: ..." ✓
```

---

## Files to Modify

1. **`backend/src/workflow-banking.json`**
   - Add `extract_intent` node
   - Update edges to route through `extract_intent`
   - Update `route_service` decision logic

2. **`backend/src/prompts/banking-system-prompt.txt`** (or similar)
   - Add Intent Preservation Protocol section
   - Add Intent Classification rules
   - Add CRITICAL RULE about not asking generic questions

3. **`backend/src/sonic-client.ts`** (or agent implementation)
   - Ensure context is preserved through IDV flow
   - Ensure `storedIntent` is available in `route_service` decision

---

## Testing the Fix

### Test 1: Balance Intent
```
Input: "I'd like to check my balance"
Expected: After IDV → "Your balance is $X,XXX"
Actual: (Before fix) "What would you like to do today?"
```

### Test 2: Transaction Intent
```
Input: "Show me my recent transactions"
Expected: After IDV → "Here are your recent transactions..."
Actual: (Before fix) "What would you like to do today?"
```

### Test 3: Dispute Intent
```
Input: "I want to dispute a transaction"
Expected: After IDV → "I can help you with that. Which transaction?"
Actual: (Before fix) "What would you like to do today?"
```

---

## Priority

**HIGH** - This is a critical user experience issue. After identity verification, the system should immediately execute the requested service, not ask the user to repeat their intent.

---

## Summary

**Issue**: Intent lost after IDV
**Root Cause**: No mechanism to preserve intent through IDV flow
**Solution**: Add `extract_intent` node and update `route_service` logic
**Impact**: Significantly improves user experience by eliminating redundant questions
**Effort**: Low (add 1 node, update 2 edges, update prompt)
**Benefit**: High (better UX, faster service delivery)
