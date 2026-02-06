# Quick Deployment Guide - Docker Runtime Fixes

## What Was Fixed

1. ✅ Frontend 500 errors (`/api/voices`, `/api/history`)
2. ✅ Banking agent excessive logging
3. ✅ AgentCore environment variable mismatch
4. ✅ Auto-trigger running in loops
5. ✅ Session re-initialization issues
6. ✅ No error circuit breaker

## Quick Deploy (5 minutes)

### Step 1: Rebuild Containers
```bash
docker-compose -f docker-compose-unified.yml build
```

### Step 2: Restart Services
```bash
docker-compose -f docker-compose-unified.yml down
docker-compose -f docker-compose-unified.yml up -d
```

### Step 3: Verify
```bash
# Check logs (should be much quieter now)
docker-compose -f docker-compose-unified.yml logs -f agent-banking

# Open frontend
open http://localhost:3000
```

## Configuration Options

### For Testing: Disable Auto-Trigger
Edit `.env`:
```bash
AUTO_TRIGGER_ENABLED=false
```

Then restart:
```bash
docker-compose -f docker-compose-unified.yml restart agent-banking agent-idv
```

### For Debugging: Enable Verbose Logs
Edit `.env`:
```bash
LOG_LEVEL=debug
```

Then restart:
```bash
docker-compose -f docker-compose-unified.yml restart agent-triage agent-banking
```

## What to Watch For

### Good Signs ✅
- Frontend loads without errors
- Banking agent logs: <10 lines/minute when idle
- No "Session already exists" warnings
- No AgentCore errors
- Banking flow completes successfully

### Bad Signs ❌
- Still seeing 500 errors in browser console
- Excessive logging continues
- "Session already exists" warnings
- AgentCore connection errors
- Banking flow hangs

## Troubleshooting

### Frontend Still Shows 500 Errors
```bash
# Check if frontend container rebuilt
docker-compose -f docker-compose-unified.yml build frontend
docker-compose -f docker-compose-unified.yml restart frontend

# Check frontend logs
docker-compose -f docker-compose-unified.yml logs frontend
```

### Banking Agent Still Too Noisy
```bash
# Verify LOG_LEVEL is set
docker-compose -f docker-compose-unified.yml exec agent-banking env | grep LOG_LEVEL

# Should show: LOG_LEVEL=info

# If not, check .env file and restart
docker-compose -f docker-compose-unified.yml restart agent-banking
```

### Auto-Trigger Still Firing Multiple Times
```bash
# Disable it temporarily
echo "AUTO_TRIGGER_ENABLED=false" >> .env
docker-compose -f docker-compose-unified.yml restart agent-banking agent-idv
```

## Rollback

If something breaks:
```bash
# Stop everything
docker-compose -f docker-compose-unified.yml down

# Revert changes
git checkout .

# Rebuild and restart
docker-compose -f docker-compose-unified.yml build
docker-compose -f docker-compose-unified.yml up -d
```

## Files Changed

- `frontend-v2/app/api/voices/route.ts` - Fixed internal URL
- `frontend-v2/app/api/history/route.ts` - Fixed internal URL
- `agents/src/agent-runtime-unified.ts` - All runtime improvements
- `docker-compose-unified.yml` - Environment variables
- `.env` - New configuration options

## Support

See detailed documentation:
- `.kiro/specs/docker-runtime-improvements.md` - Full analysis
- `.kiro/specs/CHANGES_APPLIED.md` - Complete change log
- `.kiro/specs/implementation-plan.md` - Step-by-step guide
