# Rollback Recommendation - Use Simple Architecture

## Current Situation

The unified multi-agent architecture (`docker-compose-unified.yml`) has multiple issues:
1. ❌ JSON parsing errors causing session disconnects
2. ❌ Audio not playing despite transcripts showing
3. ❌ System hanging after user input
4. ❌ Complex handoff logic between agents not working reliably

## Root Cause

The unified architecture is **too complex** for the current state:
- Multiple agent services (triage, banking, IDV, etc.)
- Gateway routing between agents
- Handoff protocol between agents
- Hybrid mode with voice/text adapters
- Multiple points of failure

## Recommendation: Use Simple Architecture

Switch to `docker-compose.yml` which uses the **original monolithic backend** that was working:

### Simple Architecture Benefits
- ✅ Single backend service (no gateway, no agent routing)
- ✅ Direct WebSocket connection (no handoffs)
- ✅ Proven to work (was working before)
- ✅ Easier to debug
- ✅ Fewer moving parts

### Architecture Comparison

**Unified (Current - Broken)**:
```
Browser → Gateway → Agent-Triage → Agent-Banking → Local-Tools → AgentCore
```

**Simple (Recommended - Working)**:
```
Browser → Backend → AWS Bedrock (Nova Sonic)
                 ↓
           Tool Execution
```

## How to Rollback

### Step 1: Stop Unified Architecture
```bash
docker-compose -f docker-compose-unified.yml down
```

### Step 2: Start Simple Architecture
```bash
# Use the simple docker-compose.yml
docker-compose up --build -d
```

### Step 3: Verify
```bash
# Check services are running
docker-compose ps

# Check logs
docker-compose logs -f backend

# Open frontend
open http://localhost:3000
```

## What You'll Lose

The unified architecture features that won't work in simple mode:
- ❌ Multi-agent handoffs (triage → banking → IDV)
- ❌ Separate agent services
- ❌ Agent-to-agent communication

## What You'll Keep

Everything else still works:
- ✅ Voice interaction with Nova Sonic
- ✅ Tool execution (balance, transactions, IDV)
- ✅ Knowledge base RAG
- ✅ Workflows
- ✅ Personas
- ✅ Frontend UI
- ✅ Session history
- ✅ Langfuse observability

## Alternative: Fix Unified Architecture

If you want to keep the unified architecture, we need to:

1. **Debug the JSON parsing error**
   - Add more logging to see what data is being sent
   - Check if frontend is sending correct format
   - Verify WebSocket message format

2. **Fix audio playback**
   - Check if audio chunks are being generated
   - Verify SonicClient is working
   - Check if audio is being sent to frontend

3. **Fix handoff logic**
   - Verify gateway routing
   - Check agent registration
   - Test handoff protocol

This will take significant time and debugging.

## My Recommendation

**Use the simple architecture** (`docker-compose.yml`) to get back to a working state, then:

1. Test that everything works
2. Identify what features you actually need
3. If you need multi-agent handoffs, we can debug the unified architecture properly
4. If you don't need handoffs, stick with the simple architecture

## Quick Command

To rollback right now:

```bash
# Stop everything
docker-compose -f docker-compose-unified.yml down

# Start simple architecture
docker-compose up --build -d

# Watch logs
docker-compose logs -f backend
```

Then refresh your browser and try again.

## Next Steps After Rollback

Once the simple architecture is working:

1. Test full banking flow
2. Verify all tools work
3. Check audio playback
4. Test handoffs (if needed, we'll know what to fix)
5. Document what works and what doesn't

The simple architecture should "just work" because it's the original design that was tested and proven.
