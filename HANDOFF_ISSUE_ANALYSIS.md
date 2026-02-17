# Agent Handoff Issue Analysis

## Problem
After successful handoff from Triage → IDV → Banking, the banking agent doesn't respond to user messages. The UI shows the handoff occurred, but the banking agent remains silent.

## What's Working ✅
1. Handoff tools execute successfully (`transfer_to_idv`, `transfer_to_banking`)
2. Gateway detects handoff and connects to target agent
3. Frontend receives `handoff_event` and updates UI
4. Session memory is transferred correctly

## What's Broken ❌
1. Banking agent doesn't auto-trigger after handoff
2. User messages after handoff don't get responses
3. Banking agent appears "stuck" waiting for something

## Root Cause Analysis

### Gateway Handoff Flow (gateway/src/server.ts lines 576-600)
```typescript
// When tool_result for transfer_to_X is received:
1. Gateway intercepts the handoff tool result
2. Connects to target agent via connectToAgent()
3. Sends session_init with memory
4. Waits 1 second for agent to initialize
5. Flushes buffered messages
6. Sends handoff_event to client
```

### The Problem
After `session_init`, the banking agent is waiting for user input, but:
- The user's original request ("balance") was already processed by triage
- The banking agent doesn't know it should check the balance
- The user's follow-up "ok" is just acknowledgment, not a new request

## Solution Options

### Option 1: Auto-trigger on Handoff (Recommended)
When banking agent receives `session_init` after a handoff, it should:
1. Check memory for `userIntent` (e.g., "check_balance")
2. Check memory for credentials (`account`, `sortCode`)
3. Auto-trigger the appropriate action

### Option 2: Gateway Sends Synthetic Message
After handoff, gateway could send a synthetic message like:
```json
{
  "type": "text_input",
  "text": "[SYSTEM: User requested balance check for account 12345678]"
}
```

### Option 3: Handoff Context in session_init
Include handoff context in session_init:
```json
{
  "type": "session_init",
  "handoffContext": {
    "from": "triage",
    "reason": "balance_check",
    "userIntent": "check_balance"
  }
}
```

## Recommended Fix

Implement Option 1 in the banking agent's auto-trigger logic:

```typescript
// In agent-core.ts or banking agent
if (sessionInit && memory.userIntent === 'check_balance' && memory.account && memory.sortCode) {
  // Auto-trigger balance check
  await executeBalanceCheck(memory.account, memory.sortCode);
}
```

This makes the handoff seamless - the banking agent picks up where triage left off.
