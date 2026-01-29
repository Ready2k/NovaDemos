# Local vs Docker - Important Distinction

## Two Different Setups

### Local Development (What You're Using) ✅

**Script**: `./start-all-services.sh` or `./restart-local-services.sh`

**How it works**:
- Runs services directly on your Mac (not in containers)
- Uses code from `agents/dist/` and `gateway/dist/`
- Logs to `logs/` directory
- Faster iteration (just rebuild and restart)

**Ports**:
- Gateway: http://localhost:8080
- Agent: http://localhost:8081
- Frontend: http://localhost:3000

**Advantages**:
- ✅ Latest code immediately available
- ✅ Easy to debug with logs
- ✅ Fast rebuild (just `npm run build`)
- ✅ No Docker overhead

**When to use**: Development and testing

### Docker Compose (Not Currently Used) ❌

**Script**: `./restart-multi-agent.sh` or `docker-compose -f docker-compose-a2a.yml up`

**How it works**:
- Runs services in Docker containers
- Uses code baked into Docker images
- Logs via `docker logs`
- Need to rebuild images for code changes

**Ports**: Same (8080, 8081, 3000)

**Advantages**:
- ✅ Isolated environment
- ✅ Production-like setup
- ✅ Easy to deploy
- ✅ Multiple agents running simultaneously

**Disadvantages**:
- ❌ Slower to rebuild images
- ❌ Code changes require image rebuild
- ❌ More complex debugging

**When to use**: Production deployment or testing multi-agent setup

## Current Status

You are using **LOCAL DEVELOPMENT** setup:
- Services run directly on your Mac
- Code is in `agents/dist/` and `gateway/dist/`
- Latest handoff code is already built
- Just need to restart services

## How to Restart Local Services

### Option 1: New Script (Recommended)
```bash
./restart-local-services.sh
```

This will:
1. Stop existing processes
2. Rebuild agent and gateway
3. Start all services
4. Verify health
5. Check for handoff tools

### Option 2: Manual Restart

```bash
# Stop existing processes
pkill -f "node dist/server.js"
pkill -f "node dist/agent-runtime-s2s.js"
pkill -f "next-server"

# Rebuild
cd agents && npm run build && cd ..
cd gateway && npm run build && cd ..

# Start (or use start-all-services.sh)
./start-all-services.sh
```

## Verify Handoff Tools Are Loaded

After starting services, check the agent log:

```bash
# Wait for a session to start, then check
tail -f logs/agent.log | grep -E "(Generated.*handoff|HANDOFF)"
```

You should see:
```
[Agent:triage] Generated 5 handoff tools
[Agent:triage] Handoff tools configured: transfer_to_banking, transfer_to_idv, ...
```

## Test Handoff

1. Open http://localhost:3000
2. Select "Triage Agent"
3. Click Connect
4. Say: "I need to check my balance"
5. Listen for voice change: matthew → joanna

## Check Logs

```bash
# All logs in one view
tail -f logs/*.log

# Just agent
tail -f logs/agent.log

# Just gateway
tail -f logs/gateway.log

# Search for handoff events
tail -f logs/agent.log | grep HANDOFF
```

## When to Use Docker

Use Docker when you want to:
- Test multiple agents simultaneously (triage, banking, idv, etc.)
- Simulate production environment
- Deploy to a server
- Test agent-to-agent handoffs with different voices

But for now, **stick with local development** - it's faster and easier to iterate.

## Summary

✅ **Use**: `./restart-local-services.sh` (local development)  
❌ **Don't use**: `./restart-multi-agent.sh` (Docker - has old code)

The handoff code is already built and ready to test locally!
