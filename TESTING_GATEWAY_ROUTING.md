# Testing Gateway Routing

## Quick Start

Gateway Routing is now active! Here's how to test it:

## Method 1: Use the Web Interface (Easiest)

1. **Open the application**
   ```
   http://localhost:3000
   ```

2. **Select the Triage workflow**
   - Click on "Workflow" dropdown
   - Select "Triage"

3. **Start a conversation**
   
   The Triage agent will automatically route you to specialist agents based on your intent:

   **Banking Queries:**
   - "I want to check my balance"
   - "Show me my recent transactions"
   - "What's my account balance?"
   
   → Routes to Banking Agent

   **Dispute Queries:**
   - "I need to dispute a transaction"
   - "I don't recognize a charge"
   - "Report a fraudulent transaction"
   
   → Routes to Disputes Agent

   **Mortgage Queries:**
   - "Tell me about mortgages"
   - "I want to apply for a loan"
   - "What are your mortgage rates?"
   
   → Routes to Mortgage Agent

4. **Watch the routing happen**
   - You'll see a "handoff_event" message in the UI
   - The agent will seamlessly transfer you
   - All your context (identity, intent, conversation) is preserved

## Method 2: Monitor the Logs

Open multiple terminal windows to watch the routing in action:

**Terminal 1 - Gateway logs:**
```bash
docker logs -f voice_s2s-gateway-1
```

**Terminal 2 - Triage agent logs:**
```bash
docker logs -f voice_s2s-agent-triage-1
```

**Terminal 3 - Banking agent logs:**
```bash
docker logs -f voice_s2s-agent-banking-1
```

When you say "I want to check my balance", you'll see:
1. Triage agent detects the intent
2. Gateway intercepts the handoff tool call
3. Gateway updates session memory
4. Gateway routes to Banking agent
5. Banking agent receives the context

## Method 3: Test with IDV Flow

This tests the full multi-agent flow with identity verification:

1. **Start with Triage**
   - Say: "I want to check my balance"
   - Triage routes you to IDV for verification

2. **Provide credentials to IDV**
   - Account: `12345678`
   - Sort Code: `12-34-56`
   - IDV verifies your identity

3. **Automatic routing to Banking**
   - Gateway detects successful verification
   - Automatically routes you to Banking agent
   - Banking agent receives your verified credentials
   - Banking agent can now check your balance

## What to Look For

### In the UI:
- **Handoff events** showing agent transfers
- **Tool calls** for `transfer_to_banking`, `transfer_to_idv`, etc.
- **Seamless conversation** across agents
- **Context preservation** (agent knows your name, intent, etc.)

### In the Logs:
- `[Gateway] 🔄 INTERCEPTED HANDOFF: transfer_to_banking`
- `[Gateway] Memory update request from agent triage`
- `[Gateway] Routing session xxx to agent: banking`
- `[AgentCore:banking] Restored verified user: John Smith`
- `[AgentCore:banking] Account details from memory: 12345678, 12-34-56`

## Verify Gateway Routing is Working

Check that the new endpoints are active:

```bash
# From inside the Docker network
docker exec voice_s2s-gateway-1 node -e "
const http = require('http');
http.get('http://localhost:8080/health', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
"
```

Or check the gateway logs for the new endpoint registrations:
```bash
docker logs voice_s2s-gateway-1 | grep "api/sessions"
```

## Expected Behavior

### Successful Routing:
1. User expresses intent to Triage
2. Triage calls `transfer_to_banking` tool
3. Gateway intercepts the tool call
4. Gateway updates session memory with context
5. Gateway routes session to Banking agent
6. Banking agent receives full context
7. Banking agent continues conversation seamlessly

### Context Preservation:
- User identity (if verified)
- User intent ("check balance")
- Conversation history
- Graph state (workflow position)
- Custom context (account details, etc.)

## Troubleshooting

### Gateway not routing?
```bash
# Check gateway is running
docker ps | grep gateway

# Check gateway logs
docker logs voice_s2s-gateway-1 --tail 50

# Restart gateway
docker restart voice_s2s-gateway-1
```

### Agent not receiving context?
```bash
# Check Redis is running
docker ps | grep redis

# Check session memory
docker exec voice_s2s-redis-1 redis-cli KEYS "session:*"
docker exec voice_s2s-redis-1 redis-cli GET "session:your-session-id"
```

### Agents not registered?
```bash
# Check agent registration
docker logs voice_s2s-gateway-1 | grep "Registered agent"

# Should see:
# [AgentRegistry] Registered agent: triage at ws://agent-triage:8081
# [AgentRegistry] Registered agent: banking at ws://agent-banking:8082
# [AgentRegistry] Registered agent: idv at ws://agent-idv:8084
# etc.
```

## Advanced Testing

### Test Direct API Calls

You can test the gateway routing endpoints directly from inside the Docker network:

```bash
# Create a test session
docker exec voice_s2s-gateway-1 node -e "
const http = require('http');
const data = JSON.stringify({
  memory: {
    verified: true,
    userName: 'Test User',
    account: '12345678',
    sortCode: '12-34-56',
    userIntent: 'check balance'
  }
});

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/sessions/test-123/memory',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Agent-Id': 'test-agent',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Response:', body));
});

req.write(data);
req.end();
"
```

## Success Indicators

✅ Gateway is running and healthy
✅ All agents are registered with gateway
✅ Triage agent can route to specialist agents
✅ Context is preserved across agent transfers
✅ IDV → Banking flow works automatically
✅ No duplicate messages or lost context

## Next Steps

Once you've verified gateway routing works:

1. **Customize routing logic** in agent workflows
2. **Add new agents** and register them with gateway
3. **Enhance context** passed between agents
4. **Monitor routing patterns** in Langfuse
5. **Optimize routing performance** based on metrics

Enjoy seamless multi-agent conversations! 🎉
