# Restart Agent to Load New Triage Prompt

## Why Restart?

The triage persona configuration was updated to reference a new prompt file:
- **File:** `backend/prompts/persona-triage.txt`
- **Config:** `backend/personas/triage.json` now has `"promptFile": "persona-triage.txt"`

The agent loads persona configurations on startup, so it needs to be restarted to pick up the new prompt.

---

## Quick Restart

### Option 1: Use the Start Script (Recommended)

```bash
# This will restart all services including the agent
./start-all-services.sh
```

### Option 2: Restart Just the Agent

```bash
# Find the agent process
ps aux | grep "agent-runtime-s2s" | grep -v grep

# Kill the agent process (replace PID with actual process ID)
kill 45524

# Restart the agent
cd agents
npm run start:s2s
```

### Option 3: Docker (If Using Docker)

```bash
# Restart agent container
docker restart agent-s2s

# Or rebuild and restart
docker-compose up -d --build agent-s2s
```

---

## Verify Agent Loaded New Prompt

### Check Agent Logs

Look for these log messages on startup:

```
[Agent] Starting Agent Runtime (S2S)...
[Agent] Loading persona: triage
[Agent] Loaded persona config: backend/personas/triage.json
[Agent] Loading prompt file: backend/prompts/persona-triage.txt
[Agent] Prompt loaded successfully (1234 characters)
[Agent] Persona loaded: Triage Agent
```

### Test the Agent

1. Open frontend: `http://localhost:3000`
2. Select "Triage Agent" from dropdown
3. Click Connect
4. Listen to greeting

**Expected greeting:**
> "Hello, welcome to Barclays Bank. One moment while I check your account status and connect you to the right team."

**If you hear this, the new prompt is loaded! ✅**

**If you hear something generic or different, the agent didn't load the new prompt. ❌**

---

## Troubleshooting

### Agent won't start

```bash
# Check for errors
cd agents
npm run start:s2s

# Common issues:
# - Port already in use (kill old process)
# - Missing dependencies (run npm install)
# - AWS credentials not set (check .env)
```

### Agent starts but doesn't load prompt

```bash
# Verify files exist
ls -la backend/personas/triage.json
ls -la backend/prompts/persona-triage.txt

# Check file contents
cat backend/personas/triage.json | grep promptFile
# Should show: "promptFile": "persona-triage.txt"

# Check prompt file
head -20 backend/prompts/persona-triage.txt
# Should show: "### TRIAGE AGENT - ROUTING SPECIALIST ###"
```

### Agent loads prompt but doesn't use it

```bash
# Check agent logs for persona loading
# Look for: "[Agent] Loaded persona: Triage Agent"

# Check that agent registered with Gateway
curl http://localhost:8080/api/agents | jq

# Should show agent with capabilities including "triage"
```

---

## What Changed

### Before Restart

**Triage persona config:**
```json
{
  "promptFile": null  ← No prompt
}
```

**Agent behavior:**
- Only had workflow instructions
- Generic greeting
- No specific tone or style

### After Restart

**Triage persona config:**
```json
{
  "promptFile": "persona-triage.txt"  ← Has prompt
}
```

**Agent behavior:**
- Has detailed prompt instructions
- Specific greeting: "Hello, welcome to Barclays Bank..."
- Professional-efficient tone
- Clear routing logic
- Knows not to solve problems, just route

---

## Quick Test Checklist

After restarting:

1. ✅ Agent starts without errors
2. ✅ Agent logs show "Loaded persona: Triage Agent"
3. ✅ Agent logs show "Loading prompt file: persona-triage.txt"
4. ✅ Agent registers with Gateway
5. ✅ Frontend can connect to triage agent
6. ✅ Agent uses correct greeting
7. ✅ Agent follows routing logic from prompt

---

## Summary

**What to do:**
1. Restart the agent (use `./start-all-services.sh`)
2. Check logs for prompt loading
3. Test triage agent greeting
4. Verify routing behavior

**Expected result:**
Triage agent now has detailed instructions and uses proper greeting/routing logic instead of generic workflow instructions.

**Files involved:**
- `backend/personas/triage.json` - Updated to reference prompt file
- `backend/prompts/persona-triage.txt` - New detailed prompt
- `agents/src/persona-loader.ts` - Loads persona and prompt
- `agents/src/agent-runtime-s2s.ts` - Uses persona in system prompt
