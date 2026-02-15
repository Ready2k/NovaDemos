# A2A System Testing Guide

## Overview

This guide explains how to test the Agent-to-Agent (A2A) system with the banking use case.

## Architecture

```
Browser → Gateway (8080) → Agents (8081-8086) → Local Tools (9000) → AgentCore Gateway
                ↓
              Redis (6379)
```

### Agents
- **Triage Agent** (8081): Routes users to specialist agents
- **IDV Agent** (8084): Identity verification
- **Banking Agent** (8082): Balance checks, transactions
- **Mortgage Agent** (8083): Mortgage calculations
- **Disputes Agent** (8085): Transaction disputes
- **Investigation Agent** (8086): Fraud investigation

## Test Credentials

### Valid Account (Should Work)
- **Account Number**: 12345678
- **Sort Code**: 112233
- **Expected Balance**: £1200
- **Expected Transactions**: 3 transactions

### Invalid Account (Should Fail)
- **Account Number**: 99999999
- **Sort Code**: 999999
- **Expected**: Verification failure

## Starting the System

### Option 1: Docker Compose (Recommended)

```bash
# Start all services
docker-compose -f docker-compose-a2a.yml up --build

# Check logs
docker-compose -f docker-compose-a2a.yml logs -f gateway
docker-compose -f docker-compose-a2a.yml logs -f agent-triage
docker-compose -f docker-compose-a2a.yml logs -f agent-idv
docker-compose -f docker-compose-a2a.yml logs -f agent-banking
docker-compose -f docker-compose-a2a.yml logs -f local-tools

# Stop all services
docker-compose -f docker-compose-a2a.yml down
```

### Option 2: Manual Start (Development)

```bash
# Terminal 1: Redis
docker run -p 6379:6379 redis:alpine

# Terminal 2: Local Tools
cd local-tools
npm install
npm run build
npm start

# Terminal 3: Gateway
cd gateway
npm install
npm run build
npm start

# Terminal 4: Triage Agent
cd agents
npm install
npm run build
AGENT_ID=triage AGENT_PORT=8081 MODE=voice WORKFLOW_FILE=../backend/workflows/workflow_triage.json node dist/agent-runtime-unified.js

# Terminal 5: IDV Agent
cd agents
AGENT_ID=idv AGENT_PORT=8084 MODE=voice WORKFLOW_FILE=../backend/workflows/workflow_idv.json node dist/agent-runtime-unified.js

# Terminal 6: Banking Agent
cd agents
AGENT_ID=banking AGENT_PORT=8082 MODE=voice WORKFLOW_FILE=../backend/workflows/workflow_banking-master.json node dist/agent-runtime-unified.js

# Terminal 7: Frontend
cd frontend-v2
npm install
npm run build
npm start
```

## Testing Procedure

### 1. Run Health Checks

```bash
chmod +x test-a2a-chat.sh
./test-a2a-chat.sh
```

This will:
- Check gateway health
- List registered agents
- Test local-tools service
- Test IDV check directly
- Test balance check directly

### 2. Test via Browser (Chat Interface)

1. Open http://localhost:3000
2. Click "Connect" to establish WebSocket connection
3. Follow the conversation flow below

### Test Flow 1: Balance Check

```
You: "I need to check my balance"

Expected Flow:
1. Triage agent receives request
2. Triage calls transfer_to_idv tool
3. IDV agent asks for credentials
4. You provide: "account 12345678 sort code 112233"
5. IDV agent calls perform_idv_check
6. IDV agent calls transfer_to_banking
7. Banking agent greets you by name
8. Banking agent calls agentcore_balance
9. Banking agent responds: "Your balance is £1200"
```

### Test Flow 2: Transaction History

```
You: "Show me my recent transactions"

Expected Flow:
1. Banking agent calls get_account_transactions
2. Banking agent lists 3 transactions
3. Should show disputes if any exist
```

### Test Flow 3: Invalid Credentials

```
You: "Check my balance"
Triage: Transfers to IDV
You: "account 99999999 sort code 999999"

Expected Flow:
1. IDV agent calls perform_idv_check
2. Verification fails
3. IDV agent asks for corrected details
4. After 3 failed attempts, returns to triage
```

## Debugging

### Check Agent Registration

```bash
curl http://localhost:8080/api/agents | jq '.'
```

Expected output:
```json
[
  {"id": "triage", "status": "healthy", "port": 8081},
  {"id": "idv", "status": "healthy", "port": 8084},
  {"id": "banking", "status": "healthy", "port": 8082}
]
```

### Check Tool Availability

```bash
curl http://localhost:9000/tools/list | jq '.tools[] | {name: .name}'
```

Expected tools:
- perform_idv_check
- agentcore_balance
- get_account_transactions

### Test Tool Directly

```bash
# Test IDV
curl -X POST http://localhost:9000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "perform_idv_check",
    "input": {
      "accountNumber": "12345678",
      "sortCode": "112233"
    }
  }' | jq '.'

# Test Balance
curl -X POST http://localhost:9000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agentcore_balance",
    "input": {
      "accountNumber": "12345678",
      "sortCode": "112233"
    }
  }' | jq '.'
```

### Check Redis State

```bash
# Connect to Redis
docker exec -it voice_s2s-redis-1 redis-cli

# List all keys
KEYS *

# Check agent registry
HGETALL agent:registry

# Check session
KEYS session:*
GET session:<session-id>
```

### View Logs

```bash
# Gateway logs
docker-compose -f docker-compose-a2a.yml logs -f gateway | grep -E "(Handoff|Tool|IDV|Banking)"

# Agent logs
docker-compose -f docker-compose-a2a.yml logs -f agent-triage
docker-compose -f docker-compose-a2a.yml logs -f agent-idv
docker-compose -f docker-compose-a2a.yml logs -f agent-banking

# Local tools logs
docker-compose -f docker-compose-a2a.yml logs -f local-tools | grep -E "(AgentCore|Tool)"
```

## Common Issues

### Issue 1: Agents Not Registering

**Symptom**: `curl http://localhost:8080/api/agents` returns empty array

**Solution**:
1. Check agent logs for connection errors
2. Verify Redis is running: `docker ps | grep redis`
3. Check gateway logs: `docker-compose -f docker-compose-a2a.yml logs gateway`

### Issue 2: Tool Execution Fails

**Symptom**: "Tool not found" or "AgentCore request failed"

**Solution**:
1. Check .env file has AWS credentials
2. Verify AGENTCORE_GATEWAY_URL is set
3. Test tool directly: `./test-a2a-chat.sh`
4. Check local-tools logs for errors

### Issue 3: Handoff Not Working

**Symptom**: Agent doesn't transfer to specialist

**Solution**:
1. Check triage agent has handoff tools
2. Verify target agent is registered
3. Check gateway logs for handoff events
4. Ensure Redis is accessible

### Issue 4: Credentials Not Extracted

**Symptom**: Agent keeps asking for credentials

**Solution**:
1. Check gateway intent-parser logs
2. Verify format: "account 12345678 sort code 112233"
3. Check memory_update messages in gateway logs

### Issue 5: Balance Returns Wrong Value

**Symptom**: Balance is not £1200

**Solution**:
1. Verify account number: 12345678
2. Verify sort code: 112233
3. Check AgentCore Gateway response in local-tools logs
4. Ensure accountNumber → accountId transformation is working

## Expected Results

### Successful Balance Check
```
User: "I need to check my balance"
Triage: "I'll connect you to our identity verification specialist."
[Handoff to IDV]
IDV: "For authentication, please provide your 8-digit account number and 6-digit sort code."
User: "account 12345678 sort code 112233"
IDV: "Thank you. Verifying your details..."
[Handoff to Banking]
Banking: "Hello [Customer Name], I can help you with your balance."
Banking: "Your current balance is £1,200.00"
```

### Successful Transaction Check
```
User: "Show me my recent transactions"
Banking: "Here are your recent transactions:
1. [Date] - [Merchant] - £[Amount]
2. [Date] - [Merchant] - £[Amount]
3. [Date] - [Merchant] - £[Amount]"
```

## Performance Metrics

- **Agent Registration**: < 2 seconds
- **Handoff Latency**: < 500ms
- **Tool Execution**: < 2 seconds
- **End-to-End Flow**: < 10 seconds

## Fixes Applied

### 1. Tool Definition Consistency
- Fixed `accountId` vs `accountNumber` mismatch
- Updated agentcore_balance.json to use `accountNumber`
- Updated agentcore_transactions.json to use `accountNumber`

### 2. Local Tools Configuration
- Added field transformation: `accountNumber` → `accountId` for AgentCore
- Added detailed logging for debugging
- Fixed tool directory mounting in docker-compose

### 3. Docker Compose Updates
- Mounted backend/tools instead of local-tools/src/tools
- Added AgentCore credentials to local-tools service
- Added AWS_REGION environment variable

### 4. Intent Parser
- Already supports partial credential extraction
- Handles various input formats
- Extracts account and sort code separately

## Next Steps

1. Run `./test-a2a-chat.sh` to verify all services are working
2. Open browser to http://localhost:3000
3. Test the complete flow with valid credentials
4. Test error handling with invalid credentials
5. Monitor logs for any issues

## Support

If you encounter issues:
1. Check the logs using commands above
2. Verify all services are running: `docker-compose -f docker-compose-a2a.yml ps`
3. Test tools directly using curl commands
4. Check Redis state for session data
