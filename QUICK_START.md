# Quick Start - Voice Testing

## One Command to Rule Them All

```bash
./start-all-services.sh
```

This starts:
- ✅ Gateway (port 8080)
- ✅ Agent (port 8081)
- ✅ Frontend (port 3000)

## Then

1. Open http://localhost:3000
2. Click microphone 🎤
3. Start speaking!

## That's It!

The complete architecture is running:
```
Your Voice → Frontend → Gateway → Agent → Nova Sonic → You Hear Response
```

## View Logs

```bash
# Gateway logs
tail -f logs/gateway.log

# Agent logs
tail -f logs/agent.log

# Frontend logs
tail -f logs/frontend.log
```

## Stop Everything

Press `Ctrl+C` in the terminal where you ran `./start-all-services.sh`

## Alternative: Start Separately

**Terminal 1: Backend Services**
```bash
./test-gateway-integration.sh
```

**Terminal 2: Frontend**
```bash
./start-frontend.sh
```

## Troubleshooting

### Port 3000 Already in Use?

```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9

# Then restart
./start-all-services.sh
```

### Services Not Starting?

Check the logs:
```bash
cat logs/gateway.log
cat logs/agent.log
cat logs/frontend.log
```

### AWS Credentials?

Make sure `backend/.env` has:
```
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
```

## Health Checks

```bash
# Gateway
curl http://localhost:8080/health | jq

# Agent
curl http://localhost:8081/health | jq

# Frontend
curl http://localhost:3000
```

## What You're Testing

- ✅ Speech-to-Speech (S2S)
- ✅ Workflow tracking
- ✅ Decision automation
- ✅ Tool execution
- ✅ Complete audio pipeline

## Success = You Hear a Response!

That's it. If you hear Nova Sonic respond to your voice, everything is working!

---

**Command**: `./start-all-services.sh`  
**URL**: http://localhost:3000  
**Action**: Speak! 🎤
