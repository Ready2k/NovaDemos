# Test Memory Fix - Quick Guide

## What Was Fixed

The Banking agent now receives and uses the verified user information (customer name, account, sort code) from the IDV agent. No more asking for details twice!

## Start Services

```bash
./restart-local-services.sh
```

Wait for all services to start (about 10-15 seconds).

## Test the Journey

1. **Open Frontend:** http://localhost:3000

2. **Start Conversation:**
   - Say: "I want to check my balance"
   - Triage will route you to IDV

3. **Verify Identity:**
   - IDV asks for account number and sort code
   - Say: "12345678 and 112233"
   - IDV verifies and says: "Great, Sarah. You've been verified"

4. **Banking Service:**
   - Banking should greet you: "Hello Sarah, I can help you with your balance..."
   - Banking fetches balance using stored account details
   - Banking speaks: "Your current balance is £1,234.56"

5. **Return to Triage:**
   - Banking returns you to Triage
   - Triage should still know your name: "Is there anything else I can help you with, Sarah?"

## What to Look For

### ✅ Success Indicators

1. **IDV Agent:**
   - Says "Great, Sarah. You've been verified"
   - Knows your name from the tool result

2. **Banking Agent:**
   - Greets you by name: "Hello Sarah..."
   - Does NOT ask for account details again
   - Uses stored details to fetch balance

3. **Triage Agent:**
   - Remembers your name after return
   - Can route you to other services with context

### ❌ Failure Indicators

1. Banking agent doesn't use your name
2. Banking agent asks for account details again
3. Banking agent says "I don't have your account information"
4. Triage forgets your name after return

## Check Logs

### IDV Agent - Storing Verified User
```bash
tail -f logs/agent-idv.log | grep "Stored verified user"
```
Expected: `[Agent:idv] ✅ Stored verified user in session: Sarah Johnson`

### Gateway - Updating Memory
```bash
tail -f logs/gateway.log | grep "Updating session memory"
```
Expected: `[Gateway] Updating session memory: { verified: true, userName: 'Sarah Johnson', ... }`

### Gateway - Passing Memory to Banking
```bash
tail -f logs/gateway.log | grep "Passed verified user"
```
Expected: `[Gateway] Passed verified user to agent banking: Sarah Johnson`

### Banking Agent - Restoring User
```bash
tail -f logs/agent-banking.log | grep "Restored verified user"
```
Expected: `[Agent:banking] ✅ Restored verified user from memory: Sarah Johnson`

## Test Accounts

Use these test accounts (from AgentCore):

| Account Number | Sort Code | Customer Name  |
|---------------|-----------|----------------|
| 12345678      | 112233    | Sarah Johnson  |
| 87654321      | 112233    | John Smith     |

## Troubleshooting

### Banking Agent Doesn't Use Name

**Check:**
1. IDV agent stored the user: `grep "Stored verified user" logs/agent-idv.log`
2. Gateway updated memory: `grep "Updating session memory" logs/gateway.log`
3. Banking received memory: `grep "Restored verified user" logs/agent-banking.log`

**If any step is missing, restart services:**
```bash
./restart-local-services.sh
```

### Banking Agent Asks for Account Details

This means the memory wasn't passed. Check:
1. Gateway logs for handoff: `grep "handoff_request" logs/gateway.log`
2. Gateway logs for memory passing: `grep "Passed verified user" logs/gateway.log`

### Services Won't Start

**Check ports:**
```bash
lsof -i :8080  # Gateway
lsof -i :8081  # Triage
lsof -i :8082  # IDV
lsof -i :8083  # Banking
lsof -i :9000  # Local Tools
```

**Kill and restart:**
```bash
pkill -f "node.*gateway"
pkill -f "node.*agent"
pkill -f "node.*local-tools"
./restart-local-services.sh
```

## Full Journey Flow

```
User: "I want to check my balance"
  ↓
Triage: "Let me verify your identity first"
  → Calls transfer_to_idv
  ↓
IDV: "Please provide your 8-digit account number and 6-digit sort code"
  ↓
User: "12345678 and 112233"
  ↓
IDV: Calls perform_idv_check via AgentCore
  → Returns: { auth_status: 'VERIFIED', customer_name: 'Sarah Johnson' }
  → Stores in session.verifiedUser
  → Notifies gateway to update Redis
  ↓
IDV: "Great, Sarah. You've been verified. Let me connect you to our banking specialist."
  → Calls transfer_to_banking with verified context
  ↓
Gateway: Receives handoff
  → Updates Redis memory
  → Routes to Banking agent
  → Passes memory in session_init
  ↓
Banking: Receives session_init with memory
  → Restores session.verifiedUser
  → Has customer name and account details
  ↓
Banking: "Hello Sarah, I can help you with your balance. Let me fetch that for you..."
  → Calls agentcore_balance(accountId="12345678", sortCode="112233")
  → Returns: { balance: 1234.56 }
  ↓
Banking: "Your current balance is £1,234.56. Is there anything else I can help you with?"
  ↓
User: "No, that's all"
  ↓
Banking: "Perfect, Sarah. Let me transfer you back to our main menu."
  → Calls return_to_triage
  ↓
Triage: "Is there anything else I can help you with today, Sarah?"
```

## Success!

If you see the Banking agent greet you by name and fetch your balance without asking for account details again, the memory fix is working! 🎉

## Documentation

- Full details: `MEMORY_HANDOFF_COMPLETE.md`
- Implementation: `MEMORY_FIX_APPLIED.md`
- Architecture: `EXPECTED_JOURNEY_ARCHITECTURE.md`
