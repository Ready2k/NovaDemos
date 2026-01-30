# S2S Integration Test Checklist

## Pre-Test Setup

- [ ] AWS credentials in `backend/.env`
  ```bash
  # Verify they exist
  cat backend/.env | grep AWS
  ```
  Should show AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

- [ ] Dependencies installed
  ```bash
  cd agents && npm install
  ```

- [ ] Build successful
  ```bash
  cd agents && npm run build
  # Should complete without errors
  ```

## Test Execution

### Option 1: Docker Compose (Recommended)

- [ ] Start services
  ```bash
  docker-compose -f docker-compose-s2s-test.yml up --build
  ```

- [ ] Check agent logs
  ```bash
  docker-compose -f docker-compose-s2s-test.yml logs -f agent-triage-s2s
  ```

- [ ] Verify startup messages:
  - [ ] `S2S Mode: ENABLED (Nova Sonic)`
  - [ ] `Registered with gateway`
  - [ ] No error messages

### Option 2: Local Test

- [ ] Run test script
  ```bash
  cd agents && ./test-s2s.sh
  ```

## Functional Tests

### 1. Basic Audio Flow

- [ ] Open http://localhost:3000
- [ ] Click microphone button
- [ ] Say "Hello"
- [ ] Hear response from Nova Sonic
- [ ] Check logs show:
  - [ ] `Nova Sonic S2S session started`
  - [ ] `Forwarding audio to Nova Sonic`
  - [ ] `Received audio from Nova Sonic`

### 2. Tool Calling

- [ ] Say "I want to check my balance"
- [ ] Hear response with balance information
- [ ] Check logs show:
  - [ ] `Tool called: get_account_balance`
  - [ ] Tool result received

### 3. Workflow Tracking

- [ ] Check logs for workflow steps:
  - [ ] `Workflow step: authenticate`
  - [ ] `Workflow step: check_balance`
- [ ] Check frontend shows workflow visualization

### 4. Transcripts

- [ ] Verify transcripts appear in UI
- [ ] Check both user and assistant messages
- [ ] Verify timestamps are correct

### 5. Session Management

- [ ] Disconnect and reconnect
- [ ] Verify new session starts correctly
- [ ] Check old session cleaned up

## Verification

### Agent Health Check

- [ ] Visit http://localhost:8081/health
- [ ] Should return:
  ```json
  {
    "status": "healthy",
    "agent": "triage",
    "s2s": "enabled",
    "workflow": "triage"
  }
  ```

### Gateway Health Check

- [ ] Visit http://localhost:8080/health
- [ ] Should show agent registered

### Redis Check

- [ ] Verify Redis is running
  ```bash
  docker-compose -f docker-compose-s2s-test.yml exec redis redis-cli ping
  # Should return: PONG
  ```

## Troubleshooting

### If audio doesn't work:

- [ ] Check AWS credentials are valid
- [ ] Check browser microphone permissions
- [ ] Check agent logs for errors
- [ ] Verify Nova Sonic is available in your region

### If build fails:

- [ ] Run `npm install` in agents directory
- [ ] Check Node version (should be 20+)
- [ ] Check for TypeScript errors

### If agent won't start:

- [ ] Check AWS credentials are exported
- [ ] Check workflow file exists
- [ ] Check port 8081 is available
- [ ] Check Redis is running

## Success Criteria

All of these should be true:

- [ ] ✅ Agent starts without errors
- [ ] ✅ S2S mode is enabled
- [ ] ✅ Audio flows bidirectionally
- [ ] ✅ User hears responses
- [ ] ✅ Tools are called
- [ ] ✅ Transcripts appear
- [ ] ✅ Workflow steps detected
- [ ] ✅ No crashes or errors

## Performance Checks

- [ ] Audio latency < 2 seconds
- [ ] No audio dropouts
- [ ] Smooth conversation flow
- [ ] Tool calls complete quickly

## Clean Up

After testing:

```bash
# Stop services
docker-compose -f docker-compose-s2s-test.yml down

# Clean up volumes (optional)
docker-compose -f docker-compose-s2s-test.yml down -v
```

## Next Steps

If all tests pass:

- [ ] Document any issues found
- [ ] Proceed to workflow context injection
- [ ] Begin LangGraph integration
- [ ] Test with other agents (banking, mortgage, etc.)

## Notes

Use this space to record observations:

```
Date: ___________
Tester: ___________

Observations:
- 
- 
- 

Issues Found:
- 
- 
- 

Performance Notes:
- 
- 
- 
```

---

**Status**: Ready for Testing  
**Last Updated**: 2026-01-29
