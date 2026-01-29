# Multi-Agent Handoff System - Status

## Current Status: READY TO TEST ✅

The agent crash has been fixed. All components are ready for testing.

## What Was Fixed

### Issue
Docker containers were crashing with:
```
[Agent:triage] ERROR: AWS credentials not configured!
```

### Solution
1. Added AWS credentials to all agent services in `docker-compose-a2a.yml`
2. Added volume mounts for personas and prompts directories
3. Created missing workflow files (IDV, Investigation)
4. Added Investigation agent service to docker-compose

## System Architecture

### Agents (6 Total)

| Agent | Port | Voice | Persona ID | Purpose |
|-------|------|-------|------------|---------|
| Triage | 8081 | matthew | triage | Initial routing |
| Banking | 8082 | joanna | persona-SimpleBanking | Account services |
| Mortgage | 8083 | ruth | persona-mortgage | Mortgage info |
| IDV | 8084 | stephen | idv | Identity verification |
| Disputes | 8085 | danielle | persona-BankingDisputes | Transaction disputes |
| Investigation | 8086 | stephen | investigation | Fraud investigation |

### Handoff Tools (5 Total)

Each agent has access to these tools:
1. `transfer_to_banking` - Routes to Banking Agent
2. `transfer_to_idv` - Routes to IDV Agent
3. `transfer_to_mortgage` - Routes to Mortgage Agent
4. `transfer_to_disputes` - Routes to Disputes Agent
5. `transfer_to_investigation` - Routes to Investigation Agent

## How to Start

### Quick Start
```bash
./restart-multi-agent.sh
```

### Manual Start
```bash
docker-compose -f docker-compose-a2a.yml up --build -d
```

## How to Test

### Basic Test
1. Open http://localhost:3000
2. Select "Triage Agent" from dropdown
3. Click Connect
4. Say: "I need to check my balance"
5. Listen for voice change: matthew → joanna

### Full Test Matrix

| User Input | Expected Agent | Voice Change | Tool Called |
|------------|---------------|--------------|-------------|
| "I need to check my balance" | Banking | matthew → joanna | transfer_to_banking |
| "I need identity verification" | IDV | matthew → stephen | transfer_to_idv |
| "I want mortgage information" | Mortgage | matthew → ruth | transfer_to_mortgage |
| "I want to dispute a charge" | Disputes | matthew → danielle | transfer_to_disputes |
| "I see an unrecognized transaction" | Investigation | matthew → stephen | transfer_to_investigation |

## Verification Checklist

- [ ] All containers running: `docker ps`
- [ ] Gateway healthy: `curl http://localhost:8080/health`
- [ ] Triage agent healthy: `curl http://localhost:8081/health`
- [ ] All agents registered: `curl http://localhost:8080/api/agents | jq`
- [ ] Handoff tools loaded: `docker logs voice_s2s-agent-triage-1 | grep "handoff tools"`
- [ ] Frontend accessible: http://localhost:3000
- [ ] Voice handoff works: Test with "I need to check my balance"

## Expected Log Output

### Successful Startup
```
[Agent:triage] Loaded workflow from /app/workflow.json
[Agent:triage] Loading persona: triage
[Agent:triage] ✅ Persona loaded: Triage Agent
[Agent:triage]    Voice: matthew
[Agent:triage]    Allowed tools: X
[Agent:triage]    Prompt length: XXX chars
[Agent:triage] Graph executor initialized
[Agent:triage] HTTP server listening on port 8081
[Agent:triage] S2S Mode: ENABLED (Nova Sonic)
[Agent:triage] AWS Region: us-east-1
```

### Session Initialization
```
[Agent:triage] Initializing session: xxx-xxx-xxx
[Agent:triage] Combined persona prompt (XXX chars) + handoff (XXX chars) + workflow (XXX chars)
[Agent:triage] Generated 5 handoff tools
[Agent:triage] Voice configured: matthew
[Agent:triage] Handoff tools configured: transfer_to_banking, transfer_to_idv, transfer_to_mortgage, transfer_to_disputes, transfer_to_investigation
[Agent:triage] Sending 'connected' message to gateway
[Agent:triage] Nova Sonic S2S session started
```

### Successful Handoff
```
[Agent:triage] Tool called: transfer_to_banking
[Agent:triage] 🔄 HANDOFF TRIGGERED: triage → banking (persona-SimpleBanking)
[Agent:triage] Handoff reason: User needs balance check
[Agent:triage] Handoff request sent to gateway

[Gateway] Handoff request received from triage
[Gateway] Target agent: persona-SimpleBanking
[Gateway] Routing to agent: banking
[Gateway] Handoff complete
```

## Implementation Details

### Handoff Flow
```
1. User speaks to Triage Agent (matthew voice)
2. Triage Agent identifies need (e.g., "check balance")
3. Triage Agent calls transfer_to_banking tool
4. Agent runtime intercepts tool call (toolUse event)
5. Runtime sends handoff_request to Gateway
6. Gateway disconnects from Triage Agent
7. Gateway connects to Banking Agent
8. Banking Agent starts session (joanna voice)
9. User hears voice change
10. Conversation continues with Banking Agent
```

### Key Files

**Handoff Implementation:**
- `agents/src/handoff-tools.ts` - Tool definitions
- `agents/src/agent-runtime-s2s.ts` - Tool interception (line 460-490)
- `gateway/src/server.ts` - Handoff routing

**Configuration:**
- `docker-compose-a2a.yml` - Service definitions
- `backend/personas/*.json` - Persona configs
- `backend/prompts/*.txt` - Persona prompts
- `backend/workflows/*.json` - Workflow definitions

**Scripts:**
- `restart-multi-agent.sh` - Quick restart script
- `start-all-services.sh` - Local development script

## Troubleshooting

### Container Crashes
```bash
# Check logs for errors
docker logs voice_s2s-agent-triage-1 2>&1 | grep ERROR

# Common issue: AWS credentials
# Solution: Ensure .env file has AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
```

### Handoff Not Working
```bash
# Check if tools are loaded
docker logs voice_s2s-agent-triage-1 2>&1 | grep "Generated.*handoff"

# Check if tool is called
docker logs voice_s2s-agent-triage-1 2>&1 | grep "Tool called"

# Check if handoff is triggered
docker logs voice_s2s-agent-triage-1 2>&1 | grep "HANDOFF TRIGGERED"

# Check gateway routing
docker logs voice_s2s-gateway-1 2>&1 | grep "handoff_request"
```

### Agent Not Registering
```bash
# Check agent registration
docker logs voice_s2s-agent-triage-1 2>&1 | grep "Registered with gateway"

# Check gateway received registration
docker logs voice_s2s-gateway-1 2>&1 | grep "Agent registered"

# List registered agents
curl http://localhost:8080/api/agents | jq
```

## Documentation

- **CRASH_FIXED_SUMMARY.md** - Detailed fix explanation
- **DOCKER_HANDOFF_FIXED.md** - Docker-specific troubleshooting
- **MULTI_AGENT_HANDOFF_IMPLEMENTED.md** - Implementation details
- **TEST_MULTI_AGENT_HANDOFFS.md** - Testing guide
- **QUICK_FIX_REFERENCE.md** - Quick reference card

## Next Steps

1. **Start the system**: `./restart-multi-agent.sh`
2. **Verify health**: Check all services are running
3. **Test basic handoff**: "I need to check my balance"
4. **Test all handoffs**: Use the test matrix above
5. **Monitor logs**: Watch for any errors or issues

## Success Criteria

✅ All 6 agents start successfully  
✅ All agents register with gateway  
✅ Handoff tools load correctly  
✅ Voice changes on handoff  
✅ Conversation continues with new agent  
✅ No crashes or errors in logs  

## Known Limitations

- Handoff context is basic (just reason + last message)
- No conversation history transfer yet
- Voice change is immediate (no transition phrase)
- All agents share same tool set (could be persona-specific)

## Future Enhancements

- Transfer conversation history on handoff
- Add transition phrases ("Let me connect you to...")
- Persona-specific tool filtering
- Handoff analytics and tracking
- Multi-hop handoffs (agent → agent → agent)
