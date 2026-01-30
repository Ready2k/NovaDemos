# Journey Comparison: Expected vs. Current

## Your Expected Journey

```
┌─────────────────────────────────────────────────────────────┐
│ USER CONNECTS                                               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TRIAGE AGENT (matthew)                                      │
│ "Hi there, welcome to Barclays, how can I help?"           │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    User: "Check balance"
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TRIAGE → IDV AGENT (stephen)                                │
│ "For authentication, please provide account & sort code"   │
└─────────────────────────────────────────────────────────────┘
                           ↓
              User: "12345678, 112233"
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ IDV AGENT (stephen)                                         │
│ Calls verify_account tool                                  │
│ Stores: {verified: true, account: "12345678", name: "Sarah"}│
│ "Great, you've been verified"                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ IDV → BALANCE AGENT (joanna)                                │
│ Receives: {verified: true, account: "12345678"}            │
│ "I'm just fetching your balance..."                        │
│ Calls get_balance tool                                     │
│ "Your balance is £1234.56"                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ BALANCE → TRIAGE AGENT (matthew)                            │
│ Receives: {balance: 1234.56, userName: "Sarah"}            │
│ "Is there anything else I can help you with Sarah?"        │
└─────────────────────────────────────────────────────────────┘
                           ↓
         User: "Show my last 5 transactions"
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TRIAGE → TRANSACTIONS AGENT (joanna)                        │
│ Receives: {account: "12345678", verified: true}            │
│ "Let me fetch your last 5 transactions..."                 │
│ Calls get_transactions tool                                │
│ "Your last 5 transactions are: [...]"                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TRANSACTIONS → TRIAGE AGENT (matthew)                       │
│ "Is there anything else I can help you with Sarah?"        │
└─────────────────────────────────────────────────────────────┘
```

## Current Implementation

```
┌─────────────────────────────────────────────────────────────┐
│ USER CONNECTS                                               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TRIAGE AGENT (matthew)                                      │
│ "Hi there, welcome to Barclays, how can I help?"           │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    User: "Check balance"
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TRIAGE → BANKING AGENT (joanna)                             │
│ "I can help with that"                                     │
│ [STAYS WITH BANKING - NO RETURN TO TRIAGE]                 │
│ [NO CONTEXT PASSED - DOESN'T KNOW VERIFICATION STATUS]     │
│ [NO TOOLS - CAN'T CHECK BALANCE]                           │
└─────────────────────────────────────────────────────────────┘
```

## Key Differences

| Feature | Expected | Current | Gap |
|---------|----------|---------|-----|
| **Voice Changes** | 4 changes (matthew ↔ stephen ↔ joanna) | 1 change (matthew → joanna) | ❌ Missing return handoffs |
| **Context Passing** | Account, verification, name passed | Nothing passed | ❌ No session memory |
| **Agent Returns** | Returns to Triage after each task | Stays with Banking | ❌ No return mechanism |
| **User Name** | "Sarah" used in greetings | Generic greeting | ❌ No name storage |
| **Sub-Agents** | IDV, Balance, Transactions | Just Banking | ❌ No specialized agents |
| **Tools** | verify_account, get_balance, get_transactions | None | ❌ No tools implemented |

## What Needs to Be Built

### 1. Session Memory System ⭐ CRITICAL

**Purpose**: Store context between agent handoffs

**Implementation**:
```typescript
// Gateway maintains session memory
interface SessionMemory {
  sessionId: string;
  verified: boolean;
  account?: string;
  sortCode?: string;
  userName?: string;
  balance?: number;
  lastAgent: string;
  conversationSummary: string;
}

// Pass in handoff messages
{
  type: 'handoff_request',
  targetAgent: 'balance',
  context: {
    sessionMemory: sessionMemory,
    reason: 'User verified, needs balance'
  }
}
```

### 2. Return Handoff Tools ⭐ CRITICAL

**Purpose**: Allow agents to return to Triage

**Implementation**:
```typescript
// Add to handoff-tools.ts
{
  toolSpec: {
    name: 'return_to_triage',
    description: 'Return conversation to Triage agent after completing task',
    inputSchema: {
      json: JSON.stringify({
        type: 'object',
        properties: {
          taskCompleted: { type: 'string' },
          summary: { type: 'string' },
          updatedMemory: { type: 'object' }
        }
      })
    }
  }
}
```

### 3. Specialized Sub-Agents ⭐ HIGH PRIORITY

**Create**:
- Balance Agent (get_balance tool)
- Transactions Agent (get_transactions tool)
- IDV Agent already exists (needs verify_account tool)

### 4. Tool Implementations ⭐ HIGH PRIORITY

**Tools Needed**:
```typescript
// verify_account tool
{
  name: 'verify_account',
  description: 'Verify user account and sort code',
  inputSchema: {
    account: string,
    sortCode: string
  },
  output: {
    verified: boolean,
    userName: string,
    accountDetails: {...}
  }
}

// get_balance tool
{
  name: 'get_balance',
  description: 'Get account balance',
  inputSchema: {
    account: string
  },
  output: {
    balance: number,
    currency: string
  }
}

// get_transactions tool
{
  name: 'get_transactions',
  description: 'Get recent transactions',
  inputSchema: {
    account: string,
    count: number
  },
  output: {
    transactions: [...]
  }
}
```

### 5. Triage Orchestration Logic ⭐ MEDIUM PRIORITY

**Triage needs to**:
- Recognize returning handoffs
- Use user name in greetings
- Route to correct specialist
- Maintain conversation flow

## Implementation Priority

### Phase 1: Foundation (2 hours)
1. ✅ Session memory in Gateway
2. ✅ Return handoff tool
3. ✅ Context passing in handoffs
4. ✅ Test: Triage → Banking → Triage

### Phase 2: Tools (1 hour)
1. ✅ Mock verify_account tool
2. ✅ Mock get_balance tool
3. ✅ Mock get_transactions tool
4. ✅ Test: Tools return data

### Phase 3: Sub-Agents (1 hour)
1. ✅ Create Balance agent persona
2. ✅ Create Transactions agent persona
3. ✅ Update handoff tools
4. ✅ Test: Full journey

### Phase 4: Polish (30 mins)
1. ✅ User name in greetings
2. ✅ Smooth transitions
3. ✅ Error handling
4. ✅ Test: Edge cases

## Quick Test: Current System

To test what we have now:

```bash
# Start services
./restart-multi-agent.sh

# Test basic handoff
1. Open http://localhost:3000
2. Select "Triage Agent"
3. Say: "I want to check my balance"
4. Hear: Voice changes matthew → joanna
5. Banking agent responds (but can't actually check balance)
```

## Next Steps

**Choose your path**:

**A. Build Full Journey** (4-5 hours)
- Implement all phases above
- Get exactly your expected journey
- Production-ready

**B. Quick Demo** (1 hour)
- Just add session memory + return handoff
- Test round-trip: Triage → Banking → Triage
- Proof of concept

**C. Test Current System First** (15 mins)
- Verify basic handoff works
- Then decide on next steps
- Low risk

Which would you like to do?
