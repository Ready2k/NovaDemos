# Docker Multi-Agent Handoff - Fixed

## Issue Identified

The agent containers were crashing because AWS credentials weren't being passed to the Docker containers. The error was:

```
[Agent:triage] ERROR: AWS credentials not configured!
[Agent:triage] Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
```

## Fixes Applied

### 1. Updated docker-compose-a2a.yml

Added AWS credentials and required environment variables to ALL agent services:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASEURL`

Also added volume mounts for personas and prompts directories:
```yaml
volumes:
  - ./backend/workflows/workflow_xxx.json:/app/workflow.json:ro
  - ./backend/personas:/app/backend/personas:ro
  - ./backend/prompts:/app/backend/prompts:ro
```

### 2. Added Investigation Agent Service

Created new agent service in docker-compose-a2a.yml:
- Port: 8086
- Workflow: workflow_investigation.json
- Voice: stephen

### 3. Created Missing Workflow Files

Created workflow definitions for new agents:
- `backend/workflows/workflow_idv.json` - Identity Verification workflow
- `backend/workflows/workflow_investigation.json` - Fraud Investigation workflow

## How to Start Services

### Option 1: Docker Compose (Recommended for Multi-Agent)

```bash
# Make sure .env file exists with AWS credentials
cat .env

# Start all services with docker-compose
docker-compose -f docker-compose-a2a.yml up --build

# Or run in background
docker-compose -f docker-compose-a2a.yml up -d --build
```

### Option 2: Local Development (start-all-services.sh)

```bash
# This script runs services locally (not in Docker)
./start-all-services.sh
```

## Verify Services Are Running

```bash
# Check all containers
docker ps

# Check Gateway health
curl http://localhost:8080/health

# Check registered agents
curl http://localhost:8080/api/agents | jq

# Check specific agent health
curl http://localhost:8081/health  # Triage
curl http://localhost:8082/health  # Banking
curl http://localhost:8083/health  # Mortgage
curl http://localhost:8084/health  # IDV
curl http://localhost:8085/health  # Disputes
curl http://localhost:8086/health  # Investigation
```

## Check Logs

```bash
# View all logs
docker-compose -f docker-compose-a2a.yml logs -f

# View specific agent logs
docker logs voice_s2s-agent-triage-1 -f
docker logs voice_s2s-agent-banking-1 -f
docker logs voice_s2s-agent-idv-1 -f
docker logs voice_s2s-agent-investigation-1 -f

# Check for handoff tools loading
docker logs voice_s2s-agent-triage-1 2>&1 | grep "handoff tools"
```

## Expected Log Output

When triage agent starts successfully, you should see:

```
[Agent:triage] Loaded workflow from /app/workflow.json
[Agent:triage] Loading persona: triage
[Agent:triage] ✅ Persona loaded: Triage Agent
[Agent:triage]    Voice: matthew
[Agent:triage]    Allowed tools: X
[Agent:triage]    Prompt length: XXX chars
[Agent:triage] Graph executor initialized
[Agent:triage] HTTP server listening on port 8081
[Agent:triage] WebSocket endpoint: ws://localhost:8081/session
[Agent:triage] S2S Mode: ENABLED (Nova Sonic)
[Agent:triage] AWS Region: us-east-1
[Agent:triage] Registered with gateway
```

When a session starts, you should see:

```
[Agent:triage] Initializing session: xxx-xxx-xxx
[Agent:triage] Combined persona prompt (XXX chars) + handoff (XXX chars) + workflow (XXX chars)
[Agent:triage] Generated 5 handoff tools
[Agent:triage] Voice configured: matthew
[Agent:triage] Handoff tools configured: transfer_to_banking, transfer_to_idv, transfer_to_mortgage, transfer_to_disputes, transfer_to_investigation
```

## Testing Handoffs

1. Open http://localhost:3000
2. Select "Triage Agent" from dropdown
3. Click Connect
4. Say: "I need to check my balance"
5. Listen for voice change: matthew (triage) → joanna (banking)

### Test Scenarios

| User Says | Expected Handoff | Voice Change |
|-----------|------------------|--------------|
| "I need to check my balance" | Banking | matthew → joanna |
| "I need identity verification" | IDV | matthew → stephen |
| "I want mortgage information" | Mortgage | matthew → ruth |
| "I want to dispute a charge" | Disputes | matthew → danielle |
| "I see an unrecognized transaction" | Investigation | matthew → stephen |

## Troubleshooting

### Container Exits Immediately

Check logs for AWS credential errors:
```bash
docker logs voice_s2s-agent-triage-1 2>&1 | grep ERROR
```

If you see "AWS credentials not configured", ensure .env file has:
```
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
```

### Handoff Not Working

1. Check if handoff tools are loaded:
```bash
docker logs voice_s2s-agent-triage-1 2>&1 | grep "Generated.*handoff tools"
```

2. Check if tool is being called:
```bash
docker logs voice_s2s-agent-triage-1 2>&1 | grep "Tool called"
```

3. Check if handoff request is sent:
```bash
docker logs voice_s2s-agent-triage-1 2>&1 | grep "HANDOFF TRIGGERED"
docker logs voice_s2s-gateway-1 2>&1 | grep "handoff_request"
```

### Agent Not Registering with Gateway

Check gateway logs:
```bash
docker logs voice_s2s-gateway-1 2>&1 | grep "Agent registered"
```

Check agent registration attempt:
```bash
docker logs voice_s2s-agent-triage-1 2>&1 | grep "Registered with gateway"
```

## Architecture

```
User → Frontend (3000)
       ↓
Gateway (8080) ← WebSocket
       ↓
Agent Network:
  - Triage (8081) - matthew voice
  - Banking (8082) - joanna voice
  - Mortgage (8083) - ruth voice
  - IDV (8084) - stephen voice
  - Disputes (8085) - danielle voice
  - Investigation (8086) - stephen voice
```

## Files Modified

1. `docker-compose-a2a.yml` - Added AWS credentials and volumes to all agents
2. `backend/workflows/workflow_idv.json` - Created IDV workflow
3. `backend/workflows/workflow_investigation.json` - Created Investigation workflow
4. `agents/src/handoff-tools.ts` - Handoff tool definitions (already created)
5. `agents/src/agent-runtime-s2s.ts` - Handoff tool integration (already created)

## Next Steps

1. Start services: `docker-compose -f docker-compose-a2a.yml up --build`
2. Verify all agents register: `curl http://localhost:8080/api/agents | jq`
3. Test handoffs using the scenarios above
4. Monitor logs for any errors
