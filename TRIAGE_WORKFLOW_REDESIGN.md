# Task 7: Triage Workflow Redesign - COMPLETE

## Problem
The original Triage workflow was too simplistic:
- Didn't capture user intent properly
- Didn't check if user was already verified
- Didn't distinguish between general questions (public info) vs account-specific requests
- Always routed to ID&V even for simple questions like "Where is my nearest branch?"

## Solution Implemented

### 1. New Workflow Structure (`backend/workflows/workflow_triage.json`)

Created a comprehensive decision-based workflow:

```
Start → Check Return → [Returning?]
                         ↓ Yes → Welcome Back → Check Done
                         ↓ No → Greet New → Capture Intent
                                              ↓
                                         Classify Intent
                                              ↓
                         [General or Account-Specific?]
                         ↓                    ↓
                    General              Account-Specific
                         ↓                    ↓
                  Handle General        Check Verified
                         ↓                    ↓
                   End General      [Already Verified?]
                                    ↓              ↓
                                   No             Yes
                                    ↓              ↓
                              Route to IDV    Route by Intent
                                    ↓              ↓
                                End IDV       End Routed
```

**Key Decision Nodes:**
- `check_return` - Is this a return from another agent?
- `classify_intent` - General (public info) or account-specific?
- `check_verified` - Is user already verified?
- `check_done` - Does user need anything else?

### 2. Updated Persona Prompt (`backend/prompts/persona-triage.txt`)

Implemented the complete logic flow:

#### Step 1: Check if Return or New Contact
- Check session memory for previous agent interactions
- Check if user is already verified
- Welcome returning users: "Is there anything else I can help you with today, [Name]?"
- Greet new users: "Hello, welcome to Barclays Bank. How can I help you today?"

#### Step 2: Classify Intent Type

**GENERAL (Public Information) - NO ID&V NEEDED:**
- Branch locations
- Opening hours
- Product information
- Interest rates
- General banking questions
- Contact information

**ACCOUNT-SPECIFIC - ID&V REQUIRED:**
- Balance checks
- Transaction history
- Payments
- Account details
- Disputes
- Fraud reports

#### Step 3: Handle Based on Intent Type

**IF GENERAL:**
- Answer directly (Triage can handle this)
- NO ID&V needed
- NO handoff needed
- Ask if they need anything else

**IF ACCOUNT-SPECIFIC:**
- Go to Step 4 (Check Verification)

#### Step 4: Check Verification Status

**IF NOT VERIFIED:**
- Route to ID&V with SPECIFIC intent
- Example: "User wants to check their balance" (not just "user needs help")
- Say: "Let me verify your identity first, then I'll help you with [their request]."

**IF ALREADY VERIFIED:**
- Route directly to appropriate service
- Banking, Disputes, Investigation, Mortgage, etc.
- Say: "I'll connect you to our [service] specialist right away."

## Key Features

### 1. Intent Preservation
- Captures specific user request (e.g., "balance check")
- Passes intent through handoffs: Triage → IDV → Banking
- Banking agent receives context and acts immediately

### 2. Smart Routing
- General questions handled directly (no unnecessary handoffs)
- Account-specific requests check verification first
- Already-verified users skip ID&V and go straight to specialist

### 3. Return Handling
- Welcomes returning users by name
- Asks if they need anything else
- Routes to new service or says goodbye

### 4. Memory-Aware
- Checks session memory for verification status
- Uses customer name when available
- Avoids asking "How can I help?" when context is known

## Examples

### Example 1: General Question (No ID&V)
```
User: "Where is my nearest branch?"
Triage: "Our nearest branch to you is on High Street, open Monday to Friday 9am-5pm. 
         Is there anything else I can help you with today?"
[NO HANDOFF - handled directly]
```

### Example 2: Account-Specific, Not Verified
```
User: "I want to check my balance"
Triage: "Let me verify your identity first, then I'll help you check your balance."
[HANDOFF: transfer_to_idv with reason="User wants to check their balance"]
↓
IDV: Verifies user → Stores verified user → Hands off to Banking
↓
Banking: "Hello Sarah, let me fetch your balance for you..."
```

### Example 3: Account-Specific, Already Verified
```
[Memory: verified=true, userName="Sarah Jones", account="12345678"]
User: "Can you show me my recent transactions?"
Triage: "I'll get that for you right away, Sarah."
[HANDOFF: transfer_to_banking with reason="User wants to see recent transactions"]
↓
Banking: "Hello Sarah, let me fetch your recent transactions..."
```

### Example 4: Returning User
```
[User returns from Banking, task="balance_check", userName="Sarah Jones"]
Triage: "Is there anything else I can help you with today, Sarah?"
User: "No, that's all, thanks"
Triage: "Thank you for banking with Barclays. Have a great day, Sarah!"
[NO HANDOFF - session complete]
```

## Files Modified

1. **backend/workflows/workflow_triage.json**
   - Created new workflow structure with decision nodes
   - Added nodes: check_return, classify_intent, check_verified, handle_general, route_by_intent
   - Defined edges for all decision paths

2. **backend/prompts/persona-triage.txt**
   - Complete rewrite to match new workflow logic
   - Added step-by-step instructions for each decision point
   - Added examples for all scenarios
   - Emphasized intent preservation and memory awareness

## Testing Checklist

- [ ] Test general question (branch location) - should handle directly
- [ ] Test account-specific, not verified (balance) - should route to ID&V with intent
- [ ] Test account-specific, already verified (transactions) - should route directly to Banking
- [ ] Test returning user, needs more help - should route to appropriate service
- [ ] Test returning user, done - should say goodbye
- [ ] Verify intent flows through: Triage → IDV → Banking
- [ ] Verify Banking receives verified user data and acts immediately

## Expected Journey

```
User: "I want to check my balance"
↓
Triage: Captures intent "balance check" → Routes to IDV
↓
IDV: Verifies user → Stores verified user (Sarah Jones, 12345678, 112233) → Hands off to Banking
↓
Banking: Receives verified user + userIntent → Acts immediately
Banking: "Hello Sarah, let me fetch your balance for you..."
Banking: [Calls agentcore_balance with real account details]
Banking: "Your current balance is £1,200.00"
↓
Banking: Returns to Triage
↓
Triage: "Is there anything else I can help you with, Sarah?"
```

## Status
✅ **COMPLETE** - Workflow structure and persona prompt updated to implement intelligent routing logic
