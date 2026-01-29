# Test Workflow Selection - Quick Guide

## What to Test

The workflow selection feature allows users to choose which persona/agent they want to connect to before starting a conversation.

---

## Prerequisites

1. All services running: `./start-all-services.sh`
2. Frontend accessible at: `http://localhost:3000`
3. Gateway running on port 8080
4. At least one agent running (check with `curl http://localhost:8080/health`)

---

## Test Steps

### Test 1: Verify Workflow Dropdown Appears

1. Open `http://localhost:3000`
2. **Expected:** You should see a workflow selector dropdown above the command bar
3. **Expected:** Dropdown should show all available personas:
   - Triage Agent
   - Banking Disputes Agent
   - Simple Banking Agent
   - Mortgage Agent

### Test 2: Select Different Workflows

1. **Select "Triage Agent"** from dropdown
2. Click **Connect** button (power icon)
3. **Expected:** Agent greets you with triage-specific prompt
4. **Expected:** Agent checks account status and routes appropriately
5. Disconnect

6. **Select "Banking Disputes Agent"** from dropdown
7. Click **Connect** button
8. **Expected:** Agent greets you with banking disputes prompt
9. **Expected:** Agent has access to banking tools
10. Disconnect

### Test 3: Verify Default Behavior (Backward Compatibility)

1. Refresh page
2. **Don't change** the dropdown (should default to "Triage Agent")
3. Click **Connect**
4. **Expected:** Connects to triage agent (same as before)

### Test 4: Verify Dropdown Hides When Connected

1. Select any workflow
2. Click **Connect**
3. **Expected:** Dropdown disappears (only visible when disconnected)
4. Disconnect
5. **Expected:** Dropdown reappears

---

## What to Check in Logs

### Frontend Console (Browser DevTools)

```
[App] Loaded 4 workflows
[WebSocket] Connecting to ws://localhost:8080/sonic
[WebSocket] Connected
[WebSocket] Sending workflow selection: persona-BankingDisputes
```

### Gateway Logs (Terminal)

```
[Gateway] New WebSocket connection: abc-123-def
[Gateway] Sent 'connected' confirmation to frontend
[Gateway] Workflow selected: persona-BankingDisputes
[Gateway] Routing session abc-123-def to agent: persona-BankingDisputes
[Gateway] Connected to agent: persona-BankingDisputes
```

### Agent Logs (Terminal)

```
[Agent] Session initialized: abc-123-def
[Agent] Loaded persona: Banking Disputes Agent
[Agent] Using voice: matthew
[Agent] Loaded prompt from: backend/prompts/persona-BankingDisputes.txt
[Agent] Loaded workflow: disputes
```

---

## Expected Behavior by Persona

### Triage Agent
- **Voice:** Matthew (US Male)
- **Greeting:** "Hello, welcome to Barclays Bank. One moment while I check your account status..."
- **Behavior:** Checks vulnerability markers and routes to appropriate team
- **Tools:** None (routing only)

### Banking Disputes Agent
- **Voice:** Matthew (US Male)
- **Greeting:** Banking-specific greeting
- **Behavior:** Handles disputes, fraud, unauthorized transactions
- **Tools:** Banking tools (check balance, create dispute, etc.)

### Simple Banking Agent
- **Voice:** Matthew (US Male)
- **Greeting:** Simple banking greeting
- **Behavior:** Basic banking operations
- **Tools:** Basic banking tools

### Mortgage Agent
- **Voice:** Matthew (US Male)
- **Greeting:** Mortgage-specific greeting
- **Behavior:** Mortgage inquiries and applications
- **Tools:** Mortgage-specific tools

---

## Troubleshooting

### Dropdown doesn't appear
- Check that personas are loaded: `curl http://localhost:8080/api/personas`
- Check browser console for errors
- Verify frontend is running: `http://localhost:3000`

### Dropdown shows but selection doesn't work
- Check browser console for WebSocket errors
- Verify Gateway is running: `curl http://localhost:8080/health`
- Check Gateway logs for workflow selection messages

### Agent doesn't use selected persona
- Check agent logs for persona loading
- Verify persona config exists: `ls backend/personas/`
- Verify prompt file exists: `ls backend/prompts/`
- Check that agent registered with correct capabilities

### Connection fails after selecting workflow
- Check that agent is running for selected workflow
- Verify agent registered: `curl http://localhost:8080/api/agents`
- Check Gateway logs for routing errors
- Verify Redis is running: `redis-cli ping`

---

## Success Criteria

✅ Dropdown appears when disconnected
✅ Dropdown shows all available personas
✅ Selecting a workflow and connecting routes to correct agent
✅ Agent uses correct persona configuration (voice, prompt, tools)
✅ Dropdown hides when connected
✅ Dropdown reappears when disconnected
✅ Default behavior (triage) still works
✅ No console errors or warnings

---

## Known Limitations

### Current Implementation
- ❌ No multi-agent journeys (can't chain agents)
- ❌ No handoff between agents during conversation
- ❌ Can only select workflow before connecting (not during)
- ❌ No workflow descriptions in dropdown (only names)

### Future Enhancements
- Add workflow descriptions/tooltips
- Add workflow icons/avatars
- Remember last selected workflow
- Add "Recommended" badges
- Implement multi-agent journeys
- Allow workflow switching during conversation

---

## Quick Test Commands

```bash
# Check Gateway health
curl http://localhost:8080/health

# List available personas
curl http://localhost:8080/api/personas | jq

# List registered agents
curl http://localhost:8080/api/agents | jq

# Check Redis connection
redis-cli ping

# View Gateway logs
docker logs gateway -f

# View Agent logs
docker logs agent-s2s -f
```

---

## Next Steps After Testing

1. If tests pass → Document for users
2. If tests fail → Check troubleshooting section
3. Consider adding workflow descriptions
4. Plan multi-agent journey implementation
5. Add analytics/tracking for workflow selection

---

## Questions to Answer During Testing

1. Does the dropdown show all personas correctly?
2. Does selecting a workflow route to the correct agent?
3. Does the agent use the correct persona configuration?
4. Does the UI feel intuitive?
5. Are there any console errors?
6. Do the logs show correct workflow selection?
7. Does backward compatibility work (default to triage)?
8. Does the dropdown hide/show at the right times?

---

## Report Issues

If you find issues during testing, note:
- Which workflow was selected
- What happened vs what was expected
- Browser console errors
- Gateway log errors
- Agent log errors
- Steps to reproduce

This will help debug and fix any issues quickly.
