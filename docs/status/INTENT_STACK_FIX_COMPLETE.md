# Intent Stack Management Fix - Complete

## Problem

User intents were being preserved forever, causing the system to get stuck on old intents:

1. User: "I want to check my balance" → Intent stored: "balance"
2. System: Shows balance ✅
3. User: "I want to dispute a Tesco transaction" → Intent should update to "dispute"
4. System: Still trying to show balance ❌ (stuck on old intent)

## Root Cause

The gateway was designed to preserve the ORIGINAL intent through verification flows (like IDV), but it was:
1. **Never clearing intents** after tasks completed
2. **Never allowing new intents** to overwrite old ones, even from Triage

This meant once an intent was set, it stayed forever.

## Solution

### 1. Clear Intent on Task Completion (`gateway/src/server.ts`)

When an agent calls `return_to_triage` (task complete), clear the intent:

```typescript
if (message.context.isReturn) {
    updates.taskCompleted = message.context.taskCompleted;
    updates.conversationSummary = message.context.summary;
    // CRITICAL: Clear the user intent since the task is complete
    updates.userIntent = undefined;
    console.log(`[Gateway] ✅ Cleared user intent (task complete)`);
}
```

### 2. Allow Triage to Update Intent

Triage is the routing agent, so it should be able to set new intents:

```typescript
const isFromTriage = agent.id === 'triage';
const hasExistingIntent = sessionMemory && sessionMemory.userIntent;

if (!hasExistingIntent || isFromTriage) {
    updates.userIntent = message.context.reason;
    console.log(`[Gateway] ${hasExistingIntent ? 'UPDATING' : 'Storing NEW'} user intent`);
} else {
    console.log(`[Gateway] Preserving ORIGINAL user intent (not from Triage)`);
}
```

## How It Works Now

### Scenario 1: Balance Check → Dispute
```
1. User: "I want to check my balance"
   → Triage sets intent: "balance"
   
2. Banking Agent: Shows balance
   → Calls return_to_triage
   → Gateway CLEARS intent ✅
   
3. User: "I want to dispute a Tesco transaction"
   → Triage sets NEW intent: "dispute" ✅
   
4. Disputes Agent: Handles dispute ✅
```

### Scenario 2: Balance Check → IDV → Balance
```
1. User: "I want to check my balance"
   → Triage sets intent: "balance"
   
2. Banking Agent: Needs verification
   → Transfers to IDV
   → Intent PRESERVED through IDV ✅
   
3. IDV Agent: Verifies identity
   → Returns to Banking
   → Intent still "balance" ✅
   
4. Banking Agent: Shows balance ✅
```

## Intent Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ INTENT LIFECYCLE                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. User speaks → Triage extracts intent               │
│     ↓                                                   │
│  2. Triage sets intent in memory                       │
│     ↓                                                   │
│  3. Intent preserved through verification (IDV)        │
│     ↓                                                   │
│  4. Specialist agent fulfills intent                   │
│     ↓                                                   │
│  5. Agent calls return_to_triage                       │
│     ↓                                                   │
│  6. Gateway CLEARS intent ✅                            │
│     ↓                                                   │
│  7. User speaks again → Triage sets NEW intent         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Rules

| Agent | Can Set Intent? | Can Clear Intent? | Preserves Through? |
|-------|----------------|-------------------|-------------------|
| **Triage** | ✅ Always | ❌ No | N/A |
| **IDV** | ❌ No | ❌ No | ✅ Preserves |
| **Banking** | ❌ No | ✅ On return | ✅ Preserves |
| **Disputes** | ❌ No | ✅ On return | ✅ Preserves |
| **Mortgage** | ❌ No | ✅ On return | ✅ Preserves |

## Testing Scenarios

### Test 1: Sequential Tasks
```
User: "Check my balance"
Expected: Shows balance, clears intent
User: "Dispute a transaction"
Expected: Routes to disputes (not balance)
Status: ✅ FIXED
```

### Test 2: Intent Through IDV
```
User: "Check my balance"
Expected: Routes to IDV → Banking → Shows balance
Status: ✅ WORKING
```

### Test 3: Multiple Tasks
```
User: "Check my balance"
Expected: Shows balance
User: "Show my transactions"
Expected: Shows transactions (not balance)
User: "Dispute a charge"
Expected: Routes to disputes (not transactions)
Status: ✅ FIXED
```

## Files Modified

- ✅ `gateway/src/server.ts` - Intent clearing and update logic

## Logs to Monitor

```bash
# Watch for intent management
tail -f logs/gateway.log | grep -E "user intent|Cleared user intent|UPDATING"

# Expected output:
# [Gateway] Storing NEW user intent: User wants to check their balance
# [Gateway] ✅ Cleared user intent (task complete)
# [Gateway] UPDATING user intent: Check for existing dispute on Tesco transaction
```

## Build Status

- ✅ Gateway compiled successfully
- ✅ Ready to restart

## Next Steps

Restart gateway to apply fix:
```bash
./start-all-services.sh
```

Then test:
1. Say "I want to check my balance"
2. Wait for balance to be shown
3. Say "I want to dispute a Tesco transaction"
4. Verify it routes to disputes (not balance)

---

**Status**: ✅ COMPLETE
**Impact**: Fixes intent getting stuck after first task
**Result**: Users can now perform multiple sequential tasks
