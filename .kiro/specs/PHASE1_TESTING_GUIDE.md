# Phase 1 Testing Guide: Text-Only Mode

## Status: Ready to Test

All agents have been switched to `MODE=text`. Voice complexity has been removed to validate the core agent logic and handoff system.

## Pre-Test Checklist

- [x] All agents set to `MODE=text` in docker-compose-unified.yml
- [ ] Containers rebuilt with new configuration
- [ ] Services started successfully
- [ ] No errors in startup logs

## Build and Start Commands

```bash
# Stop any running containers
docker-compose -f docker-compose-unified.yml down

# Rebuild all services with text mode
docker-compose -f docker-compose-unified.yml build

# Start all services
docker-compose -f docker-compose-unified.yml up -d

# Watch logs for all agents
docker-compose -f docker-compose-unified.yml logs -f agent-triage agent-banking agent-mortgage agent-idv

# Or watch specific agent
docker-compose -f docker-compose-unified.yml logs -f agent-triage
```

## Test Scenarios

### Test 1: Basic Triage Response
**Goal**: Verify triage agent receives and responds to text input

**Steps**:
1. Open browser to `http://localhost:3000`
2. Type in chat: "Hello"
3. Press Enter

**Expected Result**:
- ✅ Message appears in UI as user message
- ✅ Triage agent responds with greeting
- ✅ No duplication
- ✅ No errors in logs

**Logs to Check**:
```bash
docker-compose -f docker-compose-unified.yml logs agent-triage | tail -20
```

Look for:
- `[TextAdapter] Received text input: Hello`
- `[Agent] Processing message`
- `[TextAdapter] Sending response`

---

### Test 2: Banking Balance Check (Handoff)
**Goal**: Verify triage → banking handoff works

**Steps**:
1. Type in chat: "What's my balance?"
2. Press Enter

**Expected Result**:
- ✅ Triage agent receives message
- ✅ Triage determines intent is banking
- ✅ Triage hands off to banking agent
- ✅ Banking agent asks for identity verification
- ✅ Response appears in UI
- ✅ No duplication
- ✅ No JSON parsing errors

**Logs to Check**:
```bash
# Triage logs
docker-compose -f docker-compose-unified.yml logs agent-triage | tail -30

# Banking logs
docker-compose -f docker-compose-unified.yml logs agent-banking | tail -30
```

Look for:
- Triage: `[Agent] Handing off to banking`
- Banking: `[TextAdapter] Received text input`
- Banking: `[Agent] Processing balance request`

---

### Test 3: Identity Verification Flow
**Goal**: Verify multi-turn conversation with IDV handoff

**Steps**:
1. Type: "What's my balance?"
2. Wait for response asking for verification
3. Type: "My name is John Smith, DOB 1990-01-01"
4. Wait for verification

**Expected Result**:
- ✅ Banking asks for identity
- ✅ Banking hands off to IDV agent
- ✅ IDV agent verifies identity
- ✅ IDV hands back to banking
- ✅ Banking provides balance
- ✅ All messages appear in correct order
- ✅ No duplication

**Logs to Check**:
```bash
docker-compose -f docker-compose-unified.yml logs agent-banking agent-idv | tail -50
```

---

### Test 4: Mortgage Inquiry
**Goal**: Verify triage → mortgage handoff

**Steps**:
1. Type: "I want to apply for a mortgage"
2. Press Enter

**Expected Result**:
- ✅ Triage hands off to mortgage agent
- ✅ Mortgage agent responds with mortgage options
- ✅ No errors

**Logs to Check**:
```bash
docker-compose -f docker-compose-unified.yml logs agent-triage agent-mortgage | tail -30
```

---

## Common Issues and Solutions

### Issue: "Connection refused" or "Cannot connect to gateway"

**Solution**:
```bash
# Check if gateway is running
docker-compose -f docker-compose-unified.yml ps gateway

# Check gateway logs
docker-compose -f docker-compose-unified.yml logs gateway

# Restart gateway
docker-compose -f docker-compose-unified.yml restart gateway
```

---

### Issue: "Redis connection failed"

**Solution**:
```bash
# Check Redis health
docker-compose -f docker-compose-unified.yml ps redis

# Test Redis connection
docker exec -it voice_s2s-redis-1 redis-cli ping
# Should return: PONG

# Restart Redis
docker-compose -f docker-compose-unified.yml restart redis
```

---

### Issue: Messages duplicated

**Cause**: Likely multiple adapters running or multiple instances of agent

**Solution**:
```bash
# Check if multiple instances running
docker-compose -f docker-compose-unified.yml ps

# Stop all and restart
docker-compose -f docker-compose-unified.yml down
docker-compose -f docker-compose-unified.yml up -d
```

---

### Issue: "JSON parsing error"

**Cause**: Frontend sending wrong data format or binary data

**Solution**:
1. Check browser console for errors
2. Check agent logs for exact error message
3. Verify TextAdapter is handling text input correctly

```bash
docker-compose -f docker-compose-unified.yml logs agent-triage | grep -i "json\|parse\|error"
```

---

### Issue: Agent not responding

**Cause**: Agent crashed, workflow error, or tool execution failure

**Solution**:
```bash
# Check if agent is running
docker-compose -f docker-compose-unified.yml ps agent-triage

# Check agent logs for errors
docker-compose -f docker-compose-unified.yml logs agent-triage | tail -50

# Restart agent
docker-compose -f docker-compose-unified.yml restart agent-triage
```

---

## Success Criteria for Phase 1

Before moving to Phase 2 (adding voice), ALL of these must pass:

- [ ] Test 1: Basic triage response works
- [ ] Test 2: Banking handoff works
- [ ] Test 3: IDV flow completes
- [ ] Test 4: Mortgage handoff works
- [ ] No message duplication
- [ ] No JSON parsing errors
- [ ] No connection errors
- [ ] Logs show clean message flow
- [ ] All agents respond within 2 seconds

## Next Steps After Phase 1 Success

Once all tests pass:

1. Document any issues found and fixed
2. Create Phase 2 plan: Add voice to triage agent only
3. Test voice input → text handoff
4. Gradually add voice to other agents

## Debugging Tips

### View Real-Time Logs
```bash
# All agents
docker-compose -f docker-compose-unified.yml logs -f

# Specific agent with timestamps
docker-compose -f docker-compose-unified.yml logs -f --timestamps agent-triage

# Filter for errors only
docker-compose -f docker-compose-unified.yml logs agent-triage | grep -i error
```

### Check Container Health
```bash
# List all containers and their status
docker-compose -f docker-compose-unified.yml ps

# Check resource usage
docker stats
```

### Restart Individual Services
```bash
# Restart just one agent
docker-compose -f docker-compose-unified.yml restart agent-banking

# Rebuild and restart one agent
docker-compose -f docker-compose-unified.yml build agent-banking
docker-compose -f docker-compose-unified.yml up -d agent-banking
```

### Clean Slate Restart
```bash
# Stop everything
docker-compose -f docker-compose-unified.yml down

# Remove volumes (clears Redis state)
docker-compose -f docker-compose-unified.yml down -v

# Rebuild everything
docker-compose -f docker-compose-unified.yml build

# Start fresh
docker-compose -f docker-compose-unified.yml up -d
```

## Log Analysis Patterns

### Good Pattern (Working)
```
[TextAdapter] Received text input: What's my balance?
[Agent] Processing message
[Agent] Intent detected: banking
[Agent] Handing off to banking agent
[TextAdapter] Sending response: Let me connect you to banking...
```

### Bad Pattern (Duplication)
```
[TextAdapter] Received text input: Hello
[VoiceAdapter] Received text input: Hello  ← WRONG! Should not have both
[TextAdapter] Sending response: Hi there
[TextAdapter] Sending response: Hi there  ← DUPLICATE!
```

### Bad Pattern (JSON Error)
```
[TextAdapter] Received data: [object Object]
[Agent] Error parsing JSON: Expected property name or '}' in JSON at position 1
[Session] Disconnecting due to error
```

## Contact Points

If tests fail, check these files:
- `agents/src/agent-runtime-unified.ts` - Main runtime logic
- `agents/src/adapters/text-adapter.ts` - Text input/output handling
- `gateway/src/server.ts` - Message routing
- `docker-compose-unified.yml` - Configuration

## Test Log Template

Use this to document your test results:

```
## Test Run: [Date/Time]

### Environment
- Docker Compose: docker-compose-unified.yml
- All agents: MODE=text
- Frontend: http://localhost:3000

### Test 1: Basic Triage
- Status: [ ] Pass [ ] Fail
- Notes: 

### Test 2: Banking Handoff
- Status: [ ] Pass [ ] Fail
- Notes:

### Test 3: IDV Flow
- Status: [ ] Pass [ ] Fail
- Notes:

### Test 4: Mortgage Handoff
- Status: [ ] Pass [ ] Fail
- Notes:

### Issues Found
1. 
2. 

### Next Actions
1. 
2. 
```
