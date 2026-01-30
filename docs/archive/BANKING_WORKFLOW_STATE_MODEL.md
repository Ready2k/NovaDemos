# Banking Workflow State Model - Analysis

## Current State Machine Flow

```
START
  ↓
check_intent (Decision: General or Account Query?)
  ├─→ General Query → answer_general → resolved → publish_summary → end_interaction
  └─→ Account Query → check_auth (Decision: Is user VERIFIED?)
       ├─→ No (UNVERIFIED) → request_details (IDV) → check_auth (Retry)
       └─→ Yes (VERIFIED) → triage (Check account status)
            ├─→ High Vulnerability → handoff_vuln → publish_summary → end_interaction
            ├─→ Account Frozen → handoff_frozen → publish_summary → end_interaction
            └─→ Safe (Open & Low Vuln) → retrieve_history
                 ↓
            check_dispute (Decision: Any open disputes?)
                 ├─→ Yes → manage_dispute → ... (dispute flow)
                 └─→ No → route_service (Decision: Balance or Transactions?)
                      ├─→ Balance → show_balance (Call agentcore_balance)
                      │    ↓
                      │    check_additional_help (Decision: Need more help?)
                      │    ├─→ Yes → route_service (Loop back)
                      │    └─→ No → publish_summary → end_interaction
                      │
                      └─→ Transactions → query_txn → ... (transaction flow)
```

## The Problem

### What Should Happen (Expected)
```
User says: "balanxe" (balance)
  ↓
Triage Agent recognizes banking intent
  ↓
Routes to Banking Agent
  ↓
Banking Agent: check_intent → Account Query
  ↓
check_auth: Is user VERIFIED?
  ├─→ No → request_details (IDV)
  └─→ Yes → triage → retrieve_history → check_dispute → route_service
       ↓
       route_service: Determine Intent
       ├─→ Balance → show_balance (CALL agentcore_balance IMMEDIATELY)
       │    ↓
       │    "Your balance is $X,XXX"
       │
       └─→ Transactions → query_txn
```

### What Actually Happened (Current)
```
User says: "balanxe" (balance)
  ↓
Triage Agent recognizes banking intent
  ↓
Routes to Banking Agent
  ↓
Banking Agent: check_intent → Account Query
  ↓
check_auth: Is user VERIFIED?
  ├─→ No → request_details (IDV) ✓ COMPLETED
  └─→ Yes → triage → retrieve_history → check_dispute → route_service
       ↓
       route_service: Determine Intent
       ├─→ Balance → show_balance (SHOULD CALL agentcore_balance)
       │    ✗ BUT INSTEAD: Asked "What would you like to do today?"
       │
       └─→ Transactions → query_txn
```

## Root Cause Analysis

### Issue 1: Intent Not Preserved After IDV
**Problem**: After IDV completes, the original user intent ("balance") is lost.

**Why**: 
- User says: "balanxe"
- System recognizes: Banking intent
- IDV process starts and completes
- But the original intent context is not maintained through the IDV flow
- System asks: "What would you like to do today?" (generic prompt)

**Expected**: After IDV, system should remember "user asked for balance" and execute `show_balance` immediately.

### Issue 2: route_service Decision Not Triggered
**Problem**: The `route_service` node should determine if user wants Balance or Transactions, but it's not being reached or the decision is not being made.

**Why**:
- The workflow shows: `check_dispute → route_service`
- But the system is asking "What would you like to do today?" instead of routing to `show_balance`
- This suggests the `route_service` decision is not evaluating the user's original intent

### Issue 3: Missing Intent Context in Prompt
**Problem**: The Banking Agent's system prompt doesn't include the original user intent after IDV.

**Why**:
- The prompt needs to know: "User asked for balance"
- But after IDV, this context might be lost
- System falls back to generic: "What would you like to do today?"

## State Model Nodes

### Key Decision Nodes

| Node | Type | Purpose | Current Issue |
|------|------|---------|----------------|
| `check_intent` | Decision | General or Account Query? | ✓ Working (routes to Account Query) |
| `check_auth` | Decision | Is user VERIFIED? | ✓ Working (IDV triggered) |
| `route_service` | Decision | Balance or Transactions? | ✗ Not evaluating original intent |
| `check_dispute` | Decision | Any open disputes? | ✓ Working (no disputes) |
| `check_additional_help` | Decision | Need more help? | ✓ Working (but never reached) |

### Key Process Nodes

| Node | Type | Purpose | Current Issue |
|------|------|---------|----------------|
| `request_details` | Tool | IDV Check | ✓ Working (IDV completed) |
| `show_balance` | Tool | Call agentcore_balance | ✗ Not being called |
| `query_txn` | Tool | Get transactions | ✓ Available but not reached |
| `retrieve_history` | Tool | Get interaction history | ✓ Working |

## The Fix Needed

### Option 1: Preserve Intent Through IDV
**Approach**: Store the original user intent and pass it through the IDV flow.

```
User Intent: "balance"
  ↓
IDV Process
  ↓
After IDV: Retrieve stored intent "balance"
  ↓
route_service: Evaluate intent → Balance
  ↓
show_balance: Call agentcore_balance
```

### Option 2: Extract Intent in route_service Decision
**Approach**: Have `route_service` re-evaluate the user's message to determine intent.

```
route_service Decision Logic:
  if (userMessage contains "balance" OR "how much" OR "account balance")
    → show_balance
  else if (userMessage contains "transaction" OR "statement" OR "history")
    → query_txn
  else
    → Ask "What would you like to do?"
```

### Option 3: Add Intent Extraction Node Before IDV
**Approach**: Extract and store intent before IDV, then use it after.

```
check_intent
  ↓
extract_intent (NEW NODE)
  ├─→ Store: intent = "balance"
  ├─→ Store: intent = "transactions"
  └─→ Store: intent = "dispute"
  ↓
check_auth
  ↓
(After IDV) Use stored intent in route_service
```

## Recommended Solution

**Add Intent Preservation to the Workflow**:

1. **Before IDV**: Extract and store user intent
2. **After IDV**: Retrieve stored intent
3. **In route_service**: Use stored intent to make decision
4. **Execute**: Call appropriate tool (show_balance, query_txn, etc.)

### Implementation Steps

1. **Modify `check_intent` node**:
   - Extract intent from user message
   - Store in context: `userIntent = "balance" | "transactions" | "dispute"`

2. **Modify `route_service` node**:
   - Use stored `userIntent` instead of asking user
   - Route directly to appropriate tool

3. **Update system prompt**:
   - Include instruction: "After IDV, use the stored user intent to route to the appropriate service"
   - Add: "Do NOT ask 'What would you like to do?' if you already know the intent"

## Current Workflow JSON Structure

```json
{
  "nodes": [
    {
      "id": "check_intent",
      "label": "Is this a General Query or Account Specific?",
      "type": "decision"
    },
    {
      "id": "route_service",
      "label": "Determine Intent: Balance/Transactions/Dispute",
      "type": "decision"
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
      "from": "check_intent",
      "to": "check_auth",
      "label": "Account Query"
    },
    {
      "from": "route_service",
      "to": "show_balance",
      "label": "Balance"
    }
  ]
}
```

## Summary

**The Issue**: After IDV completes, the original user intent ("balance") is lost, so the system asks "What would you like to do today?" instead of executing the balance check.

**The Fix**: Preserve the user's original intent through the IDV flow and use it in the `route_service` decision to execute the appropriate tool immediately.

**Expected Behavior After Fix**:
```
User: "balanxe"
  ↓
System: "Let me verify your identity first..."
  ↓
(IDV completes)
  ↓
System: "Your balance is $X,XXX. Is there anything else I can help with?"
```

**Current Behavior**:
```
User: "balanxe"
  ↓
System: "Let me verify your identity first..."
  ↓
(IDV completes)
  ↓
System: "What would you like to do today?" ✗ (Intent lost)
```
