# Quick Start - A2A System Testing

## TL;DR

```bash
# 1. Start the system
docker-compose -f docker-compose-a2a.yml up --build

# 2. Run tests (in another terminal)
./test-a2a-chat.sh

# 3. Open browser
open http://localhost:3000

# 4. Test conversation
# You: "I need to check my balance"
# Provide: "account 12345678 sort code 112233"
# Expected: Balance of £1200
```

## What Was Fixed

✅ **Tool definitions** - Standardized field names (`accountNumber` everywhere)  
✅ **Field transformation** - Auto-converts `accountNumber` → `accountId` for AgentCore  
✅ **Docker volumes** - Fixed to mount correct tools directory  
✅ **Environment variables** - Added AgentCore credentials to local-tools  
✅ **Logging** - Enhanced debugging output  

## Test Credentials

**Valid Account** (should work):
- Account: `12345678`
- Sort Code: `112233`
- Expected Balance: `£1200`
- Expected Transactions: `3`

**Invalid Account** (should fail):
- Account: `99999999`
- Sort Code: `999999`
- Expected: Verification failure after 3 attempts

## Expected Flow

```
1. User: "I need to check my balance"
2. Triage Agent → Transfers to IDV Agent
3. IDV Agent: "Please provide your account number and sort code"
4. User: "account 12345678 sort code 112233"
5. IDV Agent → Calls perform_idv_check → VERIFIED
6. IDV Agent → Transfers to Banking Agent
7. Banking Agent: "Hello [Name], I can help with your balance"
8. Banking Agent → Calls agentcore_balance → £1200
9. Banking Agent: "Your balance is £1,200.00"
```

## Debugging

```bash
# Check agent registration
curl http://localhost:8080/api/agents | jq '.'

# Check tools
curl http://localhost:9000/tools/list | jq '.tools[] | .name'

# Test IDV directly
curl -X POST http://localhost:9000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"perform_idv_check","input":{"accountNumber":"12345678","sortCode":"112233"}}' | jq '.'

# Test balance directly
curl -X POST http://localhost:9000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"agentcore_balance","input":{"accountNumber":"12345678","sortCode":"112233"}}' | jq '.'

# View logs
docker-compose -f docker-compose-a2a.yml logs -f gateway
docker-compose -f docker-compose-a2a.yml logs -f agent-triage
docker-compose -f docker-compose-a2a.yml logs -f agent-idv
docker-compose -f docker-compose-a2a.yml logs -f agent-banking
docker-compose -f docker-compose-a2a.yml logs -f local-tools
```

## Common Issues

**Agents not registering?**
```bash
# Check Redis
docker ps | grep redis

# Check gateway logs
docker-compose -f docker-compose-a2a.yml logs gateway | grep -i error
```

**Tools failing?**
```bash
# Check local-tools logs
docker-compose -f docker-compose-a2a.yml logs local-tools | grep -E "(AgentCore|error)"

# Verify credentials in .env
cat .env | grep -E "(AWS_ACCESS_KEY_ID|AGENTCORE_GATEWAY_URL)"
```

**Handoff not working?**
```bash
# Check gateway handoff logs
docker-compose -f docker-compose-a2a.yml logs gateway | grep -i handoff

# Check agent registration
curl http://localhost:8080/api/agents
```

## Files Changed

- `backend/tools/agentcore_balance.json` - Field names
- `backend/tools/agentcore_transactions.json` - Field names  
- `local-tools/src/server.ts` - Field transformation
- `docker-compose-a2a.yml` - Volumes and env vars

## Documentation

- `A2A_TESTING_GUIDE.md` - Complete testing guide
- `FIXES_APPLIED.md` - Detailed fix documentation
- `test-a2a-chat.sh` - Automated test script

## Success Criteria

✅ Gateway health check passes  
✅ All agents registered (triage, idv, banking)  
✅ Tools loaded (perform_idv_check, agentcore_balance, get_account_transactions)  
✅ IDV check returns VERIFIED for valid credentials  
✅ Balance check returns £1200  
✅ Transaction check returns 3 transactions  
✅ Handoffs work smoothly between agents  

## Next Steps

1. Start system: `docker-compose -f docker-compose-a2a.yml up --build`
2. Run tests: `./test-a2a-chat.sh`
3. Open browser: http://localhost:3000
4. Test the flow with valid credentials
5. Test error handling with invalid credentials
6. Monitor logs for any issues

## Support

For detailed information, see:
- `A2A_TESTING_GUIDE.md` - Full testing procedures
- `FIXES_APPLIED.md` - Technical details of fixes
- Gateway logs - Real-time debugging
