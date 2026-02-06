# Phase 1 Testing Checklist

Use this checklist to track your testing progress.

## Pre-Testing Setup

- [ ] Read `QUICK_START.md`
- [ ] Read `PHASE1_TESTING_GUIDE.md`
- [ ] Terminal ready with docker-compose commands
- [ ] Browser ready to open http://localhost:3000

## Build and Deploy

```bash
docker-compose -f docker-compose-unified.yml down
docker-compose -f docker-compose-unified.yml build
docker-compose -f docker-compose-unified.yml up -d
```

- [ ] Containers stopped successfully
- [ ] Build completed without errors
- [ ] All services started successfully
- [ ] No errors in startup logs

## Service Health Checks

```bash
docker-compose -f docker-compose-unified.yml ps
```

- [ ] Gateway: Running
- [ ] Redis: Running (healthy)
- [ ] Frontend: Running
- [ ] Agent-Triage: Running
- [ ] Agent-Banking: Running
- [ ] Agent-Mortgage: Running
- [ ] Agent-IDV: Running
- [ ] Agent-Disputes: Running
- [ ] Agent-Investigation: Running
- [ ] Local-Tools: Running

## Test 1: Basic Triage Response

**Input**: "Hello"

- [ ] Message appears in UI as user message
- [ ] Triage agent responds with greeting
- [ ] Response appears within 2 seconds
- [ ] No message duplication
- [ ] No errors in logs

**Logs to check**:
```bash
docker-compose -f docker-compose-unified.yml logs agent-triage | tail -20
```

## Test 2: Banking Handoff

**Input**: "What's my balance?"

- [ ] Triage agent receives message
- [ ] Triage identifies banking intent
- [ ] Triage hands off to banking agent
- [ ] Banking agent responds (asks for IDV)
- [ ] Response appears in UI
- [ ] No message duplication
- [ ] No JSON parsing errors

**Logs to check**:
```bash
docker-compose -f docker-compose-unified.yml logs agent-triage agent-banking | tail -40
```

## Test 3: Identity Verification Flow

**Input 1**: "What's my balance?"
**Input 2**: "My name is John Smith, DOB 1990-01-01"

- [ ] Banking asks for identity
- [ ] Banking hands off to IDV agent
- [ ] IDV agent processes verification
- [ ] IDV hands back to banking
- [ ] Banking provides balance
- [ ] All messages in correct order
- [ ] No duplication

**Logs to check**:
```bash
docker-compose -f docker-compose-unified.yml logs agent-banking agent-idv | tail -50
```

## Test 4: Mortgage Inquiry

**Input**: "I want to apply for a mortgage"

- [ ] Triage identifies mortgage intent
- [ ] Triage hands off to mortgage agent
- [ ] Mortgage agent responds
- [ ] Response appears in UI
- [ ] No errors

**Logs to check**:
```bash
docker-compose -f docker-compose-unified.yml logs agent-triage agent-mortgage | tail -30
```

## Overall System Checks

- [ ] No message duplication in any test
- [ ] No JSON parsing errors in any test
- [ ] All responses within 2 seconds
- [ ] Logs are clean and informative
- [ ] No connection errors
- [ ] No Redis errors
- [ ] Frontend loads correctly
- [ ] UI is responsive

## Performance Metrics

Record these for baseline:

- Average response time: _______ ms
- Triage → Banking handoff time: _______ ms
- Banking → IDV handoff time: _______ ms
- Total conversation time: _______ seconds

## Issues Found

Document any issues:

### Issue 1
- **Test**: _____________
- **Error**: _____________
- **Logs**: _____________
- **Hypothesis**: _____________

### Issue 2
- **Test**: _____________
- **Error**: _____________
- **Logs**: _____________
- **Hypothesis**: _____________

## Phase 1 Result

- [ ] **PASS**: All tests passed, ready for Phase 2
- [ ] **FAIL**: Issues found, need debugging

## If PASS: Phase 2 Preparation

- [ ] Document test results
- [ ] Record performance metrics
- [ ] Create Phase 2 plan
- [ ] Change triage to MODE=voice
- [ ] Test voice input

## If FAIL: Debugging Steps

- [ ] Identify which test failed
- [ ] Collect error messages
- [ ] Review logs
- [ ] Check `PHASE1_TESTING_GUIDE.md` troubleshooting
- [ ] Apply fixes
- [ ] Re-test

## Sign-Off

**Tester**: _____________
**Date**: _____________
**Time**: _____________
**Result**: PASS / FAIL
**Notes**: _____________

---

## Quick Commands Reference

### View Logs
```bash
# All agents
docker-compose -f docker-compose-unified.yml logs -f

# Specific agent
docker-compose -f docker-compose-unified.yml logs -f agent-triage

# With timestamps
docker-compose -f docker-compose-unified.yml logs -f --timestamps agent-triage

# Last 50 lines
docker-compose -f docker-compose-unified.yml logs agent-triage | tail -50

# Filter errors
docker-compose -f docker-compose-unified.yml logs agent-triage | grep -i error
```

### Restart Services
```bash
# Restart one agent
docker-compose -f docker-compose-unified.yml restart agent-triage

# Restart all
docker-compose -f docker-compose-unified.yml restart

# Stop all
docker-compose -f docker-compose-unified.yml down

# Start all
docker-compose -f docker-compose-unified.yml up -d
```

### Check Status
```bash
# List containers
docker-compose -f docker-compose-unified.yml ps

# Check resources
docker stats

# Check Redis
docker exec -it voice_s2s-redis-1 redis-cli ping
```

---

**Next**: After completing this checklist, see `CURRENT_STATUS.md` for next steps.
