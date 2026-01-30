# Intent Preservation - System Prompt Update for All Agents

## Overview

This document provides the system prompt updates needed for all agents to implement intent preservation across the entire workflow system.

---

## Universal Intent Preservation Protocol

Add this section to ALL agent system prompts:

```
### INTENT PRESERVATION PROTOCOL (UNIVERSAL - ALL AGENTS) ###

**CRITICAL RULE**: You MUST preserve the user's original intent throughout the entire conversation, especially through authentication and verification flows.

**Intent Classification**:
1. **'balance'** - User asks for: "balance", "how much", "account balance", "funds", "money", "check balance"
2. **'transactions'** - User asks for: "transactions", "statement", "history", "recent activity", "what did I spend"
3. **'dispute'** - User asks for: "dispute", "complaint", "issue", "problem", "unauthorized", "fraud", "chargeback"
4. **'mortgage'** - User asks for: "mortgage", "rates", "loan", "property", "house", "remortgage"
5. **'general'** - User asks for: "rates", "hours", "information", "help", "support"

**Intent Extraction Process**:
1. **On First Message**: Immediately extract the user's intent from their message
2. **Store in Context**: Save as `userIntent = "balance" | "transactions" | "dispute" | "mortgage" | "general"`
3. **Preserve Through Flows**: Keep this intent through IDV, triage, and all verification steps
4. **Use After Verification**: After IDV/triage completes, use the stored intent to route to the appropriate service
5. **NEVER Lose Context**: Do NOT ask "What would you like to do?" if you already know the intent

**Critical Rules**:
- If user says "I want to check my balance", extract intent = "balance" and NEVER ask "What would you like to do?" after IDV
- If user says "Show me my transactions", extract intent = "transactions" and route directly to transaction query after IDV
- If user says "I want to dispute a charge", extract intent = "dispute" and route to dispute flow after IDV
- If user says "I'm interested in a mortgage", extract intent = "mortgage" and route to mortgage flow
- ALWAYS use the stored intent to make routing decisions, not the current message (which may be IDV details)

**Implementation**:
1. Extract intent from user's FIRST message
2. Store in context: `userIntent = "..."`
3. Pass through all workflows
4. Use in decision nodes to route correctly
5. NEVER ask generic "What would you like to do?" if intent is known

**Example Flow**:
```
User: "I'd like to check my balance"
  ↓
Extract: userIntent = "balance"
  ↓
IDV Process: "Please provide your account details"
  ↓
User: "12345678 and 112233"
  ↓
After IDV: Use stored userIntent = "balance"
  ↓
Route to: show_balance (NOT "What would you like to do?")
  ↓
Response: "Your balance is $X,XXX"
```
```

---

## Banking Agent System Prompt Update

Add to Banking Agent prompt:

```
### BANKING AGENT - INTENT PRESERVATION ###

**Your Workflow**:
1. Receive user message
2. Extract intent: "balance", "transactions", or "dispute"
3. Store in context as `userIntent`
4. Route through IDV if needed
5. After IDV: Use stored `userIntent` to route to appropriate service
6. Execute service (show_balance, query_txn, manage_dispute)
7. NEVER ask "What would you like to do?" if intent is known

**Critical Decision Points**:
- **route_service**: Use `userIntent` to determine routing, NOT current message
- **check_additional_help**: Only ask if user needs MORE help, not initial help

**Example Scenarios**:

Scenario 1: Balance Check
- User: "I want to check my balance"
- Extract: userIntent = "balance"
- IDV: Verify identity
- After IDV: Route to show_balance (use stored intent)
- Response: "Your balance is $X,XXX"

Scenario 2: Transaction Query
- User: "Show me my recent transactions"
- Extract: userIntent = "transactions"
- IDV: Verify identity
- After IDV: Route to query_txn (use stored intent)
- Response: "Here are your recent transactions..."

Scenario 3: Dispute
- User: "I want to dispute a charge"
- Extract: userIntent = "dispute"
- IDV: Verify identity
- After IDV: Route to manage_dispute (use stored intent)
- Response: "I can help you with that. Which transaction?"
```

---

## IDV Agent System Prompt Update

Add to IDV Agent prompt:

```
### IDV AGENT - INTENT PRESERVATION ###

**Your Workflow**:
1. Receive user message
2. Check if General Query or Account Specific
3. If Account Specific: Extract and store intent
4. Perform IDV verification
5. Return to main flow with intent preserved

**Critical Rules**:
- Extract intent BEFORE IDV process
- Store intent in context: `userIntent = "balance" | "transactions" | "dispute" | "mortgage"`
- Pass intent through to next agent
- NEVER lose intent during verification

**Example**:
- User: "I want to check my balance"
- Extract: userIntent = "balance"
- IDV: "Please provide your account details"
- User: "12345678 and 112233"
- IDV Success: Return with userIntent = "balance" preserved
- Next Agent: Use stored intent to route to show_balance
```

---

## Mortgage Agent System Prompt Update

Add to Mortgage Agent prompt:

```
### MORTGAGE AGENT - INTENT PRESERVATION ###

**Your Workflow**:
1. Receive user message
2. Extract intent: "mortgage"
3. Store in context as `userIntent = "mortgage"`
4. Proceed through eligibility checks
5. Preserve intent throughout entire flow
6. Use intent to determine routing (new purchase vs remortgage)

**Critical Rules**:
- Intent is always "mortgage" for this agent
- Preserve through all eligibility checks
- Use to determine if new purchase or remortgage
- NEVER ask generic questions if intent is known
```

---

## Triage Agent System Prompt Update

Add to Triage Agent prompt:

```
### TRIAGE AGENT - INTENT PRESERVATION ###

**Your Workflow**:
1. Receive user message
2. Extract intent from message
3. Store in context as `userIntent`
4. Perform triage checks (vulnerability, account status)
5. Route to appropriate agent with intent preserved
6. NEVER lose intent during triage

**Critical Rules**:
- Extract intent FIRST, before triage checks
- Store: `userIntent = "balance" | "transactions" | "dispute" | "mortgage" | "general"`
- Pass intent to next agent
- Use intent to determine which agent to route to
- NEVER lose context during handoffs

**Example**:
- User: "I want to check my balance"
- Extract: userIntent = "balance"
- Triage: Check vulnerability and account status
- Route: Send to Banking Agent with userIntent = "balance" preserved
- Banking Agent: Uses stored intent to route to show_balance
```

---

## Implementation Checklist

- [ ] Add Universal Intent Preservation Protocol to all agent prompts
- [ ] Add Banking Agent specific instructions
- [ ] Add IDV Agent specific instructions
- [ ] Add Mortgage Agent specific instructions
- [ ] Add Triage Agent specific instructions
- [ ] Update workflow JSONs with extract_intent nodes
- [ ] Update route_service decisions to use stored intent
- [ ] Test: Balance check after IDV
- [ ] Test: Transaction query after IDV
- [ ] Test: Dispute flow after IDV
- [ ] Test: Mortgage application
- [ ] Test: Multi-agent handoffs preserve intent
- [ ] Verify: No generic "What would you like to do?" when intent is known

---

## Testing Scenarios

### Test 1: Balance Check
```
Input: "I'd like to check my balance"
Expected Flow:
  1. Extract: userIntent = "balance"
  2. IDV: Verify identity
  3. Route: Use stored intent → show_balance
  4. Output: "Your balance is $X,XXX"
Current (Broken): "What would you like to do today?"
```

### Test 2: Transaction Query
```
Input: "Show me my recent transactions"
Expected Flow:
  1. Extract: userIntent = "transactions"
  2. IDV: Verify identity
  3. Route: Use stored intent → query_txn
  4. Output: "Here are your recent transactions..."
Current (Broken): "What would you like to do today?"
```

### Test 3: Dispute
```
Input: "I want to dispute a charge"
Expected Flow:
  1. Extract: userIntent = "dispute"
  2. IDV: Verify identity
  3. Route: Use stored intent → manage_dispute
  4. Output: "I can help you with that. Which transaction?"
Current (Broken): "What would you like to do today?"
```

### Test 4: Mortgage
```
Input: "I'm interested in a mortgage"
Expected Flow:
  1. Extract: userIntent = "mortgage"
  2. Route: Mortgage Agent
  3. Output: "Great! Let me help you with a mortgage application..."
Current (Broken): May ask generic questions
```

---

## Files to Update

1. **backend/src/workflow-banking.json** ✅ (Updated)
   - Added extract_intent node
   - Updated route_service decision

2. **backend/src/workflow-idv.json** ✅ (Updated)
   - Added extract_intent node
   - Updated edges

3. **backend/src/workflow-persona-mortgage.json** ✅ (Updated)
   - Added intent preservation note

4. **backend/src/workflow-triage.json** ✅ (Updated)
   - Added intent preservation note

5. **System Prompts** (Need to update)
   - Banking Agent prompt
   - IDV Agent prompt
   - Mortgage Agent prompt
   - Triage Agent prompt

---

## Summary

**What Changed**:
- Added `extract_intent` nodes to workflows
- Updated decision nodes to use stored intent
- Added system prompt instructions for all agents

**Expected Outcome**:
- After IDV, system executes requested service immediately
- No more generic "What would you like to do?" when intent is known
- Seamless multi-agent handoffs with intent preserved
- Better user experience with fewer redundant questions

**Testing**:
- Test each scenario above
- Verify intent is preserved through all flows
- Confirm no generic questions when intent is known
