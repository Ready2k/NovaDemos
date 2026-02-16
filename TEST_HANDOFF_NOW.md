# Quick Test Guide - Gateway Handoff Fix

## ✅ Services Status
All services are **HEALTHY** and ready for testing:
- ✅ Gateway (port 8080)
- ✅ Triage Agent (port 8081)
- ✅ IDV Agent (port 8084)
- ✅ Banking Agent (port 8082)
- ✅ Frontend (port 3000)

## 🧪 Test Now

### Step 1: Open Application
```
http://localhost:3000
```

### Step 2: Configure Test
1. Select **"Triage"** from agent dropdown
2. Choose **"Text Mode"** (easier to debug)
3. Click **Connect**

### Step 3: Test Balance Check
**Say/Type**: "What's my balance?"

### Step 4: Provide Credentials When Asked
- **Account Number**: `12345678`
- **Sort Code**: `112233`

## 📊 Expected Results

### ✅ Success Indicators
1. Triage calls `transfer_to_idv` (you'll see tool icon)
2. UI switches to IDV agent (no `return_to_triage` call)
3. IDV asks for account and sort code
4. IDV verifies credentials successfully
5. UI automatically switches to Banking agent
6. Banking returns your balance

### ❌ Failure Indicators
- Triage calls `return_to_triage` immediately after `transfer_to_idv`
- Multiple handoff tools called in same turn
- Session doesn't switch to IDV agent
- IDV doesn't ask for credentials

## 🔍 Monitor Logs (Optional)

### Gateway Logs
```bash
docker logs -f voice_s2s-gateway-1 | grep -E "(INTERCEPTED|HANDOFF|Found target)"
```

**Look for:**
```
[Gateway] 🔄 INTERCEPTED HANDOFF: transfer_to_idv
[Gateway] ✅ Found target agent: idv
[Gateway] ✅ Handoff complete: transfer_to_idv → idv
```

### Agent Logs
```bash
# Triage
docker logs -f voice_s2s-agent-triage-1 | grep -E "(Executing tool|Handoff)"

# IDV
docker logs -f voice_s2s-agent-idv-1 | grep -E "(session_init|IDV)"

# Banking
docker logs -f voice_s2s-agent-banking-1 | grep -E "(session_init|balance)"
```

## 🐛 If It Fails

### Check Gateway Logs
```bash
docker logs --tail 50 voice_s2s-gateway-1
```

### Check Agent Logs
```bash
docker logs --tail 30 voice_s2s-agent-triage-1
docker logs --tail 30 voice_s2s-agent-idv-1
```

### Restart Services
```bash
docker restart voice_s2s-gateway-1 voice_s2s-agent-triage-1 voice_s2s-agent-idv-1 voice_s2s-agent-banking-1
```

## 📝 Report Results

After testing, please report:
1. ✅ or ❌ - Did the handoff work?
2. Which step failed (if any)?
3. Any error messages in UI or logs?
4. Screenshot of the conversation (optional)

## 🎯 What Was Fixed

1. **Gateway now intercepts handoffs immediately** (no delay)
2. **Tool results are forwarded to UI** (you'll see the tool execution)
3. **Agents stop processing after handoff** (no duplicate tool calls)
4. **Verified State Gate works** (IDV → Banking automatic)

Ready to test! 🚀
