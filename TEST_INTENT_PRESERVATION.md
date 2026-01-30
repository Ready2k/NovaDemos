# Test Guide: Intent Preservation

## What Was Fixed
The system now preserves the original user intent through multi-agent handoffs, so Banking agent knows what the user wants without asking.

## Quick Test

### 1. Start Services
```bash
./restart-local-services.sh
```

Wait for all services to start (about 30 seconds).

### 2. Open Frontend
```
http://localhost:3000
```

### 3. Test Scenario: Balance Check

**Say:** "I want to check my balance"

**Expected Journey:**

1. **Triage Agent (Matthew voice):**
   - "Let me verify your identity first, then I'll help you check your balance."
   - [Transfers to IDV]

2. **IDV Agent (Stephen voice):**
   - "For authentication, please provide your eight digit account number and six digit sort code."
   - **You say:** "12345678, 112233"
   - "Let me check that for you..."
   - "Great, Sarah. You've been verified."
   - [Transfers to Banking]

3. **Banking Agent (Joanna voice):**
   - ✅ "Hello Sarah, let me fetch your balance for you..."
   - [Calls agentcore_balance tool]
   - "Your current balance is £1,200.00"
   - [Returns to Triage]

4. **Triage Agent (Matthew voice):**
   - "Is there anything else I can help you with today, Sarah?"

**Key Success Indicator:**
Banking agent should say "let me fetch your balance" WITHOUT asking "How can I help you?"

### 4. Check Logs

Open 3 terminal windows and run:

**Terminal 1 - Gateway:**
```bash
tail -f logs/gateway.log | grep -i "intent\|preserving"
```

**Expected output:**
```
[Gateway] Storing NEW user intent: User wants to check their balance
[Gateway] Preserving ORIGINAL user intent: User wants to check their balance
```

**Terminal 2 - IDV Agent:**
```bash
tail -f logs/agent-idv.log | grep -i "handoff\|transfer"
```

**Terminal 3 - Banking Agent:**
```bash
tail -f logs/agent-banking.log | grep -i "intent\|context"
```

**Expected output:**
```
[Agent:persona-SimpleBanking] ✅ Injecting session context into system prompt
[Agent:persona-SimpleBanking]    📋 User Intent: "User wants to check their balance"
[Agent:persona-SimpleBanking]    ✅ Verified User: Sarah Jones
[Agent:persona-SimpleBanking]    💳 Account: 12345678
```

## Test Scenarios

### Scenario 1: Balance Check (Primary Test)
- **User:** "I want to check my balance"
- **Expected:** Banking acts immediately on balance check

### Scenario 2: Transaction History
- **User:** "Show me my recent transactions"
- **Expected:** Banking acts immediately on transaction request

### Scenario 3: General Question (No Handoff)
- **User:** "Where is my nearest branch?"
- **Expected:** Triage answers directly, no handoff

### Scenario 4: Multiple Requests
- **User:** "Check my balance"
- [After balance is shown]
- **User:** "Show me my transactions"
- **Expected:** Both requests handled correctly

## Success Criteria

✅ **Intent Preserved:**
- Gateway logs show "Preserving ORIGINAL user intent"
- Banking agent receives the original intent from Triage

✅ **Banking Acts Immediately:**
- Banking says "let me fetch your balance" (not "How can I help?")
- Banking calls the appropriate tool without asking

✅ **Smooth Handoffs:**
- Voice changes: Matthew → Stephen → Joanna → Matthew
- No awkward pauses or repeated questions

✅ **Context Maintained:**
- Banking knows customer name (Sarah)
- Banking has account details (12345678)
- Banking knows what user wants (balance check)

## Troubleshooting

### Banking Still Asks "How Can I Help?"

**Check:**
1. Gateway logs - is intent being stored?
   ```bash
   grep "Storing NEW user intent" logs/gateway.log
   ```

2. Gateway logs - is intent being preserved?
   ```bash
   grep "Preserving ORIGINAL" logs/gateway.log
   ```

3. Banking logs - is intent being received?
   ```bash
   grep "User Intent" logs/agent-banking.log
   ```

### Intent Not Showing in Logs

**Possible causes:**
1. Services not rebuilt after code changes
   - Solution: Run `npm run build` in gateway/ and agents/
2. Old processes still running
   - Solution: `./restart-local-services.sh`

### Handoff Not Happening

**Check:**
1. Triage logs - is transfer tool being called?
   ```bash
   grep "transfer_to" logs/agent-triage.log
   ```

2. Gateway logs - is handoff being processed?
   ```bash
   grep "Handoff requested" logs/gateway.log
   ```

## What to Look For

### Good Signs ✅
- Gateway: "Preserving ORIGINAL user intent"
- Banking: "📋 User Intent: 'User wants to check their balance'"
- Banking: "Hello Sarah, let me fetch your balance..."
- Voice changes smoothly between agents

### Bad Signs ❌
- Gateway: "Storing NEW user intent" twice (means overwriting)
- Banking: "How can I help you?" (means no intent received)
- Banking: No "User Intent" in logs (means context not injected)
- User has to repeat their request

## Next Steps After Testing

If test passes:
- ✅ Intent preservation is working
- ✅ Multi-agent handoffs are smooth
- ✅ Ready for more complex scenarios

If test fails:
- Check logs for specific error
- Verify services were rebuilt
- Check that all services are running
- Review INTENT_PRESERVATION_FIX.md for details
