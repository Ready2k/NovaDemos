# IDV Agent Issue - Summary

## Problem Statement

The IDV (Identity Verification) agent is skipping the credential verification step and immediately transferring users to the Banking agent without asking for account number and sort code.

## Expected Flow

1. User: "I need to check my balance"
2. Triage → IDV (handoff)
3. IDV: "Hello, I'm here to verify your identity. Please provide your 8-digit account number and 6-digit sort code."
4. User provides credentials
5. IDV calls `perform_idv_check` tool
6. IDV → Banking (handoff with verified status)

## Actual Flow

1. User: "I need to check my balance"
2. Triage → IDV (handoff)
3. IDV immediately calls `transfer_to_banking` WITHOUT asking for credentials
4. Banking agent receives unverified user

## Root Cause

The LLM (Amazon Nova 2 Sonic) is optimizing for efficiency and sees:
- User intent: "balance check" (from handoff context)
- Available tool: `transfer_to_banking`
- Decision: Call transfer immediately (skips verification)

Despite extensive prompt engineering with:
- 6,191 character behavioral prompt
- Explicit step-by-step instructions
- Multiple examples showing correct behavior
- CRITICAL RULES in all caps
- Negative examples (what NOT to do)

The LLM still takes the "shortcut" and skips asking for credentials.

## Attempts Made

### 1. Workflow-Based Approach (Failed)
- Created workflow with decision nodes
- LLM ignored workflow logic
- Still called transfer_to_banking immediately

### 2. Enhanced Persona Prompts (Failed)
- Added explicit instructions: "NEVER skip asking for credentials"
- Added step-by-step process
- Added example conversations
- LLM still skipped the step

### 3. Simple Behavioral Persona (Failed - Current)
- Removed workflow entirely
- Created `persona-idv-simple.txt` with pure behavioral instructions
- 14 tools available (including `perform_idv_check`)
- Explicit rules: "Do NOT call any tools yet. Wait for the customer to provide their details."
- LLM STILL calls `transfer_to_banking` immediately

### 4. Triage Prompt Updates (Partial Success)
- Updated Triage to only call ONE transfer tool per turn
- Added rule: "CALL ONLY ONE TRANSFER TOOL PER TURN"
- This fixed Triage calling both `transfer_to_idv` AND `transfer_to_banking` in sequence
- But IDV agent still skips verification

## Technical Details

### Files Modified

1. `backend/personas/idv.json` - Updated to use simple behavioral prompt
2. `backend/prompts/persona-idv-simple.txt` - New 6,191 char behavioral prompt
3. `backend/workflows/workflow_idv-simple.json` - Minimal workflow (start → end)
4. `backend/prompts/persona-triage.txt` - Added single-tool-per-turn rule
5. `docker-compose-a2a.yml` - Updated IDV agent configuration

### Current Configuration

- Agent ID: `idv`
- Persona: "Identity Verification Specialist"
- Prompt File: `persona-idv-simple.txt`
- Workflow: Minimal (2 nodes: start → end)
- Tools: 14 (including `perform_idv_check`, `transfer_to_banking`, etc.)
- Mode: `text`

## Possible Solutions (Not Yet Implemented)

### Option 1: Remove `transfer_to_banking` from IDV Tools
**Pros:**
- Forces IDV to only use `perform_idv_check` and `return_to_triage`
- IDV cannot skip to banking even if it wants to

**Cons:**
- Breaks the intended flow where IDV transfers to banking after verification
- Would require IDV to return to Triage, then Triage transfers to Banking
- More handoffs = more latency

### Option 2: Use System-Level Guards (Code-Based)
**Pros:**
- Programmatic enforcement - LLM cannot bypass
- Check if `perform_idv_check` was called before allowing `transfer_to_banking`

**Cons:**
- Requires code changes in `agents/src/agent-core.ts`
- User explicitly said "no hard-coding"
- Less flexible than prompt-based approach

### Option 3: Pre-Tool-Use Hook
**Pros:**
- Use Kiro's hook system to intercept `transfer_to_banking` calls
- Check if verification happened first
- Block the tool call if not verified

**Cons:**
- Adds complexity
- Still requires some code logic

### Option 4: Different LLM Model
**Pros:**
- Some models follow instructions more strictly
- Claude or GPT-4 might respect the "NEVER skip" instructions better

**Cons:**
- Requires changing the entire model
- May not be compatible with Nova Sonic architecture
- Not a solution for Nova Sonic specifically

### Option 5: Two-Stage IDV Agent
**Pros:**
- Split IDV into two separate agents:
  - `idv-collect`: Only collects credentials (no transfer tools)
  - `idv-verify`: Only verifies and transfers (no user interaction)
- First agent CANNOT skip because it has no transfer tools

**Cons:**
- More complex architecture
- Additional handoff overhead
- Requires significant refactoring

## Recommendation

Given the user's constraint of "no hard-coding", the most viable solution is:

**Option 1: Remove `transfer_to_banking` from IDV allowedTools**

Modify `backend/personas/idv.json`:
```json
{
  "allowedTools": [
    "perform_idv_check",
    "return_to_triage"
    // Remove all transfer_to_* tools except return_to_triage
  ]
}
```

Update IDV prompt to:
1. Ask for credentials
2. Call `perform_idv_check`
3. If VERIFIED: Call `return_to_triage` with taskCompleted="identity_verified"
4. If FAILED: Retry up to 3 times, then call `return_to_triage` with taskCompleted="verification_failed"

Update Triage to:
- Check if returning from IDV with "identity_verified"
- If yes, transfer directly to Banking with verified context

This approach uses behavioral prompts (no hard-coding) but removes the temptation for the LLM to skip steps by removing the shortcut tool.

## Test Results

All tests show the same behavior:
- `node test-websocket-client.js` - IDV skips verification
- Manual testing - Same issue
- Complex conversation tests - Same issue

The IDV agent consistently calls `transfer_to_banking` immediately upon receiving the handoff from Triage, without any user interaction.

## Next Steps

1. Implement Option 1 (remove transfer tools from IDV)
2. Update IDV prompt to use `return_to_triage` after verification
3. Update Triage to handle verified returns from IDV
4. Test the new flow
5. If successful, document the pattern for other agents

## Conclusion

Despite extensive prompt engineering, the LLM's tendency to optimize for efficiency overrides explicit instructions. The solution requires architectural changes to remove the "shortcut" option entirely, forcing the LLM to follow the intended flow.
