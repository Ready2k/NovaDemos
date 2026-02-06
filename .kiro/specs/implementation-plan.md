# Implementation Plan: Docker Runtime Fixes

## Quick Wins (Can implement immediately)

### 1. Fix Environment Variable Consistency (5 minutes)

**File**: `docker-compose-unified.yml`

Find and replace all instances of:
```yaml
- AGENTCORE_URL=${AGENTCORE_GATEWAY_URL}
```

With:
```yaml
- AGENTCORE_GATEWAY_URL=${AGENTCORE_GATEWAY_URL}
```

**File**: `agents/src/agent-runtime-unified.ts` (line ~850)

Change:
```typescript
agentCoreUrl: process.env.AGENTCORE_URL
```

To:
```typescript
agentCoreUrl: process.env.AGENTCORE_GATEWAY_URL
```

### 2. Disable Auto-Trigger Temporarily (1 minute)

**File**: `.env`

Add this line:
```bash
AUTO_TRIGGER_ENABLED=false
```

Then rebuild and restart:
```bash
docker-compose -f docker-compose-unified.yml restart agent-banking
```

This will immediately stop the excessive activity while you implement the proper fix.

### 3. Reduce Logging Noise (2 minutes)

**File**: `.env`

Add:
```bash
LOG_LEVEL=info
```

**File**: `docker-compose-unified.yml`

Add to each agent service:
```yaml
environment:
  - LOG_LEVEL=${LOG_LEVEL:-info}
```

## Medium Priority (Implement within 1 day)

### 4. Add Auto-Trigger Guards

Follow the code changes in Priority 1 of the improvements document.

Key changes:
- Add `autoTriggered` flag to RuntimeSession
- Check flag before triggering
- Respect `AUTO_TRIGGER_ENABLED` environment variable

### 5. Improve Session Cleanup

Follow the code changes in Priority 3 of the improvements document.

Key changes:
- Add await for cleanup completion
- Add 100ms delay after cleanup
- Verify session is removed before proceeding

## Long Term (Implement within 1 week)

### 6. Add Circuit Breaker

Follow the code changes in Priority 5 of the improvements document.

### 7. Add Conditional Logging

Follow the code changes in Priority 4 of the improvements document.

### 8. Add Docker Health Checks

Update docker-compose-unified.yml with health checks for all services.

## Testing Checklist

After each change:

- [ ] Rebuild containers: `docker-compose -f docker-compose-unified.yml build`
- [ ] Start with logs: `docker-compose -f docker-compose-unified.yml up agent-banking`
- [ ] Check log volume (should be <10 lines/minute when idle)
- [ ] Test banking flow end-to-end
- [ ] Check for errors in logs
- [ ] Verify no "Session already exists" warnings
- [ ] Verify no AgentCore errors

## Rollback Plan

If issues occur:

1. Stop containers: `docker-compose -f docker-compose-unified.yml down`
2. Revert code changes: `git checkout <file>`
3. Rebuild: `docker-compose -f docker-compose-unified.yml build`
4. Restart: `docker-compose -f docker-compose-unified.yml up -d`

## Monitoring

Watch these metrics:
- Log lines per minute (should decrease)
- Session initialization count (should be 1 per user connection)
- Error rate (should be near zero)
- Response time (should remain <500ms)
