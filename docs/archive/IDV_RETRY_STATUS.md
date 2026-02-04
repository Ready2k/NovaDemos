# IDV Retry Implementation - Current Status

## Summary
**Status**: PARTIAL SUCCESS ✅⚠️

Major breakthrough achieved: Text mode now has full LLM invocation capabilities. However, the IDV retry flow needs one more fix to prevent duplicate tool calls.

## What's Working ✅

### 1. Text Mode LLM Invocation (FIXED)
- ✅ TextAdapter now uses SonicClient for LLM invocation
- ✅ Transcript events are generated and forwarded correctly
- ✅ Tool calls work in text mode
- ✅ Handoff requests work in text mode
- ✅ Gateway forwards messages correctly

### 2. IDV Retry Logic (MOSTLY WORKING)
- ✅ IDV agent receives account details from memory
- ✅ IDV agent auto-triggers on first attempt
- ✅ IDV agent calls perform_idv_check tool
- ✅ IDV agent tracks attempts (1/3, 2/3, 3/3)
- ✅ IDV agent returns to triage after failures
- ✅ Auto-trigger skipped for retry attempts (prevents infinite loop)
- ✅ Gateway updates memory when user provides corrected details

### 3. Memory System (WORKING)
- ✅ Gateway extracts account details from user messages
- ✅ Gateway stores details in Redis memory
- ✅ Gateway updates details when user provides corrections
- ✅ Agents receive memory on handoff
- ✅ graphState persists through handoff chain

## Current Issue ❌

**Problem**: IDV agent calls `perform_idv_check` twice immediately with the same wrong credentials, instead of waiting for user to provide corrected details after first failure.

### Expected Flow
```
1. User → Triage: "Check balance for 99999999, 999999" (wrong)
2. Triage: Stores in memory, hands off to IDV
3. IDV: Auto-triggers → calls perform_idv_check(99999999, 999999) - Attempt 1/3
4. IDV: Gets FAILED result
5. IDV: Generates transcript: "I have 99999999 with 999999, is this correct?"
6. ⏸️  WAIT FOR USER INPUT ← Should pause here
7. User: "Sorry, it's 12345678"
8. Gateway: Updates memory with corrected details
9. IDV: Calls perform_idv_check(12345678, 112233) - Attempt 2/3
10. IDV: Gets VERIFIED → Hands off to Banking
```

### Actual Flow
```
1. User → Triage: "Check balance for 99999999, 999999" (wrong)
2. Triage: Stores in memory, hands off to IDV
3. IDV: Auto-triggers → calls perform_idv_check(99999999, 999999) - Attempt 1/3
4. IDV: Gets FAILED result
5. ❌ IDV: Immediately calls perform_idv_check(99999999, 999999) - Attempt 2/3
6. IDV: Gets FAILED result again
7. IDV: Returns to triage with failure
```

### Test Output
```
[2026-02-04T16:04:27.711Z] TOOL_CALL: perform_idv_check - {"accountNumber":"99999999","sortCode":"999999"}
[2026-02-04T16:04:27.711Z] IDV_ATTEMPT: Attempt 1/3 - Account: 99999999, Sort Code: 999999
[2026-02-04T16:04:28.551Z] IDV_FAILED: Attempt 1/3 failed: Customer details not found.
[2026-02-04T16:04:28.605Z] TOOL_CALL: perform_idv_check - {"accountNumber":"99999999","sortCode":"999999"}
[2026-02-04T16:04:28.605Z] IDV_ATTEMPT: Attempt 2/3 - Account: 99999999, Sort Code: 999999
[2026-02-04T16:04:28.987Z] IDV_FAILED: Attempt 2/3 failed: Customer details not found.
```

Notice: Only 54ms between first failure and second attempt! The agent is not waiting for user input.

## Root Cause Analysis

The issue is that **Nova Sonic LLM is making multiple tool calls in a single turn**. After the first `perform_idv_check` fails, the LLM decides to retry immediately with the same parameters instead of:
1. Generating a transcript to ask the user for confirmation
2. Waiting for user response
3. Then making the second attempt

This is a **LLM behavior issue**, not a code bug. The LLM needs to be instructed to:
- Ask user for confirmation after first failure
- Wait for user response before retrying
- Not retry automatically with same parameters

## Solution Options

### Option 1: Update IDV System Prompt ⭐ RECOMMENDED
**Approach**: Add explicit instructions to the IDV agent's system prompt

**Changes Needed**:
```
After IDV verification fails:
1. MUST generate a response asking user to confirm or correct their details
2. MUST NOT call perform_idv_check again until user provides new input
3. MUST wait for user to respond before making another verification attempt
4. If user provides corrected details, use the NEW details for next attempt
```

**Pros**:
- Guides LLM behavior directly
- No code changes needed
- Works with Nova Sonic's native capabilities

**Cons**:
- Relies on LLM following instructions
- May need prompt tuning

### Option 2: Add Tool Call Blocking in Agent Core
**Approach**: Prevent duplicate tool calls with same parameters

**Changes Needed**:
```typescript
// In agent-core.ts executeTool()
if (toolName === 'perform_idv_check') {
    const lastCall = session.lastIdvCall;
    if (lastCall && 
        lastCall.accountNumber === toolInput.accountNumber &&
        lastCall.sortCode === toolInput.sortCode &&
        Date.now() - lastCall.timestamp < 5000) {
        // Block duplicate call within 5 seconds
        return {
            success: false,
            result: { message: "Please wait for user to provide corrected details" },
            error: "Duplicate IDV call blocked"
        };
    }
    session.lastIdvCall = { ...toolInput, timestamp: Date.now() };
}
```

**Pros**:
- Guarantees no duplicate calls
- Works regardless of LLM behavior

**Cons**:
- Adds complexity to agent core
- Tool-specific logic in generic code

### Option 3: Modify perform_idv_check Tool Response
**Approach**: Return special status that prevents immediate retry

**Changes Needed**:
```typescript
// In local-tools perform_idv_check
if (auth_status === 'FAILED' && !isRetry) {
    return {
        auth_status: 'AWAITING_CONFIRMATION',
        message: 'Please confirm account details before retrying',
        requiresUserInput: true
    };
}
```

**Pros**:
- Tool controls its own retry behavior
- Clear signal to LLM

**Cons**:
- Requires tool modification
- May confuse LLM with new status

### Option 4: Hybrid Approach (Option 1 + Option 2) ⭐⭐ BEST
**Combine prompt engineering with safety mechanism**

1. Update IDV system prompt with explicit retry instructions
2. Add duplicate call blocking as safety net
3. This ensures correct behavior even if LLM doesn't follow prompt perfectly

## Recommended Next Steps

1. **Update IDV System Prompt** (5 minutes)
   - Add explicit retry instructions
   - Emphasize waiting for user input
   - Test with updated prompt

2. **Add Duplicate Call Blocking** (10 minutes)
   - Implement in agent-core.ts executeTool()
   - Track last IDV call per session
   - Block duplicates within 5-second window

3. **Rebuild and Test** (5 minutes)
   - Rebuild agents
   - Run test-idv-retry-success.js
   - Verify complete flow works

## Files Modified So Far

1. **agents/src/text-adapter.ts**
   - Added SonicClient integration
   - Added handleSonicEvent() method
   - Added handleTranscriptEvent() method
   - Added handleToolUseEvent() method

2. **agents/src/agent-runtime-unified.ts**
   - Pass SonicConfig to TextAdapter
   - Added auto-trigger logic for IDV agent
   - Added auto-trigger logic for Banking agent
   - Added retry attempt detection

3. **TEXT_MODE_LLM_FIX.md**
   - Documentation of text mode fix
   - Architecture comparison
   - Build instructions

## Test Results

### Test 1: IDV 3 Failures ✅ PASSING
- ✅ IDV attempts 3 times
- ✅ Returns to triage with failure
- ✅ Triage does NOT retry (no infinite loop)

### Test 2: IDV Retry Success ⚠️ BLOCKED
- ✅ IDV receives wrong details
- ✅ IDV calls perform_idv_check (attempt 1)
- ✅ IDV gets FAILED result
- ❌ IDV calls perform_idv_check again immediately (attempt 2) - SHOULD WAIT
- ❌ Test times out waiting for user retry prompt

## Impact Assessment

### What's Fixed
- Text mode now fully functional with LLM invocation
- Transcript events flow correctly through the system
- Auto-trigger mechanism works for first attempts
- Memory system works correctly
- Handoff flow works correctly

### What Needs Fixing
- IDV agent needs to wait for user input between retry attempts
- Requires either prompt update or code-level blocking

### Estimated Time to Complete
- **15-20 minutes** to implement hybrid solution
- **5 minutes** to rebuild and test
- **Total: ~25 minutes**

## Success Criteria

Test passes when:
1. ✅ User provides wrong details (99999999, 999999)
2. ✅ IDV agent attempts verification (attempt 1/3)
3. ✅ IDV agent gets FAILED result
4. ✅ IDV agent asks user to confirm details
5. ✅ User provides corrected details (12345678, 112233)
6. ✅ IDV agent attempts verification with NEW details (attempt 2/3)
7. ✅ IDV agent gets VERIFIED result
8. ✅ IDV hands off to Banking agent
9. ✅ Banking agent checks balance (£1200)
10. ✅ Banking agent returns to Triage
11. ✅ Test completes within 90 seconds
