# Credential Pass-Through Fix

## Problem
When users provided credentials upfront (e.g., "check balance for account 12345678, sort code 112233"), the system would still ask for them again at the IDV agent. The credentials were being extracted but not properly passed to the IDV agent.

## Root Cause
**Memory Key Mismatch**: The gateway was extracting credentials and storing them as `account` and `sortCode`, but the IDV agent auto-trigger logic was looking for `providedAccount` and `providedSortCode`.

## Solution

### 1. Gateway Credential Extraction (gateway/src/server.ts)
Updated the gateway to store credentials under BOTH keys:
- `account` / `sortCode` - For general use
- `providedAccount` / `providedSortCode` - For IDV auto-trigger detection

```typescript
// CRITICAL FIX: Use providedAccount/providedSortCode keys for pre-provided credentials
// These are checked by IDV agent auto-trigger logic
if (parsed.accountNumber) {
    updates.account = parsed.accountNumber;
    updates.providedAccount = parsed.accountNumber; // For IDV auto-trigger
    console.log(`[Gateway] 📋 Extracted account number: ${parsed.accountNumber}`);
}
if (parsed.sortCode) {
    updates.sortCode = parsed.sortCode;
    updates.providedSortCode = parsed.sortCode; // For IDV auto-trigger
    console.log(`[Gateway] 📋 Extracted sort code: ${parsed.sortCode}`);
}
```

### 2. Enhanced Logging
Added comprehensive logging to track credential extraction:
- Parse results from `parseUserMessage()`
- Extracted account numbers and sort codes
- Final memory state before sending to agent
- Memory update messages sent to agents

### 3. How It Works

**Flow with credentials provided upfront:**

1. User: "check balance for account 12345678, sort code 112233"
2. Gateway extracts credentials via `parseUserMessage()`:
   - `accountNumber: "12345678"`
   - `sortCode: "112233"`
   - `intent: "check_balance"`
3. Gateway updates memory with BOTH key sets:
   - `account: "12345678"`, `providedAccount: "12345678"`
   - `sortCode: "112233"`, `providedSortCode: "112233"`
   - `userIntent: "check_balance"`
4. Triage agent calls `transfer_to_idv` tool
5. Gateway routes to IDV agent with memory containing credentials
6. IDV agent auto-trigger checks memory:
   - Finds `providedAccount` and `providedSortCode`
   - Immediately calls `perform_idv_check` with those credentials
   - NO need to ask user for credentials again

**Flow without credentials:**

1. User: "check my balance"
2. Gateway extracts intent only: `userIntent: "check_balance"`
3. Triage agent calls `transfer_to_idv` tool
4. Gateway routes to IDV agent with memory (no credentials)
5. IDV agent auto-trigger checks memory:
   - No `providedAccount` or `providedSortCode` found
   - Asks user: "Please provide your 8-digit account number and 6-digit sort code"
6. User provides credentials
7. IDV agent calls `perform_idv_check`

## Files Modified

1. **gateway/src/server.ts** (lines 647-675)
   - Added dual-key storage for credentials
   - Enhanced logging for credential extraction
   - Added memory state logging

## Testing

Test with these scenarios:

1. **Credentials upfront**: "check balance for account 12345678, sort code 112233"
   - Expected: IDV agent should verify immediately without asking
   
2. **No credentials**: "check my balance"
   - Expected: IDV agent should ask for credentials
   
3. **Partial credentials**: "my account is 12345678"
   - Expected: IDV agent should ask for sort code only

## Related Components

- **Intent Parser** (gateway/src/intent-parser.ts): Extracts credentials from user messages
- **IDV Auto-Trigger** (agents/src/agent-runtime-unified.ts, lines 620-660): Checks for provided credentials
- **IDV Prompt** (gateway/prompts/persona-idv-simple.txt): Instructions to check memory for credentials

## Status
✅ **FIXED AND TESTED** - Gateway now properly stores credentials under both key sets for IDV auto-trigger detection

## Test Results

**Test Input**: "hey whats my balance, my account is 12345678 and sort code is 112233"

**Gateway Logs**:
```
[Gateway] 📤 Final memory state: {
  account: '12345678',
  sortCode: '112233',
  providedAccount: '12345678',
  providedSortCode: '112233',
  userIntent: 'check_balance'
}
```

**IDV Agent Logs**:
```
[UnifiedRuntime:idv] 🚀 Auto-triggering IDV with provided credentials
[UnifiedRuntime:idv]    Account: 12345678, Sort Code: 112233
[AgentCore:idv] IDV attempt 1/3
[AgentCore:idv] ✅ Stored verified user: Sarah Jones
[AgentCore:idv] ✅ Set verified state flag: true
[AgentCore:idv] 🚀 Verified State Gate: Auto-triggering handoff to banking
```

**Result**: ✅ SUCCESS - User provided credentials upfront, system verified immediately without asking again, and auto-routed to banking agent.
