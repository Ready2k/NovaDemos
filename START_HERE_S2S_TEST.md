# 🚀 START HERE: S2S Integration Test

## What You're About to Test

We've integrated Nova Sonic's Speech-to-Speech into the A2A agent architecture. This test proves that agents can maintain S2S sessions just like the legacy backend does.

## Prerequisites

✅ AWS credentials already in `backend/.env`  
✅ Docker installed and running  
✅ Ports 3000, 8080, 8081 available  

## One Command to Test Everything

```bash
./test-s2s-integration.sh
```

That's it! This script will:
1. ✅ Check your AWS credentials
2. ✅ Build the agents
3. ✅ Start all services
4. ✅ Tell you when ready

## What Happens Next

1. **Services Start** (30-60 seconds)
   - Gateway (routing)
   - Triage Agent with S2S
   - Redis (state)
   - Local Tools (MCP)
   - Frontend (UI)

2. **Open Browser**
   - Go to http://localhost:3000
   - Click microphone button
   - Say "Hello, I want to check my balance"
   - You should hear a response!

3. **Watch the Logs**
   Look for these success indicators:
   ```
   ✅ [Agent:triage] S2S Mode: ENABLED (Nova Sonic)
   ✅ [Agent:triage] Nova Sonic S2S session started
   ✅ [Agent:triage] Forwarding audio to Nova Sonic
   ✅ [Agent:triage] Received audio from Nova Sonic
   ```

## What This Proves

If you hear audio responses:

✅ Agents can maintain Nova Sonic S2S sessions  
✅ Audio flows through multi-hop architecture  
✅ Tool calling works via Nova Sonic  
✅ Foundation for Phase 3 is solid  

## Troubleshooting

### "AWS credentials not found"
Check `backend/.env` has:
```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

### "Port already in use"
Stop other services using ports 3000, 8080, 8081:
```bash
# Check what's using the ports
lsof -i :3000
lsof -i :8080
lsof -i :8081
```

### "No audio response"
1. Check browser microphone permissions
2. Check agent logs for errors
3. Verify AWS credentials are valid

## Stop the Test

Press `Ctrl+C` in the terminal, then:
```bash
docker-compose -f docker-compose-s2s-test.yml down
```

## More Information

- **Quick Start**: `QUICKSTART_S2S.md`
- **Detailed Guide**: `agents/S2S_INTEGRATION_TEST.md`
- **Test Checklist**: `S2S_TEST_CHECKLIST.md`
- **Full Summary**: `S2S_INTEGRATION_SUMMARY.md`

## Ready?

```bash
./test-s2s-integration.sh
```

Let's see it work! 🎉
