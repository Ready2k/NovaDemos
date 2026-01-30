# Workflow vs System Prompt - IDV Agent Recommendation

## Question

Should we use a workflow for the IDV agent, or is the system prompt sufficient?

## Answer: **YES, use the workflow!**

## Current State

You have BOTH:
- ✅ Detailed workflow: `backend/workflows/workflow_idv.json` (20+ nodes)
- ✅ System prompt: `backend/prompts/persona-idv.txt`
- ✅ Persona config: `backend/personas/idv.json` references workflow

**But the workflow is NOT being actively used** - the agent relies only on the system prompt.

## Why Use the Workflow?

### 1. Structured State Management ✅

**With Workflow:**
```
[STEP: idv_start] → [STEP: check_auth_status] → [STEP: analyze_input] → [STEP: perform_idv] → [STEP: check_result]
```
- You can see exactly where the agent is
- Deterministic flow
- Easy to debug

**Without Workflow:**
- Nova Sonic decides what to do based on prompt
- No visibility into state
- Harder to debug

### 2. Better Input Validation ✅

**Workflow has explicit validation:**
```json
{
  "id": "analyze_input",
  "label": "CRITICAL GUARDRAIL: Extract EXACT digits from user speech. NEVER pad, invent, or add digits. Check: (1) If BOTH valid 8 digit Account Number AND 6 digit Sort Code present → perform_idv. (2) If ONLY valid 8 digit Account Number present → ask_sortcode_only. (3) If ONLY valid 6 digit Sort Code present → ask_account_only. (4) If NEITHER or INVALID lengths → ask_details. NEVER call perform_idv unless you have EXACTLY 8 digits for account AND EXACTLY 6 digits for sort code."
}
```

**System Prompt just says:**
> "Extract the account number (8 digits) and sort code (6 digits)"

The workflow enforces this, the prompt hopes Nova Sonic follows it.

### 3. Sophisticated Error Handling ✅

**Workflow handles:**
- ✅ Typos: User says 9 digits instead of 8 → `handle_typo` node
- ✅ Partial input: Only account → `ask_sortcode_only` node
- ✅ Partial input: Only sort code → `ask_account_only` node
- ✅ Missing both → `ask_details` node
- ✅ Already verified → `already_verified` node (skip verification)
- ✅ General queries → `answer_public` node (bypass verification)

**System Prompt:**
- Just says "extract both numbers"
- No explicit handling for edge cases
- Relies on Nova Sonic to figure it out

### 4. Prevents Hallucination ✅

**Workflow:**
- Explicit validation before calling `perform_idv`
- "NEVER call perform_idv unless you have EXACTLY 8 digits AND EXACTLY 6 digits"
- State machine enforces this

**System Prompt:**
- Nova Sonic might hallucinate digits
- Nova Sonic might call tool with incomplete data
- No enforcement mechanism

### 5. Consistency & Reliability ✅

**Workflow:**
- Same flow every time
- Predictable behavior
- Testable

**System Prompt:**
- Varies based on Nova Sonic's interpretation
- Can be inconsistent
- Harder to test

## Workflow Features You're Missing

Your IDV workflow has sophisticated logic that's NOT in the system prompt:

### 1. Skip Verification if Already Verified
```json
{
  "id": "check_auth_status",
  "label": "Check Memory: Is 'auth_status' already 'VERIFIED'?",
  "type": "decision"
}
```
- If user is already verified, skip straight to success
- System prompt doesn't check this

### 2. Handle General Queries Without ID
```json
{
  "id": "check_intent",
  "label": "Is this a GENERAL QUERY (public info, e.g. rates, hours) or an ACCOUNT SPECIFIC query?",
  "type": "decision"
}
```
- If user asks about rates or hours, answer without asking for ID
- System prompt always asks for ID

### 3. Typo Detection
```json
{
  "id": "handle_typo",
  "label": "I heard 9 digits (Account) or 7 digits (Sort). Ask user to repeat digit-by-digit."
}
```
- Detects common typos (9 digits instead of 8)
- Asks user to repeat digit-by-digit
- System prompt doesn't handle this

### 4. Partial Input Handling
```json
{
  "id": "ask_sortcode_only",
  "label": "User provided valid 8-digit Account Number. Say: 'Thank you. Now I just need your 6-digit Sort Code to complete verification.'"
}
```
- If user only provides account, ask for sort code
- More natural conversation flow
- System prompt expects both at once

## Recommendation

### ✅ Enable the Workflow

The workflow is already configured in the persona:
```json
{
  "id": "idv",
  "workflows": ["idv"]
}
```

The workflow file exists:
```
backend/workflows/workflow_idv.json
```

**You just need to ensure it's being loaded and used by the agent runtime.**

### How Workflow + Prompt Work Together

**System Prompt:** Provides the personality, tone, and general instructions
- "You are an identity verification specialist"
- "Be professional and security-focused"
- "Use Stephen voice characteristics"

**Workflow:** Provides the structure, validation, and state management
- Exact flow: start → check → validate → verify → result
- Guardrails: "NEVER call tool without EXACTLY 8 and 6 digits"
- Error handling: typos, partial inputs, edge cases

**Together:** Best of both worlds
- Natural conversation (prompt)
- Reliable execution (workflow)
- Consistent behavior (workflow)
- Appropriate tone (prompt)

## Implementation Status

Looking at your agent runtime, workflows ARE being loaded:
```typescript
if (fs.existsSync(WORKFLOW_FILE)) {
    workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf-8'));
    console.log(`[Agent:${AGENT_ID}] Loaded workflow from ${WORKFLOW_FILE}`);
}
```

And workflow instructions ARE being injected:
```typescript
const workflowInstructions = convertWorkflowToText(workflowDef);
systemPrompt = `${personaPrompt}\n\n### WORKFLOW INSTRUCTIONS ###\n${workflowInstructions}`;
```

**So the workflow IS being used!** It's just not as visible because:
1. Nova Sonic doesn't always follow the `[STEP: node_id]` format
2. The workflow is converted to text instructions rather than enforced programmatically

## Potential Improvement: Programmatic Workflow Enforcement

Currently, the workflow is converted to text and given to Nova Sonic as instructions. Nova Sonic can choose to follow or ignore them.

**Future enhancement:** Enforce workflow programmatically
- Agent runtime tracks current node
- Only allow valid transitions
- Validate inputs before calling tools
- Enforce guardrails in code, not just prompt

This would make the workflow truly deterministic.

## Conclusion

**YES, use the workflow!** You already have it configured. The workflow provides:
- ✅ Better structure
- ✅ Better validation
- ✅ Better error handling
- ✅ Better consistency
- ✅ Better debugging

The system prompt provides personality and tone, the workflow provides structure and reliability. Together, they create a robust IDV agent.

## Next Steps

1. ✅ Keep the workflow (already configured)
2. ✅ Keep the system prompt (provides personality)
3. ✅ Monitor logs for `[STEP: node_id]` tags to see workflow execution
4. 🔄 Consider programmatic workflow enforcement for even more reliability

The workflow is your friend - it makes the agent more reliable and easier to debug! 🎉
