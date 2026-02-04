# Quick Test Guide - Text Chat Fix

## 🎯 What Was Fixed
Text messages now display correctly in the frontend. The issue was a missing `isFinal` flag in transcript events.

## ✅ Quick Test (30 seconds)

1. **Open the app**: http://localhost:3000
2. **Type a message**: "Hello"
3. **Press Send**

### Expected Result
You should see:
- ✅ Your message: "Hello"
- ✅ Agent response: "Hello! I can help you with your banking needs. How can I assist you today?"

### If It Doesn't Work
Run the test script:
```bash
./test-text-chat.sh
```

## 🔍 Detailed Testing

### Test 1: Basic Chat
```
You: Hello
Agent: Hello! I can help you with your banking needs...
```

### Test 2: Banking Query
```
You: What's my account balance?
Agent: I'll check your account balance for you...
```

### Test 3: Multiple Messages
```
You: Hello
Agent: Hello! How can I help?
You: Check my balance
Agent: I'll check that for you...
```

## 📊 What to Check

### In the Browser
- ✅ Messages appear in chat window
- ✅ Token counter updates
- ✅ No errors in console (F12)

### In the Logs
```bash
# Watch live logs
docker-compose -f docker-compose-unified.yml logs -f agent-triage gateway

# Should see:
# [VoiceSideCar] Handling text input: Hello
# [Gateway] Forwarding transcript to client
```

## 🐛 Troubleshooting

### Problem: No response at all
**Solution**: Check browser console (F12) for errors

### Problem: "Message received and processed"
**Solution**: The fix didn't apply. Rebuild agents:
```bash
cd agents && npm run build
docker-compose -f docker-compose-unified.yml build --no-cache agent-triage
docker-compose -f docker-compose-unified.yml restart agent-triage
```

### Problem: Connection errors
**Solution**: Restart all services:
```bash
docker-compose -f docker-compose-unified.yml restart
```

## 📝 Technical Details

For technical details about the fix, see:
- **VOICE_INTERACTION_FIXED.md** - Detailed explanation
- **TEXT_CHAT_FINAL_FIX.md** - Complete summary

## 🎉 Success Criteria

✅ Text messages display in chat
✅ Agent responses appear
✅ Token counter updates
✅ No console errors
✅ Both voice and text work (hybrid mode)

## 🚀 Next Steps

Once text chat works:
1. Test voice input (click microphone button)
2. Test hybrid mode (both text and voice)
3. Test different agents (banking, mortgage, etc.)
4. Test tool execution (balance check, transactions, etc.)
