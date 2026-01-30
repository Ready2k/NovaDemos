# Banking Workflow - Visual State Diagram

## Complete State Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BANKING WORKFLOW STATE MACHINE                       │
└─────────────────────────────────────────────────────────────────────────────┘

                                    START
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  check_intent    │
                            │  (Decision)      │
                            └────────┬─────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                                 │
                    ▼                                 ▼
            ┌──────────────────┐          ┌──────────────────┐
            │ General Query    │          │ Account Query    │
            │ (answer_general) │          │ (check_auth)     │
            └────────┬─────────┘          └────────┬─────────┘
                     │                             │
                     │                    ┌────────┴────────┐
                     │                    │                 │
                     │                    ▼                 ▼
                     │            ┌──────────────┐  ┌──────────────┐
                     │            │ UNVERIFIED   │  │  VERIFIED    │
                     │            │ (request_    │  │  (triage)    │
                     │            │  details)    │  └────────┬─────┘
                     │            │ [IDV CALL]   │           │
                     │            └──────┬───────┘    ┌──────┴──────┐
                     │                   │            │             │
                     │                   │      ┌─────▼──┐    ┌────▼────┐
                     │                   │      │ Vuln   │    │ Frozen  │
                     │                   │      │ High   │    │ Account │
                     │                   │      └────┬───┘    └────┬────┘
                     │                   │           │             │
                     │                   └─────┬─────┘             │
                     │                         │                   │
                     │                         ▼                   │
                     │                  ┌──────────────┐           │
                     │                  │ retrieve_    │           │
                     │                  │ history      │           │
                     │                  │ [TOOL CALL]  │           │
                     │                  └──────┬───────┘           │
                     │                         │                   │
                     │                         ▼                   │
                     │                  ┌──────────────┐           │
                     │                  │ check_       │           │
                     │                  │ dispute      │           │
                     │                  │ (Decision)   │           │
                     │                  └──────┬───────┘           │
                     │                         │                   │
                     │            ┌────────────┼────────────┐      │
                     │            │                         │      │
                     │            ▼                         ▼      │
                     │     ┌──────────────┐        ┌──────────────┐│
                     │     │ manage_      │        │ route_       ││
                     │     │ dispute      │        │ service      ││
                     │     │ (Process)    │        │ (Decision)   ││
                     │     └──────┬───────┘        └──────┬───────┘│
                     │            │                       │        │
                     │            │          ┌────────────┼────────┘
                     │            │          │            │
                     │            │          ▼            ▼
                     │            │   ┌────────────┐ ┌────────────┐
                     │            │   │ Balance    │ │Transactions│
                     │            │   │ (show_     │ │ (query_    │
                     │            │   │ balance)   │ │ txn)       │
                     │            │   │ [TOOL CALL]│ │ [TOOL CALL]│
                     │            │   └────┬───────┘ └────┬───────┘
                     │            │        │              │
                     │            │        ▼              ▼
                     │            │   ┌────────────────────────┐
                     │            │   │ check_additional_help  │
                     │            │   │ (Decision)             │
                     │            │   └────┬──────────┬────────┘
                     │            │        │          │
                     │            │        │ Yes      │ No
                     │            │        │          │
                     │            │        └──────┬───┘
                     │            │               │
                     │            └───────┬───────┘
                     │                    │
                     │                    ▼
                     │            ┌──────────────┐
                     │            │ publish_     │
                     │            │ summary      │
                     │            │ [TOOL CALL]  │
                     │            └──────┬───────┘
                     │                   │
                     └───────────┬───────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ end_interaction  │
                        │ (END)            │
                        └──────────────────┘
```

## The Problem: Intent Loss After IDV

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHAT SHOULD HAPPEN (Expected)                             │
└─────────────────────────────────────────────────────────────────────────────┘

User Input: "balanxe" (balance)
    │
    ▼
check_intent: Account Query ✓
    │
    ▼
check_auth: UNVERIFIED
    │
    ▼
request_details: IDV Check ✓
    │
    ▼
check_auth: VERIFIED ✓
    │
    ▼
retrieve_history ✓
    │
    ▼
check_dispute: No ✓
    │
    ▼
route_service: Determine Intent
    │
    ├─→ Intent = "balance" ✓
    │
    ▼
show_balance: Call agentcore_balance ✓
    │
    ▼
Response: "Your balance is $X,XXX"


┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHAT ACTUALLY HAPPENED (Current)                          │
└─────────────────────────────────────────────────────────────────────────────┘

User Input: "balanxe" (balance)
    │
    ▼
check_intent: Account Query ✓
    │
    ▼
check_auth: UNVERIFIED
    │
    ▼
request_details: IDV Check ✓
    │
    ▼
check_auth: VERIFIED ✓
    │
    ▼
retrieve_history ✓
    │
    ▼
check_dispute: No ✓
    │
    ▼
route_service: Determine Intent
    │
    ├─→ Intent = ??? (LOST) ✗
    │
    ▼
Response: "What would you like to do today?" ✗
```

## Intent Preservation Flow (Proposed Fix)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROPOSED FIX: Intent Preservation                         │
└─────────────────────────────────────────────────────────────────────────────┘

User Input: "balanxe" (balance)
    │
    ▼
check_intent: Account Query ✓
    │
    ▼
extract_intent: Store intent = "balance" ✓ [NEW NODE]
    │
    ▼
check_auth: UNVERIFIED
    │
    ▼
request_details: IDV Check ✓
    │
    ▼
check_auth: VERIFIED ✓
    │
    ▼
retrieve_history ✓
    │
    ▼
check_dispute: No ✓
    │
    ▼
route_service: Use stored intent = "balance" ✓
    │
    ▼
show_balance: Call agentcore_balance ✓
    │
    ▼
Response: "Your balance is $X,XXX" ✓
```

## State Transition Table

| Current State | Event | Condition | Next State | Action |
|---------------|-------|-----------|-----------|--------|
| check_intent | User message | "balance" | check_auth | Route to Account Query |
| check_auth | - | UNVERIFIED | request_details | Call IDV |
| request_details | IDV result | Success | check_auth | Retry check |
| check_auth | - | VERIFIED | triage | Check account status |
| triage | - | Safe | retrieve_history | Get history |
| retrieve_history | - | - | check_dispute | Check disputes |
| check_dispute | - | No disputes | route_service | Determine service |
| route_service | - | Intent="balance" | show_balance | Call balance tool |
| show_balance | - | - | check_additional_help | Ask if more help |
| check_additional_help | - | No | publish_summary | Save session |
| publish_summary | - | - | end_interaction | End |

## Decision Node Logic

### route_service Decision (Current - BROKEN)
```
route_service:
  if (userMessage contains "balance")
    → show_balance
  else if (userMessage contains "transaction")
    → query_txn
  else
    → ??? (LOST INTENT)
    → Ask "What would you like to do?"
```

### route_service Decision (Proposed - FIXED)
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

## Context Flow

### Current (Intent Lost)
```
Context at check_intent:
  userMessage: "balanxe"
  intent: "balance"
  
Context at request_details (IDV):
  userMessage: "balanxe"
  intent: "balance"
  
Context at route_service:
  userMessage: ??? (LOST)
  intent: ??? (LOST)
  
Result: Generic response "What would you like to do?"
```

### Proposed (Intent Preserved)
```
Context at check_intent:
  userMessage: "balanxe"
  intent: "balance"
  
Context at extract_intent (NEW):
  userMessage: "balanxe"
  intent: "balance"
  storedIntent: "balance" ✓ (SAVED)
  
Context at request_details (IDV):
  userMessage: "balanxe"
  intent: "balance"
  storedIntent: "balance" ✓
  
Context at route_service:
  userMessage: "balanxe"
  intent: "balance"
  storedIntent: "balance" ✓ (RETRIEVED)
  
Result: Specific response "Your balance is $X,XXX"
```

## Summary

**Problem**: Intent is lost after IDV, causing generic response instead of executing balance check.

**Root Cause**: No mechanism to preserve user intent through the IDV flow.

**Solution**: Add intent extraction and storage, then retrieve and use it in route_service decision.

**Expected Outcome**: After IDV, system immediately executes the requested service (balance, transactions, etc.) without asking "What would you like to do?"
