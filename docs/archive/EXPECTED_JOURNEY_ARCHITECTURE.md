# Expected Journey Architecture

## Your Expected Journey

```
User connects
  ↓
Triage Agent (matthew): "Hi there, welcome to Barclays..."
  ↓
User: "I want to check my balance"
  ↓
Triage → IDV Agent (stephen): "To get started, please provide..."
  ↓
User: "Account 12345678, sort code 112233"
  ↓
IDV verifies → Stores: {verified: true, account: "12345678", name: "Sarah"}
  ↓
IDV → Balance Agent (joanna): "I'm just fetching your balance..."
  ↓
Balance calls tool → Gets £xxx.xx
  ↓
Balance → Triage (matthew): "Is there anything else I can help you with Sarah?"
  ↓
User: "My balance looks lower, can you tell me my last 5 transactions?"
  ↓
Triage → Transactions Agent (joanna): "Let me fetch your last 5 transactions..."
  ↓
Transactions calls tool → Gets transactions
  ↓
Transactions → Triage (matthew): "Is there anything else I can help you with Sarah?"
```

## Architecture Required

### 1. Agent Orchestration Layer

**Triage Agent** acts as the orchestrator:
- Routes to specialist agents
- Receives return handoffs
- Maintains conversation continuity
- Greets user by name after first interaction

### 2. Specialist Agents

Each specialist agent:
- Performs specific task
- Has access to relevant tools
- Can call sub-agents if needed
- Returns to Triage when done

### 3. Memory/Context System

**Shared Session Memory**:
```json
{
  "sessionId": "xxx",
  "verified": true,
  "account": "12345678",
  "sortCode": "112233",
  "userName": "Sarah",
  "balance": 1234.56,
  "lastAgent": "balance",
  "conversationHistory": [...]
}
```

### 4. Handoff Types

**Forward Handoff** (Triage → Specialist):
```json
{
  "type": "handoff_request",
  "targetAgent": "idv",
  "reason": "User needs verification",
  "context": {
    "userRequest": "check balance",
    "sessionMemory": {...}
  }
}
```

**Return Handoff** (Specialist → Triage):
```json
{
  "type": "handoff_request",
  "targetAgent": "triage",
  "reason": "Task complete",
  "context": {
    "taskCompleted": "balance_check",
    "result": "£1234.56",
    "sessionMemory": {...}
  }
}
```

## Current Implementation Gaps

### ✅ What We Have
1. Basic agent handoff (Triage → Banking)
2. Voice changes on handoff
3. Handoff tools (transfer_to_*)
4. Multiple agents running

### ❌ What's Missing

1. **Return handoffs**: Agents can't hand back to Triage
2. **Session memory**: No shared context between agents
3. **Multi-hop routing**: Can't do Triage → IDV → Balance → Triage
4. **Context preservation**: User name, verification status not passed
5. **Tool results in handoff**: Can't pass balance/transactions to next agent
6. **Orchestration logic**: Triage doesn't know when to expect return

## Implementation Options

### Option A: Enhanced Agent Handoff (Recommended)

**Pros**:
- Voice changes for each specialist
- Clear separation of concerns
- Scalable to many agents
- Natural conversation flow

**Cons**:
- More complex routing
- Need session memory system
- Gateway becomes more sophisticated

**Changes Needed**:
1. Add `transfer_back_to_triage` tool to all agents
2. Implement session memory in Gateway
3. Pass context in handoff messages
4. Update Triage to handle returns

### Option B: Single Banking Agent with Sub-Workflows

**Pros**:
- Simpler routing
- State management easier
- Already partially implemented

**Cons**:
- No voice changes (less engaging)
- Single agent does everything
- Harder to scale

**Changes Needed**:
1. Enhance banking-master workflow
2. Add tools for balance, transactions
3. Implement workflow execution

### Option C: Hybrid Approach (Best of Both)

**Pros**:
- Voice changes for major transitions
- Sub-workflows for related tasks
- Balanced complexity

**Cons**:
- Need both systems working together

**Architecture**:
```
Triage Agent (matthew)
  ↓ handoff
Banking Orchestrator Agent (joanna)
  ├─ Sub-workflow: IDV (same voice)
  ├─ Sub-workflow: Balance (same voice)
  └─ Sub-workflow: Transactions (same voice)
  ↓ handoff back
Triage Agent (matthew)
```

## Recommended Next Steps

### Phase 1: Session Memory (Critical)
1. Add Redis-based session store to Gateway
2. Store: verification status, account details, user name
3. Pass session context in handoff messages
4. Agents can read/write to session memory

### Phase 2: Return Handoffs
1. Add `transfer_back_to_triage` tool
2. Update Gateway to handle return routing
3. Triage agent recognizes returning users
4. Pass task summary in return handoff

### Phase 3: Sub-Agent Tools
1. Create balance check tool
2. Create transactions tool
3. Create IDV verification tool
4. Banking agent can call these directly

### Phase 4: Orchestration Logic
1. Triage knows which agent to call for what
2. Agents know when to return to Triage
3. Context flows through entire journey
4. User name used in greetings

## Quick Win: Simplified Journey

To test the current system with your journey:

**Simplified Flow**:
```
User: "I want to check my balance"
  ↓
Triage (matthew): "Let me connect you to our banking specialist"
  ↓ transfer_to_banking
Banking (joanna): "I can help with that. For verification, please provide your account number"
  ↓
User: "12345678"
  ↓
Banking: "Thanks, let me fetch your balance... Your balance is £1234.56"
  ↓
User: "Can you show my last 5 transactions?"
  ↓
Banking: "Sure, here are your last 5 transactions: [...]"
```

**What's Different**:
- No return to Triage (stays with Banking)
- No voice changes mid-conversation
- Banking agent does IDV + Balance + Transactions
- Simpler but less sophisticated

## Decision Point

**Question**: Which approach do you want?

**A. Full Multi-Agent Journey** (Your expected journey)
- Requires: Session memory, return handoffs, context passing
- Timeline: 2-3 hours of implementation
- Result: Exactly matches your expected journey

**B. Simplified Single-Agent** (Quick test)
- Requires: Just add tools to Banking agent
- Timeline: 30 minutes
- Result: Works but no voice changes or returns

**C. Hybrid Approach** (Balanced)
- Requires: Session memory + sub-workflows
- Timeline: 1-2 hours
- Result: Voice changes for major transitions, sub-workflows for tasks

Let me know which direction you want to go, and I'll implement it!
