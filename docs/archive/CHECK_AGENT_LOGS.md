# Check Agent Logs - Quick Guide

## The agent crashed or isn't working. What do I check?

### Option 1: Check if agent is still running

```bash
ps aux | grep "node.*agent" | grep -v grep
```

**If running:** Agent didn't crash, might be a different issue
**If not running:** Agent crashed, check logs below

---

### Option 2: Restart agent and capture logs

```bash
# Kill existing agent
pkill -f "node dist/agent-runtime-s2s.js"

# Start with logging
cd agents
AGENT_ID=triage \
AGENT_PORT=8081 \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
AWS_REGION=${AWS_REGION} \
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
GATEWAY_URL=http://localhost:8080 \
node dist/agent-runtime-s2s.js 2>&1 | tee /tmp/agent-startup.log
```

**Watch for:**
- ✅ "Generated 5 handoff tools"
- ✅ "Handoff tools configured"
- ✅ "Registered with gateway"
- ❌ Any ERROR messages
- ❌ Process exits immediately

---

### Option 3: Use start-all-services.sh

```bash
# This handles everything
./start-all-services.sh

# Then check if agent registered
curl http://localhost:8080/api/agents | jq
```

**Expected:** Should see agent with ID "triage" in the list

---

## Common Error Messages

### Error: "Cannot find module './handoff-tools'"

**Cause:** TypeScript not compiled
**Fix:**
```bash
cd agents
npm run build
ls -la dist/handoff-tools.js  # Verify it exists
```

---

### Error: "AWS credentials not configured"

**Cause:** Missing AWS environment variables
**Fix:**
```bash
# Check if set
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY

# If empty, set them
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
```

---

### Error: "Workflow file not found"

**Cause:** Wrong path to workflow file
**Fix:**
```bash
# Verify file exists
ls -la backend/workflows/workflow_triage.json

# Use correct path
export WORKFLOW_FILE=../backend/workflows/workflow_triage.json
```

---

### Error: "Tool X missing toolSpec"

**Cause:** Tool format invalid
**Fix:** This shouldn't happen with the new code, but if it does:
```bash
# Check handoff-tools.ts format
cat agents/src/handoff-tools.ts | grep -A 10 "toolSpec"

# Rebuild
cd agents && npm run build
```

---

## What to look for in logs

### ✅ Good Signs

```
[Agent:triage] PersonaLoader initialized
[Agent:triage] Loaded workflow from ...
[Agent:triage] Loading persona: triage
[Agent:triage] ✅ Persona loaded: Triage Agent
[Agent:triage] Generated 5 handoff tools
[Agent:triage] Handoff tools configured: transfer_to_banking, transfer_to_idv, ...
[Agent:triage] Voice configured: matthew
[Agent:triage] Graph executor initialized
[Agent:triage] Registered with gateway
[Agent:triage] Server listening on port 8081
```

### ❌ Bad Signs

```
ERROR: AWS credentials not configured!
Error: Cannot find module './handoff-tools'
Workflow file not found
Failed to load persona
Failed to register with gateway
[SonicClient] ERROR: Tool X missing toolSpec
```

---

## Quick Diagnostic

Run this to get a quick status:

```bash
#!/bin/bash
echo "=== Agent Diagnostic ==="
echo ""
echo "1. Agent Process:"
ps aux | grep "node.*agent" | grep -v grep || echo "   ❌ Not running"
echo ""
echo "2. Compiled Files:"
ls -la agents/dist/handoff-tools.js 2>/dev/null && echo "   ✅ handoff-tools.js exists" || echo "   ❌ handoff-tools.js missing"
ls -la agents/dist/agent-runtime-s2s.js 2>/dev/null && echo "   ✅ agent-runtime-s2s.js exists" || echo "   ❌ agent-runtime-s2s.js missing"
echo ""
echo "3. Workflow File:"
ls -la backend/workflows/workflow_triage.json 2>/dev/null && echo "   ✅ workflow_triage.json exists" || echo "   ❌ workflow_triage.json missing"
echo ""
echo "4. AWS Credentials:"
[ -n "$AWS_ACCESS_KEY_ID" ] && echo "   ✅ AWS_ACCESS_KEY_ID set" || echo "   ❌ AWS_ACCESS_KEY_ID not set"
[ -n "$AWS_SECRET_ACCESS_KEY" ] && echo "   ✅ AWS_SECRET_ACCESS_KEY set" || echo "   ❌ AWS_SECRET_ACCESS_KEY not set"
echo ""
echo "5. Gateway:"
curl -s http://localhost:8080/health > /dev/null && echo "   ✅ Gateway responding" || echo "   ❌ Gateway not responding"
echo ""
echo "6. Registered Agents:"
curl -s http://localhost:8080/api/agents | jq -r '.[].id' 2>/dev/null || echo "   ❌ Cannot fetch agents"
```

Save this as `diagnostic.sh`, make it executable, and run it:

```bash
chmod +x diagnostic.sh
./diagnostic.sh
```

---

## Still Having Issues?

1. **Restart everything:**
   ```bash
   ./start-all-services.sh
   ```

2. **Check logs in real-time:**
   ```bash
   # Terminal 1: Gateway logs
   docker logs -f gateway 2>&1 | grep -E "Handoff|agent"
   
   # Terminal 2: Agent logs (if running locally)
   tail -f /tmp/agent-startup.log
   ```

3. **Test without handoffs:**
   - Select "Banking Agent" directly from dropdown
   - This bypasses triage and handoffs
   - If this works, issue is with handoff system
   - If this doesn't work, issue is more fundamental

---

## Report the Issue

If you need help, provide:

1. Output of diagnostic script above
2. Last 50 lines of agent logs
3. What you tried to do
4. What happened vs what you expected

```bash
# Capture everything
./diagnostic.sh > /tmp/diagnostic.txt
tail -50 /tmp/agent-startup.log >> /tmp/diagnostic.txt
echo "=== What I tried ===" >> /tmp/diagnostic.txt
echo "Selected Triage Agent and said 'check my balance'" >> /tmp/diagnostic.txt
echo "=== What happened ===" >> /tmp/diagnostic.txt
echo "Agent crashed / No response / Error message" >> /tmp/diagnostic.txt

# Share /tmp/diagnostic.txt
cat /tmp/diagnostic.txt
```
