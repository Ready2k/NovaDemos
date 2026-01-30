# Test Multi-Agent Handoffs - Quick Guide

## Prerequisites

1. **Restart all services** to load handoff tools:
   ```bash
   ./start-all-services.sh
   ```

2. **Verify agents are running**:
   ```bash
   curl http://localhost:8080/api/agents | jq
   ```

3. **Open frontend**:
   ```bash
   open http://localhost:3000
   ```

---

## Test Scenarios

### Test 1: Triage → Banking (Simple Handoff)

**Objective:** Test basic handoff from Triage to Banking agent

**Steps:**
1. Select "Triage Agent" from dropdown
2. Click Connect
3. Wait for greeting (matthew voice)
4. Say: **"I need to check my balance"**

**Expected Result:**
- ✅ Triage says: "I'll connect you to our banking specialist"
- ✅ Voice changes from matthew (male) to joanna (female)
- ✅ Banking agent greets you
- ✅ Banking agent offers to help with balance

**Logs to Check:**
```bash
# Agent logs
[Agent:triage] 🔄 HANDOFF TRIGGERED: triage → banking (persona-SimpleBanking)
[Agent:triage] Handoff reason: User needs balance check

# Gateway logs
[Gateway] Handoff requested: triage -> persona-SimpleBanking
[Gateway] Connected to agent: persona-SimpleBanking
```

---

### Test 2: Triage → IDV (Identity Verification)

**Objective:** Test handoff to identity verification

**Steps:**
1. Select "Triage Agent" from dropdown
2. Click Connect
3. Say: **"I need to verify my identity"**

**Expected Result:**
- ✅ Triage routes to IDV
- ✅ Voice changes from matthew to stephen
- ✅ IDV agent asks for verification details
- ✅ IDV agent requests: Account Number, Sort Code, Date of Birth

**Test Verification:**
- Provide: Account Number: 12345678
- Provide: Sort Code: 11-22-33
- Provide: DOB: 15/03/1985
- ✅ IDV confirms verification

---

### Test 3: Triage → Banking → IDV → Banking (Chain Handoff)

**Objective:** Test complex handoff chain with return

**Steps:**
1. Select "Triage Agent" from dropdown
2. Click Connect
3. Say: **"I want to check my balance for account 12345678"**

**Expected Result:**
1. ✅ Triage → Banking (matthew → joanna)
2. ✅ Banking says: "I need to verify your identity first"
3. ✅ Banking → IDV (joanna → stephen)
4. ✅ IDV asks for verification
5. ✅ After verification, IDV → Banking (stephen → joanna)
6. ✅ Banking provides balance

**Voice Changes:**
- matthew (triage) → joanna (banking) → stephen (idv) → joanna (banking)

---

### Test 4: Triage → Investigation (Fraud)

**Objective:** Test handoff to fraud investigation

**Steps:**
1. Select "Triage Agent" from dropdown
2. Click Connect
3. Say: **"I don't recognize a transaction on my account"**

**Expected Result:**
- ✅ Triage routes to Investigation
- ✅ Voice changes from matthew to stephen
- ✅ Investigation agent shows empathy
- ✅ Investigation asks for transaction details
- ✅ Investigation offers to create case

---

### Test 5: Triage → Disputes

**Objective:** Test handoff to disputes specialist

**Steps:**
1. Select "Triage Agent" from dropdown
2. Click Connect
3. Say: **"I want to dispute a charge on my account"**

**Expected Result:**
- ✅ Triage routes to Disputes
- ✅ Voice changes from matthew to danielle
- ✅ Disputes agent asks for details
- ✅ Disputes agent offers to create dispute case

---

### Test 6: Triage → Mortgage

**Objective:** Test handoff to mortgage specialist

**Steps:**
1. Select "Triage Agent" from dropdown
2. Click Connect
3. Say: **"I'm interested in getting a mortgage"**

**Expected Result:**
- ✅ Triage routes to Mortgage
- ✅ Voice changes from matthew to ruth
- ✅ Mortgage agent asks about property type
- ✅ Mortgage agent starts eligibility questions

---

## Voice Reference

| Agent | Voice | Gender | Accent |
|-------|-------|--------|--------|
| Triage | matthew | Male | US |
| Banking | joanna | Female | US |
| IDV | stephen | Male | US |
| Mortgage | ruth | Female | US |
| Disputes | danielle | Female | US |
| Investigation | stephen | Male | US |

---

## What to Listen For

### Successful Handoff Indicators

1. **Voice Change** - Different voice = different agent
2. **Greeting Change** - New agent introduces themselves
3. **Tone Change** - Different personality/approach
4. **Tool Access** - New agent has different capabilities

### Failed Handoff Indicators

1. ❌ Voice doesn't change
2. ❌ Same agent continues conversation
3. ❌ Agent says "I can't help with that"
4. ❌ No greeting from new agent

---

## Troubleshooting

### Handoff doesn't trigger

**Symptoms:**
- Triage tries to help directly
- No voice change
- No handoff message in logs

**Check:**
```bash
# Verify handoff tools are loaded
docker logs agent-triage | grep "handoff tools"

# Should see:
[Agent:triage] Generated 5 handoff tools
[Agent:triage] Handoff tools configured: transfer_to_banking, transfer_to_idv, ...
```

**Fix:**
```bash
# Restart agent to reload tools
./start-all-services.sh
```

---

### Voice doesn't change

**Symptoms:**
- Handoff logs show success
- But voice stays the same

**Check:**
```bash
# Verify new agent has different voice
cat backend/personas/persona-SimpleBanking.json | grep voiceId
# Should show: "voiceId": "joanna"

cat backend/personas/triage.json | grep voiceId
# Should show: "voiceId": "matthew"
```

**Fix:**
- Verify persona configs have correct voiceId
- Restart services

---

### Agent loops back to triage

**Symptoms:**
- Handoff happens
- But immediately returns to triage

**Check:**
```bash
# Check circuit breaker
docker logs gateway | grep "handoff"

# Should NOT see:
[Gateway] Max handoffs reached
```

**Fix:**
- Review agent prompts
- Ensure agents don't call transfer_to_triage
- Check handoff logic

---

## Success Criteria

### ✅ All Tests Pass When:

1. **Triage routes correctly** based on user intent
2. **Voice changes** indicate agent transitions
3. **New agents greet** appropriately
4. **Handoff logs** show successful routing
5. **No errors** in agent or gateway logs
6. **Circuit breaker** doesn't trigger
7. **Context preserved** across handoffs

---

## Advanced Tests

### Test 7: Multiple Handoffs in One Session

**Steps:**
1. Start with Triage
2. Get routed to Banking
3. Ask about disputes → Banking → Disputes
4. Ask about fraud → Disputes → Investigation

**Expected:**
- ✅ Multiple handoffs work
- ✅ Each handoff has voice change
- ✅ Circuit breaker allows up to 3 handoffs

---

### Test 8: Circuit Breaker

**Steps:**
1. Trigger 4+ handoffs in one session
2. Try to exceed limit

**Expected:**
- ✅ First 3 handoffs succeed
- ✅ 4th handoff blocked
- ✅ Error message shown
- ✅ Logs show: "Max handoffs reached"

---

## Quick Commands

```bash
# Restart services
./start-all-services.sh

# Check agents
curl http://localhost:8080/api/agents | jq

# Watch triage logs
docker logs -f agent-triage | grep -E "HANDOFF|Tool called"

# Watch gateway logs
docker logs -f gateway | grep -E "Handoff|Connected to agent"

# Check personas
curl http://localhost:8080/api/personas | jq

# Test API
curl http://localhost:8080/health
```

---

## Reporting Issues

If you find issues, note:

1. **Which test scenario** failed
2. **What happened** vs what was expected
3. **Voice changes** (did they occur?)
4. **Agent logs** (handoff triggered?)
5. **Gateway logs** (routing successful?)
6. **Error messages** (any errors?)

Include:
- Test scenario number
- User input
- Expected behavior
- Actual behavior
- Relevant log excerpts

---

## Summary

Test all 6 basic scenarios to verify:
- ✅ Triage routes correctly
- ✅ Voice changes work
- ✅ Agents have correct tools
- ✅ Context is preserved
- ✅ Circuit breaker works

**Ready to test!** 🚀

Start with Test 1 (Triage → Banking) as it's the simplest handoff.
