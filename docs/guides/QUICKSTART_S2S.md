# Quick Start: S2S Integration Test

## 🎯 Goal

Test Nova Sonic S2S integration in the triage agent. This proves that agents can maintain Nova Sonic sessions just like the legacy backend does.

## ⚡ Quick Start (2 minutes)

### 1. Verify AWS Credentials

Your AWS credentials should already be in `backend/.env`:

```bash
# Check they exist
cat backend/.env | grep AWS
```

Should show:
```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

### 2. Start the Test Stack

```bash
docker-compose -f docker-compose-s2s-test.yml up --build
```

That's it! The docker-compose file automatically loads credentials from `backend/.env`.

### 3. Open Frontend

Open http://localhost:3000 in your browser

### 4. Test Voice Interaction

1. Click the microphone button
2. Say "Hello, I want to check my balance"
3. You should hear a response!

## 📊 What to Check

### Terminal Logs

Look for these success indicators:

```
✅ [Agent:triage] S2S Mode: ENABLED (Nova Sonic)
✅ [Agent:triage] Nova Sonic S2S session started
✅ [Agent:triage] Forwarding audio to Nova Sonic
✅ [Agent:triage] Received audio from Nova Sonic
```

### Browser Console

Should see:

```
✅ Connected to WebSocket
✅ Session acknowledged
✅ Receiving audio
✅ Transcript: "..."
```

## 🎉 Success!

If you hear audio responses, **it works!** The agent is now:
- Maintaining a Nova Sonic S2S session
- Forwarding audio bidirectionally
- Handling tool calls via Nova Sonic

## 🐛 Troubleshooting

### No audio response?

1. Check AWS credentials are set
2. Check browser microphone permissions
3. Check agent logs for errors

### Build errors?

```bash
cd agents
npm install
```

### Can't connect?

Make sure ports 3000, 8080, 8081 are available.

## 📚 More Details

See `agents/S2S_INTEGRATION_TEST.md` for comprehensive testing guide.

## 🚀 Next Steps

Once this works:
1. Add workflow context injection
2. Integrate LangGraph state updates
3. Implement agent handoffs
4. Test with all 5 agents

## 💡 What This Proves

✅ Agents can maintain Nova Sonic S2S sessions  
✅ Audio flows through multi-hop architecture  
✅ Tool calling works via Nova Sonic  
✅ Architecture is sound for Phase 3  

This is the foundation for the full A2A S2S system!
