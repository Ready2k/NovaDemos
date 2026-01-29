# Local Tools Service Integration with AgentCore

## Solution

The **local-tools service** now calls **AWS Bedrock AgentCore Gateway** to execute banking tools, with fallback to local implementations if AgentCore is unavailable.

## Architecture

```
Nova Sonic → Tool Call → Agent → Local Tools Service → AgentCore Gateway → AWS → Result → Agent → Nova Sonic
                                                     ↓ (if unavailable)
                                                  Fallback Implementation
```

### Flow:
1. Nova Sonic calls `perform_idv_check` with parameters
2. Agent intercepts the tool call
3. Agent forwards request to local-tools service: `POST http://localhost:9000/tools/execute`
4. **Local-tools calls AgentCore Gateway** with signed AWS request
5. AgentCore executes the tool in AWS and returns real result
6. Local-tools returns result to agent
7. Agent sends result back to Nova Sonic via `sendToolResult()`
8. Nova Sonic continues conversation with the result

**Fallback:** If AgentCore is unavailable or credentials are missing, local-tools uses test data implementations.

## Changes Made

### 1. Updated Local Tools Service
**File: `local-tools/src/server.ts`**

Now calls AgentCore Gateway:
```typescript
async function callAgentCoreGateway(toolName: string, input: any, gatewayTarget?: string) {
    // Sign request with AWS credentials
    const signedRequest = aws4.sign(request, {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    });
    
    // Call AgentCore Gateway
    const response = await fetch(AGENTCORE_GATEWAY_URL, {
        method: 'POST',
        headers: signedRequest.headers,
        body: JSON.stringify(payload)
    });
    
    return response.data;
}
```

Fallback implementations are only used if AgentCore fails.

### 2. Environment Variables
**Required for AgentCore:**
- `AWS_ACCESS_KEY_ID` or `NOVA_AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY` or `NOVA_AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (defaults to us-east-1)

**Optional:**
- `AGENTCORE_GATEWAY_URL` (defaults to AWS endpoint)

### 3. Updated Restart Script
**File: `restart-local-services.sh`**

Passes AWS credentials to local-tools:
```bash
cd local-tools
PORT=9000 \
TOOLS_DIR=../backend/tools \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
AWS_REGION=${AWS_REGION:-us-east-1} \
node dist/server.js > ../logs/local-tools.log 2>&1 &
```

## Real Data from AgentCore

When AgentCore is available, you get **real banking data**:
- Real account verification
- Real account balances
- Real transaction history

**Test Accounts (from AgentCore):**
- Account: 12345678, Sort Code: 112233
- Account: 87654321, Sort Code: 112233

## Fallback Test Data

Only used if AgentCore is unavailable:
- Account: 12345678, Sort Code: 112233 → VERIFIED (Sarah Johnson), Balance: £1,234.56
- Account: 87654321, Sort Code: 112233 → VERIFIED (John Smith), Balance: £5,432.10

## Services Running

After `./restart-local-services.sh`:

1. **Local Tools** - http://localhost:9000 (calls AgentCore)
2. **Gateway** - http://localhost:8080
3. **Triage Agent** - http://localhost:8081
4. **IDV Agent** - http://localhost:8082
5. **Banking Agent** - http://localhost:8083
6. **Frontend** - http://localhost:3000

## Testing

### Check AgentCore Connection:
```bash
tail -f logs/local-tools.log | grep -E "AgentCore|FALLBACK"
```

You should see:
- `[LocalTools] AgentCore credentials available - will use AgentCore Gateway`
- `[LocalTools] Calling AgentCore Gateway for perform_idv_check...`
- `[LocalTools] AgentCore response status: 200`

If you see `[LocalTools] Using FALLBACK implementation`, AgentCore is unavailable.

### Test IDV Flow:
```
1. Open http://localhost:3000
2. Say: "I want to check my balance"
3. Triage routes to IDV
4. IDV asks for account details
5. Say: "12345678 and 112233"
6. IDV calls perform_idv_check → Local Tools → AgentCore → Real verification
7. IDV says: "Great, [Name]. You've been verified..."
8. IDV transfers to Banking agent
```

## Advantages

1. ✅ **Real Data** - Uses actual AgentCore banking services
2. ✅ **Proper Architecture** - Tools call AWS services correctly
3. ✅ **Fallback Support** - Works even if AgentCore is down
4. ✅ **Reusable** - Any agent can call the local-tools service
5. ✅ **Production-Ready** - Same architecture as production
6. ✅ **Testable** - Can test with real or fallback data

## Production vs Development

**Development (Current):**
- Agent intercepts tool calls
- Calls local-tools service
- Local-tools calls AgentCore Gateway
- Results sent back to Nova Sonic

**Production (Future):**
- Remove agent interception
- Nova Sonic calls tools via `agentCoreRuntimeArn` directly
- AgentCore returns results automatically
- No local-tools service needed

The architecture is designed to work in both modes.
