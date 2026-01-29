# Quick Test Guide

## Start Services
```bash
./restart-local-services.sh
```

## Test Journey

1. Open: http://localhost:3000
2. Say: "I want to check my balance"
3. Provide: Account **12345678**, Sort Code **112233**

## Expected Behavior

### ✅ What Should Happen

```
Triage: "I'll connect you to our identity verification specialist."
↓
IDV: "What's your account number?"
You: "12345678"
IDV: "And your sort code?"
You: "112233"
IDV: "Thank you Sarah Johnson, you're verified."
↓
Banking: "Hello Sarah, let me fetch your balance for you..."
Banking: [Calls agentcore_balance]
Banking: "Your current balance is £1,200.00"  ← REAL DATA
Banking: [Returns to triage]
↓
Triage: "Is there anything else I can help you with, Sarah?"
```

### ❌ What Should NOT Happen

- Banking asks "How can I help you?" ❌
- Banking says "£1,234.56" (mock data) ❌
- Logs show "Falling back to local implementation" ❌
- Silent failures ❌

## Check Logs

### Banking Agent
```bash
tail -f logs/agent-banking.log | grep -E "Combined context|Tool called|AgentCore"
```

**Expected:**
```
[Agent:persona-SimpleBanking] Combined context (XXX chars) + persona prompt...
[Agent:persona-SimpleBanking] Tool called: agentcore_balance
[Agent:persona-SimpleBanking] 💰 BANKING TOOL: agentcore_balance
```

### Local Tools
```bash
tail -f logs/local-tools.log | grep -E "AgentCore|balance"
```

**Expected:**
```
[LocalTools] ✅ AgentCore credentials available
[LocalTools] ⚠️  NO FALLBACK DATA - AgentCore failures will throw errors
[LocalTools] Calling AgentCore Gateway for agentcore_balance...
[LocalTools] AgentCore response status: 200
[LocalTools] AgentCore result: {...balance: 1200.0...}
```

## Quick Verification

### Test AgentCore Directly
```bash
curl -s -X POST http://localhost:9000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"agentcore_balance","input":{"accountId":"12345678","sortCode":"112233"}}' \
  | jq '.result.content[0].text' | jq -r '.' | jq '.balance'
```

**Expected:** `1200` (not `1234.56`)

## Troubleshooting

### Issue: Banking asks "How can I help?"
**Check:** Context order in logs
```bash
grep "Combined context" logs/agent-banking.log
```
**Should see:** "Combined context (XXX chars) + persona prompt..."

### Issue: Mock data (£1,234.56)
**Check:** AgentCore URL
```bash
grep "AGENTCORE_GATEWAY_URL" backend/.env
```
**Should be:** `https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp`

### Issue: Tool errors
**Check:** Local-tools startup
```bash
head -20 logs/local-tools.log
```
**Should see:** "✅ AgentCore credentials available"

## Success Checklist

- [ ] Services start without errors
- [ ] Banking greets by name: "Hello Sarah..."
- [ ] Banking acts immediately: "let me fetch your balance..."
- [ ] Banking calls agentcore_balance tool
- [ ] Banking speaks real balance: "£1,200.00"
- [ ] Banking returns to triage
- [ ] No "How can I help?" from Banking
- [ ] No mock data (£1,234.56)
- [ ] No fallback messages in logs

## All Good? ✅

If all checks pass, the system is working correctly!

- Context injection: ✅
- AgentCore integration: ✅
- No fallback data: ✅
- Real data only: ✅

Ready for production testing! 🎉
