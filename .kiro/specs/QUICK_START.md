# Quick Start: Phase 1 Testing

## TL;DR

All agents switched to text-only mode. Voice complexity removed. Ready to test core agent logic.

## Run These Commands

```bash
# Stop everything
docker-compose -f docker-compose-unified.yml down

# Rebuild
docker-compose -f docker-compose-unified.yml build

# Start
docker-compose -f docker-compose-unified.yml up -d

# Watch logs
docker-compose -f docker-compose-unified.yml logs -f agent-triage agent-banking
```

## Test This

1. Open: http://localhost:3000
2. Type: "What's my balance?"
3. Expect: Triage → Banking handoff, no duplication, no errors

## Success = 

- ✅ Messages appear in UI
- ✅ Agents respond
- ✅ Handoffs work
- ✅ No duplication
- ✅ No JSON errors

## If It Works

Move to Phase 2: Add voice to triage agent only

## If It Fails

Check logs:
```bash
docker-compose -f docker-compose-unified.yml logs agent-triage | tail -50
```

See `PHASE1_TESTING_GUIDE.md` for detailed troubleshooting.

## Files Changed

- `docker-compose-unified.yml` - All agents MODE=text
- `agents/src/agent-runtime-unified.ts` - Fixed hybrid mode bug

## Architecture

```
Browser → Gateway → Agent (Text Mode) → LangGraph → Tools
```

No voice layer. Pure text. Simple.

## Next Steps

1. Test text mode (Phase 1)
2. Add voice to one agent (Phase 2)  
3. Add voice to all agents (Phase 3)

## Documentation

- `CURRENT_STATUS.md` - What we've done
- `REBUILD_STRATEGY.md` - Overall plan
- `PHASE1_TESTING_GUIDE.md` - Detailed testing
- `QUICK_START.md` - This file
