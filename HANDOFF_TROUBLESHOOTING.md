# Handoff System Troubleshooting

## Issue: Agent Crashed on Startup

### Possible Causes

1. **Tool Format Issue** - Nova Sonic requires specific tool format
2. **Missing Dependencies** - handoff-tools module not found
3. **Configuration Error** - Workflow or persona config invalid
4. **AWS Credentials** - Missing or invalid AWS credentials

---

## Diagnostic Steps

### Step 1: Check Agent Process

```bash
# Check if agent is running
ps aux | grep "node.*agent" | grep -v grep

# If not running, check why
```

### Step 2: Check Build

```bash
# Rebuild agent
cd agents
npm run build

# Check for TypeScript errors
```

### Step 3: Check Handoff Tools Module

```bash
# Verify handoff-tools.ts was compiled
ls -la agents/dist/handoff-tools.js

# If missing, rebuild
cd agents && npm run build
```

### Step 4: Test Agent Startup

```bash
# Run test script
./test-agent-startup.sh

# Or manually start agent with logging
cd agents
AGENT_ID=triage \
AGENT_PORT=8081 \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
AWS_REGION=us-east-1 \
AWS_ACCESS_KEY_ID=your_key \
AWS_SECRET_ACCESS_KEY=your_secret \
GATEWAY_URL=http://localhost:8080 \
node dist/agent-runtime-s2s.js 2>&1 | tee /tmp/agent.log
```

### Step 5: Check Logs for Errors

```bash
# Look for specific errors
grep -i "error" /tmp/agent.log | grep -v "ERROR_LEVEL"
grep -i "handoff" /tmp/agent.log
grep -i "tools" /tmp/agent.log
```

---

## Common Issues & Fixes

### Issue 1: Module Not Found

**Error:**
```
Error: Cannot find module './handoff-tools'
```

**Fix:**
```bash
cd agents
npm run build
# Verify dist/handoff-tools.js exists
ls -la dist/handoff-tools.js
```

---

### Issue 2: Tool Format Invalid

**Error:**
```
[SonicClient] ERROR: Tool X missing toolSpec!
```

**Fix:**
Check that handoff tools have correct format:
```typescript
{
  toolSpec: {
    name: 'transfer_to_banking',
    description: '...',
    inputSchema: {
      json: '{"type":"object",...}'  // Must be STRING not object
    }
  }
}
```

---

### Issue 3: AWS Credentials Missing

**Error:**
```
ERROR: AWS credentials not configured!
```

**Fix:**
```bash
# Set AWS credentials
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1

# Or add to .env file
echo "AWS_ACCESS_KEY_ID=your_key" >> agents/.env
echo "AWS_SECRET_ACCESS_KEY=your_secret" >> agents/.env
```

---

### Issue 4: Workflow File Not Found

**Error:**
```
Workflow file not found: /app/workflow.json
```

**Fix:**
```bash
# Verify workflow file exists
ls -la backend/workflows/workflow_triage.json

# Set correct path
export WORKFLOW_FILE=../backend/workflows/workflow_triage.json
```

---

## Quick Fix: Restart with Clean State

```bash
# 1. Kill existing agent
pkill -f "node dist/agent-runtime-s2s.js"

# 2. Rebuild
cd agents
npm run build

# 3. Verify handoff-tools compiled
ls -la dist/handoff-tools.js

# 4. Restart services
cd ..
./start-all-services.sh
```

---

## Verify Handoff Tools Loaded

After starting agent, check logs for:

```
[Agent:triage] Generated 5 handoff tools
[Agent:triage] Handoff tools configured: transfer_to_banking, transfer_to_idv, transfer_to_mortgage, transfer_to_disputes, transfer_to_investigation
```

If you see these messages, handoff tools are loaded correctly.

---

## Test Handoff Without Voice

If voice testing is problematic, test handoff via text:

```bash
# Send text message to agent
curl -X POST http://localhost:8081/test \
  -H "Content-Type: application/json" \
  -d '{"text": "I need to check my balance"}'

# Check logs for handoff trigger
grep "HANDOFF TRIGGERED" /tmp/agent.log
```

---

## Rollback if Needed

If handoff system is causing issues, you can temporarily disable:

```typescript
// In agent-runtime-s2s.ts, comment out handoff tools:
// const handoffTools = generateHandoffTools();
const handoffTools: any[] = []; // Disable handoffs

// Rebuild
npm run build
```

---

## Get Help

If issues persist, provide:

1. **Error message** from logs
2. **Agent startup logs** (first 50 lines)
3. **Build output** from `npm run build`
4. **Workflow file** being used
5. **Environment variables** (without secrets)

Example:
```bash
# Capture diagnostic info
cd agents
npm run build > /tmp/build.log 2>&1
node dist/agent-runtime-s2s.js > /tmp/startup.log 2>&1 &
sleep 5
head -50 /tmp/startup.log
```
