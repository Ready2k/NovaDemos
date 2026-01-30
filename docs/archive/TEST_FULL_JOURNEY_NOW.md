# Test Full Journey - Quick Start

## 🚀 Ready to Test!

All pieces are implemented. Let's test your expected journey.

## Quick Start

```bash
./restart-local-services.sh
```

Wait for:
```
✅ Gateway healthy
✅ Agent healthy
✅ Frontend responding
✅ Handoff tools loaded
```

## Test Scenario

### 1. Open Frontend
http://localhost:3000

### 2. Connect
- Select: "Triage Agent"
- Click: Connect

### 3. Say This
```
"I want to check my balance"
```

### 4. Listen For
- Voice change: matthew → joanna
- Banking agent asks: "For security, please provide your account number and sort code"

### 5. Say This
```
"Account is 12345678, sort code is 112233"
```

### 6. Listen For
- "Let me verify that for you..."
- "Great, Sarah. Let me fetch your balance..."
- "Your current balance is £1,234.56"
- Voice change: joanna → matthew
- "Is there anything else I can help you with today, Sarah?"

### 7. Say This
```
"Show me my last 5 transactions"
```

### 8. Listen For
- Voice change: matthew → joanna
- Banking agent lists 5 transactions
- Voice change: joanna → matthew
- "Is there anything else I can help you with today, Sarah?"

### 9. Say This
```
"No, that's all"
```

### 10. Listen For
- "Thank you for banking with Barclays. Have a great day, Sarah!"

## What You Should See

✅ Voice changes (matthew ↔ joanna)  
✅ User name remembered ("Sarah")  
✅ Balance retrieved (£1,234.56)  
✅ Transactions listed  
✅ Returns to Triage after each task  
✅ Triage greets by name  

## Watch Logs

```bash
# In another terminal
tail -f logs/agent.log | grep -E "(HANDOFF|Tool called|Tool result)"
```

You should see:
```
Tool called: transfer_to_banking
🔄 HANDOFF TRIGGERED: triage → banking
Tool called: verify_account
💰 BANKING TOOL: verify_account
Tool result: {verified: true, userName: "Sarah Johnson"}
Tool called: get_balance
💰 BANKING TOOL: get_balance
Tool result: {balance: 1234.56}
Tool called: return_to_triage
🔄 HANDOFF TRIGGERED: banking → triage
```

## Test Accounts

Try these accounts:

| Account | Sort Code | Name | Balance |
|---------|-----------|------|---------|
| 12345678 | 112233 | Sarah Johnson | £1,234.56 |
| 87654321 | 112233 | John Smith | £5,432.10 |
| 11111111 | 112233 | Test User | £999.99 |

## Troubleshooting

### No Voice Change?
Check logs: `tail -f logs/agent.log | grep HANDOFF`

### Tools Not Working?
Check logs: `tail -f logs/agent.log | grep "Tool called"`

### Name Not Remembered?
Check gateway logs: `tail -f logs/gateway.log | grep memory`

## Full Documentation

See: **FULL_JOURNEY_IMPLEMENTED.md** for complete details.

## 🎉 Enjoy Your Multi-Agent Journey!

You now have:
- ✅ Session memory
- ✅ Return handoffs
- ✅ Banking tools
- ✅ Context passing
- ✅ Voice changes
- ✅ User name recognition

Everything you asked for is implemented and ready to test!
