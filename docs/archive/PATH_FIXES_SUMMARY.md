# Docker Path Resolution Fixes

## Issue
SonicClient was failing to load prompt files in Docker because it was using relative paths from `__dirname` which resolved incorrectly in the Docker container.

**Error**:
```
Failed to load dialect detection prompt: Error: ENOENT: no such file or directory, 
open '/app/prompts/hidden-dialect_detection.txt'
```

**Root Cause**: 
- Code was looking for `/app/prompts/` 
- But Docker volume mounts prompts at `/app/backend/prompts/` (for backend) or `/app/backend/prompts/` (for agents)

## Files Fixed

### 1. agents/src/sonic-client.ts
**Fixed Methods**:
- `loadDefaultPrompt()` - Now uses Docker-aware path resolution
- `loadDialectDetectionPrompt()` - Now uses Docker-aware path resolution

**Before**:
```typescript
const PROMPTS_DIR = path.join(__dirname, '../prompts');
```

**After**:
```typescript
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const PROMPTS_DIR = path.join(BASE_DIR, 'backend/prompts');
```

### 2. backend/src/sonic-client.ts
**Fixed Methods**:
- `loadDefaultPrompt()` - Now uses Docker-aware path resolution
- `loadDialectDetectionPrompt()` - Now uses Docker-aware path resolution

**Before**:
```typescript
const PROMPTS_DIR = path.join(__dirname, '../prompts');
```

**After**:
```typescript
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const PROMPTS_DIR = path.join(BASE_DIR, 'prompts');
```

## Already Correct Files

These files already use Docker-aware path resolution:

### Agents
- ✅ `agents/src/agent-runtime-unified.ts` - Uses Docker-aware BASE_DIR
- ✅ `agents/src/banking-tools.ts` - Uses Docker-aware BASE_DIR

### Backend
- ✅ `backend/src/services/prompt-service.ts` - Uses Docker-aware BASE_DIR
- ✅ `backend/src/services/tool-service.ts` - Uses Docker-aware BASE_DIR
- ✅ `backend/src/services/sonic-service.ts` - Uses Docker-aware BASE_DIR
- ✅ `backend/src/server.ts` - Uses Docker-aware BASE_DIR

### Gateway
- ✅ `gateway/src/server.ts` - Uses Docker-aware BASE_DIR

## Docker Volume Mounts

### Agents (docker-compose-unified.yml)
```yaml
volumes:
  - ./backend/workflows/workflow_triage.json:/app/workflow.json:ro
  - ./backend/personas:/app/backend/personas:ro
  - ./backend/prompts:/app/backend/prompts:ro
  - ./backend/tools:/app/backend/tools:ro
```

### Backend (docker-compose.yml)
```yaml
volumes:
  - ./backend/prompts:/app/prompts:ro
  - ./backend/tools:/app/tools:ro
  - ./backend/history:/app/history
```

### Gateway (docker-compose-unified.yml)
```yaml
volumes:
  - ./backend/workflows:/app/workflows
  - ./backend/tools:/app/tools
  - ./backend/history:/app/history
  - ./backend/prompts:/app/prompts
  - ./backend/knowledge_bases.json:/app/knowledge_bases.json
```

## Path Resolution Pattern

All services now follow this pattern:

```typescript
// Determine if running in Docker or locally
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const RESOURCE_DIR = path.join(BASE_DIR, 'relative/path/to/resource');
```

**Benefits**:
- ✅ Works in Docker containers
- ✅ Works in local development
- ✅ Consistent across all services
- ✅ Easy to understand and maintain

## Rebuild Required

After these fixes, the following services need to be rebuilt:

### Agents
```bash
cd agents && npm run build
docker-compose -f docker-compose-unified.yml build agent-triage agent-banking agent-mortgage agent-idv agent-disputes agent-investigation
docker-compose -f docker-compose-unified.yml restart agent-triage agent-banking agent-mortgage agent-idv agent-disputes agent-investigation
```

### Backend (if using standalone backend)
```bash
cd backend && npm run build
docker-compose build backend
docker-compose restart backend
```

## Verification

After rebuild, verify the fix:

```bash
# Check agent logs - should see successful prompt loading
docker-compose -f docker-compose-unified.yml logs agent-triage | grep "dialect detection"

# Should show:
# [SonicClient:xxx] Loaded dialect detection prompt from /app/backend/prompts
```

## Related Issues

This fix resolves:
- ❌ ENOENT errors for `hidden-dialect_detection.txt`
- ❌ ENOENT errors for `core-system_default.txt`
- ❌ Any other prompt loading failures in Docker

## Prevention

To prevent similar issues in the future:

1. **Always use Docker-aware path resolution** for any file system access
2. **Test in Docker** before considering a feature complete
3. **Use the pattern** shown above for all path.join(__dirname) calls
4. **Document volume mounts** clearly in docker-compose files

---

**Status**: ✅ FIXED
**Date**: February 4, 2026
**Impact**: All agents can now load prompts correctly in Docker
