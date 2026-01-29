# Quick Fix Reference - Agent Crash

## The Problem
```
[Agent:triage] ERROR: AWS credentials not configured!
```

## The Fix
Added AWS credentials to docker-compose-a2a.yml for all agents.

## Restart Now

```bash
./restart-multi-agent.sh
```

## Verify

```bash
# All containers running?
docker ps

# Agents healthy?
curl http://localhost:8081/health

# Agents registered?
curl http://localhost:8080/api/agents | jq

# Handoff tools loaded?
docker logs voice_s2s-agent-triage-1 2>&1 | grep "Generated.*handoff"
```

## Test Handoff

1. Open: http://localhost:3000
2. Select: "Triage Agent"
3. Say: "I need to check my balance"
4. Listen: Voice changes from matthew → joanna

## View Logs

```bash
# All services
docker-compose -f docker-compose-a2a.yml logs -f

# Just triage agent
docker logs voice_s2s-agent-triage-1 -f

# Just gateway
docker logs voice_s2s-gateway-1 -f
```

## Expected Output

### Startup
```
[Agent:triage] ✅ Persona loaded: Triage Agent
[Agent:triage] Generated 5 handoff tools
[Agent:triage] Registered with gateway
```

### Handoff
```
[Agent:triage] Tool called: transfer_to_banking
[Agent:triage] 🔄 HANDOFF TRIGGERED: triage → banking
[Gateway] Handoff request received
```

## Files Changed

- docker-compose-a2a.yml (AWS credentials added)
- backend/workflows/workflow_idv.json (created)
- backend/workflows/workflow_investigation.json (created)

## Full Documentation

See: CRASH_FIXED_SUMMARY.md
