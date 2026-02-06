# Changes Applied - Docker Runtime Fixes

## Summary

All recommended fixes from `docker-runtime-improvements.md` have been implemented. This document tracks what was changed.

## Files Modified

### 1. Frontend API Routes (Fixed 500 Errors)

**Files Changed**:
- `frontend-v2/app/api/voices/route.ts`
- `frontend-v2/app/api/history/route.ts`

**Changes**:
- Updated to use `INTERNAL_API_URL` for server-side requests (Docker network)
- Falls back to `NEXT_PUBLIC_API_URL` for local development
- Added better error handling and logging

**Impact**: Frontend will now successfully fetch voices and history from the gateway service.

### 2. Docker Compose Configuration

**File Changed**: `docker-compose-unified.yml`

**Changes Made**:
- Fixed environment variable: `AGENTCORE_URL` → `AGENTCORE_GATEWAY_URL` (all agents)
- Added `LOG_LEVEL` environment variable (all agents)
- Added `AUTO_TRIGGER_ENABLED` environment variable (all agents)

**Agents Updated**:
- agent-triage
- agent-banking
- agent-mortgage
- agent-idv
- agent-disputes
- agent-investigation

**Impact**: Consistent environment variables across all services, proper logging control.

### 3. Agent Runtime Core

**File Changed**: `agents/src/agent-runtime-unified.ts`

**Changes Made**:

#### a) Added Configuration Constants (Top of file)
```typescript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const DEBUG = LOG_LEVEL === 'debug';
const AUTO_TRIGGER_ENABLED = process.env.AUTO_TRIGGER_ENABLED !== 'false';
const MAX_SESSION_ERRORS = parseInt(process.env.MAX_SESSION_ERRORS || '5');
const ERROR_WINDOW_MS = parseInt(process.env.ERROR_WINDOW_MS || '10000');
```

#### b) Enhanced RuntimeSession Interface
Added fields:
- `autoTriggered?: boolean` - Track if auto-trigger already fired
- `errorCount?: number` - Track errors for circuit breaker
- `lastError?: number` - Timestamp of last error

#### c) Fixed Environment Variable
Changed line ~850:
```typescript
agentCoreUrl: process.env.AGENTCORE_GATEWAY_URL  // Was: AGENTCORE_URL
```

#### d) Reduced Logging Noise in handleConnection()
- Only logs important message types in production (session_init, error, handoff, memory_update)
- Audio chunks only logged in DEBUG mode
- Added conditional logging throughout

#### e) Improved initializeSession()
**Session Cleanup**:
- Added proper async cleanup with verification
- Added 100ms delay after cleanup to ensure completion
- Throws error if cleanup fails

**Auto-Trigger Guards**:
- Checks `AUTO_TRIGGER_ENABLED` environment variable
- Sets `session.autoTriggered = true` to prevent re-triggering
- Increased delay from 1000ms to 1500ms for safety
- Only logs debug messages when `DEBUG` is true

**Error Handling**:
- Closes WebSocket on initialization failure
- Sends fatal error message to client
- Properly cleans up session state

#### f) Added Circuit Breaker in handleMessage()
**Features**:
- Tracks error count per session
- Checks if errors exceed threshold within time window
- Automatically closes sessions with repeated errors
- Resets error count after window expires
- Sends fatal error message before closing

**Logic**:
```typescript
if (session.errorCount >= MAX_SESSION_ERRORS) {
    if (timeSinceLastError < ERROR_WINDOW_MS) {
        // Close session
    } else {
        // Reset error count
    }
}
```

### 4. Environment Configuration

**File Changed**: `.env`

**New Variables Added**:
```bash
# Agent Runtime Configuration
AUTO_TRIGGER_ENABLED=true
LOG_LEVEL=info
MAX_SESSION_ERRORS=5
ERROR_WINDOW_MS=10000
```

**Impact**: Runtime behavior can now be controlled via environment variables without code changes.

## Testing Checklist

Before deploying, verify:

- [ ] Frontend loads without 500 errors
- [ ] Voices dropdown populates correctly
- [ ] History panel loads session data
- [ ] Banking agent logs show <10 lines/minute when idle
- [ ] No "Session already exists" warnings
- [ ] No "AgentCore ARN is not known" errors
- [ ] Auto-trigger fires exactly once per session
- [ ] Circuit breaker activates after 5 errors
- [ ] Banking flow completes end-to-end

## Deployment Steps

### 1. Rebuild Containers
```bash
# Rebuild all affected services
docker-compose -f docker-compose-unified.yml build frontend agent-triage agent-banking agent-mortgage agent-idv agent-disputes agent-investigation

# Or rebuild everything
docker-compose -f docker-compose-unified.yml build
```

### 2. Restart Services
```bash
# Stop all services
docker-compose -f docker-compose-unified.yml down

# Start with logs visible (for testing)
docker-compose -f docker-compose-unified.yml up

# Or start in background (for production)
docker-compose -f docker-compose-unified.yml up -d
```

### 3. Monitor Logs
```bash
# Watch all logs
docker-compose -f docker-compose-unified.yml logs -f

# Watch specific service
docker-compose -f docker-compose-unified.yml logs -f agent-banking

# Check for errors
docker-compose -f docker-compose-unified.yml logs | grep -i error
```

### 4. Test Frontend
1. Open browser to `http://localhost:3000`
2. Check browser console for errors
3. Verify voices dropdown loads
4. Verify history panel loads
5. Test voice interaction

### 5. Test Banking Flow
1. Start a conversation
2. Verify triage agent responds
3. Request banking operation
4. Verify handoff to banking agent
5. Complete transaction
6. Check logs for excessive activity

## Rollback Plan

If issues occur:

```bash
# Stop containers
docker-compose -f docker-compose-unified.yml down

# Revert code changes
git checkout frontend-v2/app/api/voices/route.ts
git checkout frontend-v2/app/api/history/route.ts
git checkout agents/src/agent-runtime-unified.ts
git checkout docker-compose-unified.yml
git checkout .env

# Rebuild and restart
docker-compose -f docker-compose-unified.yml build
docker-compose -f docker-compose-unified.yml up -d
```

## Configuration Options

### Disable Auto-Trigger (Recommended for Testing)
```bash
# In .env file
AUTO_TRIGGER_ENABLED=false
```

Then restart:
```bash
docker-compose -f docker-compose-unified.yml restart agent-banking agent-idv
```

### Enable Debug Logging
```bash
# In .env file
LOG_LEVEL=debug
```

Then restart all agents:
```bash
docker-compose -f docker-compose-unified.yml restart agent-triage agent-banking agent-mortgage agent-idv agent-disputes agent-investigation
```

### Adjust Circuit Breaker
```bash
# In .env file
MAX_SESSION_ERRORS=10        # Allow more errors before breaking
ERROR_WINDOW_MS=20000        # Longer time window (20 seconds)
```

## Expected Improvements

### Before Changes:
- ❌ Frontend 500 errors on /api/voices and /api/history
- ❌ Banking agent logs: 50-100+ lines/minute
- ❌ "Session already exists" warnings
- ❌ "AgentCore ARN is not known" errors
- ❌ Auto-trigger fires multiple times
- ❌ Sessions continue after errors

### After Changes:
- ✅ Frontend loads successfully
- ✅ Banking agent logs: <10 lines/minute when idle
- ✅ No session re-initialization warnings
- ✅ No AgentCore configuration errors
- ✅ Auto-trigger fires exactly once
- ✅ Circuit breaker protects against error loops

## Success Metrics

Monitor these after deployment:

1. **Log Volume**: Should decrease by 80-90%
2. **Error Rate**: Should be near zero
3. **Session Count**: Should match user connections (no duplicates)
4. **Response Time**: Should remain <500ms
5. **Completion Rate**: Banking flows should complete successfully

## Next Steps

After verifying these changes work:

1. Update other docker-compose files (docker-compose.yml, docker-compose-a2a.yml)
2. Add health checks to all services
3. Add resource limits
4. Document configuration options in README
5. Create monitoring dashboard

## Notes

- All changes are backward compatible
- Can be deployed incrementally (frontend first, then agents)
- Environment variables have sensible defaults
- Debug mode can be enabled without code changes
- Circuit breaker prevents runaway errors
