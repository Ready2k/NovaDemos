# Agent Crash Fixed - Summary

## Problem

When you ran the Docker containers, the triage agent crashed immediately with:
```
[Agent:triage] ERROR: AWS credentials not configured!
[Agent:triage] Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
```

## Root Cause

The `docker-compose-a2a.yml` file didn't include AWS credentials in the environment variables for the agent services. The agents need these credentials to connect to AWS Bedrock (Nova Sonic).

## Solution

### 1. Updated All Agent Services in docker-compose-a2a.yml

Added required environment variables to ALL agents (triage, banking, mortgage, idv, disputes):
- `AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}`
- `AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}`
- `AWS_REGION=${AWS_REGION:-us-east-1}`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASEURL`

Added volume mounts for personas and prompts:
```yaml
volumes:
  - ./backend/personas:/app/backend/personas:ro
  - ./backend/prompts:/app/backend/prompts:ro
```

### 2. Added Investigation Agent Service

Created new agent service in docker-compose-a2a.yml:
- Service name: `agent-investigation`
- Port: 8086
- Voice: stephen
- Workflow: workflow_investigation.json

### 3. Created Missing Workflow Files

- `backend/workflows/workflow_idv.json` - Identity Verification workflow
- `backend/workflows/workflow_investigation.json` - Fraud Investigation workflow

## How to Restart

### Quick Start (Recommended)

```bash
./restart-multi-agent.sh
```

This script will:
1. Stop existing containers
2. Rebuild agent images
3. Start all services
4. Verify health
5. Show registered agents

### Manual Start

```bash
# Stop existing containers
docker-compose -f docker-compose-a2a.yml down

# Rebuild and start
docker-compose -f docker-compose-a2a.yml up --build -d

# Check logs
docker-compose -f docker-compose-a2a.yml logs -f
```

## Verify It's Working

### 1. Check Container Status
```bash
docker ps
```
All agent containers should show "Up" status (not "Exited").

### 2. Check Agent Health
```bash
curl http://localhost:8081/health
```
Should return: `{"status":"healthy","agent":"triage",...}`

### 3. Check Registered Agents
```bash
curl http://localhost:8080/api/agents | jq
```
Should show all 6 agents registered with their voice IDs.

### 4. Check Handoff Tools Loaded
```bash
docker logs voice_s2s-agent-triage-1 2>&1 | grep "handoff tools"
```
Should show: `Generated 5 handoff tools`

## Test Handoffs

1. Open http://localhost:3000
2. Select "Triage Agent" from dropdown
3. Click Connect
4. Say: **"I need to check my balance"**
5. Listen for voice change: **matthew → joanna**

### More Test Scenarios

| Say This | Expected Agent | Voice |
|----------|---------------|-------|
| "I need to check my balance" | Banking | joanna |
| "I need identity verification" | IDV | stephen |
| "I want mortgage information" | Mortgage | ruth |
| "I want to dispute a charge" | Disputes | danielle |
| "I see an unrecognized transaction" | Investigation | stephen |

## What to Look For in Logs

### Successful Startup
```
[Agent:triage] Loaded workflow from /app/workflow.json
[Agent:triage] ✅ Persona loaded: Triage Agent
[Agent:triage]    Voice: matthew
[Agent:triage] Generated 5 handoff tools
[Agent:triage] HTTP server listening on port 8081
[Agent:triage] Registered with gateway
```

### Successful Handoff
```
[Agent:triage] Tool called: transfer_to_banking
[Agent:triage] 🔄 HANDOFF TRIGGERED: triage → banking (persona-SimpleBanking)
[Agent:triage] Handoff request sent to gateway
[Gateway] Handoff request received: triage → persona-SimpleBanking
[Gateway] Routing to agent: banking
```

## Files Modified

1. **docker-compose-a2a.yml** - Added AWS credentials to all agents
2. **backend/workflows/workflow_idv.json** - Created (new)
3. **backend/workflows/workflow_investigation.json** - Created (new)
4. **restart-multi-agent.sh** - Created (new helper script)
5. **DOCKER_HANDOFF_FIXED.md** - Created (detailed documentation)

## Architecture

```
┌─────────────┐
│  Frontend   │ :3000
│  (Next.js)  │
└──────┬──────┘
       │ WebSocket
       ↓
┌─────────────┐
│   Gateway   │ :8080
│  (Router)   │
└──────┬──────┘
       │
       ├─→ Triage Agent      :8081 (matthew)
       ├─→ Banking Agent     :8082 (joanna)
       ├─→ Mortgage Agent    :8083 (ruth)
       ├─→ IDV Agent         :8084 (stephen)
       ├─→ Disputes Agent    :8085 (danielle)
       └─→ Investigation     :8086 (stephen)
```

## Handoff Flow

```
1. User connects to Triage Agent (matthew voice)
2. User says: "I need to check my balance"
3. Triage Agent calls: transfer_to_banking tool
4. Agent runtime intercepts tool call
5. Sends handoff_request to Gateway
6. Gateway routes to Banking Agent
7. Banking Agent connects (joanna voice)
8. User hears voice change
```

## Next Steps

1. **Run the restart script**: `./restart-multi-agent.sh`
2. **Verify all agents are healthy**: Check the script output
3. **Test a handoff**: Follow the test scenarios above
4. **Monitor logs**: `docker-compose -f docker-compose-a2a.yml logs -f`

## Troubleshooting

If agents still crash:
1. Check .env file exists: `cat .env`
2. Verify AWS credentials are set: `echo $AWS_ACCESS_KEY_ID`
3. Check agent logs: `docker logs voice_s2s-agent-triage-1`
4. Rebuild from scratch: `docker-compose -f docker-compose-a2a.yml build --no-cache`

## Documentation

- **DOCKER_HANDOFF_FIXED.md** - Detailed troubleshooting guide
- **MULTI_AGENT_HANDOFF_IMPLEMENTED.md** - Implementation details
- **TEST_MULTI_AGENT_HANDOFFS.md** - Testing guide
