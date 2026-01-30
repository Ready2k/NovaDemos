# Connect Flow - Complete Implementation

## Overview

The system now supports **workflow selection** when connecting, allowing users to choose which persona/agent they want to interact with before starting a conversation.

---

## How It Works Now

### Before (Hardcoded Triage)

```
User clicks "Connect"
    ↓
Gateway (hardcoded)
    ↓
Triage Agent (always)
    ↓
Triage Workflow
    ↓
Nova Sonic
```

### After (User-Selected Workflow)

```
User selects "Banking Disputes Agent" from dropdown
    ↓
User clicks "Connect"
    ↓
Frontend sends: { type: 'select_workflow', workflowId: 'persona-BankingDisputes' }
    ↓
Gateway routes to selected agent
    ↓
Banking Disputes Agent
    ↓
Disputes Workflow
    ↓
Nova Sonic (with Banking Disputes persona)
```

---

## User Experience

### 1. Disconnected State
- Workflow selector dropdown appears above command bar
- Shows all available personas (Triage, Banking, Mortgage, Disputes)
- User selects desired workflow
- User clicks Connect button

### 2. Connecting State
- Dropdown disappears
- WebSocket opens
- Frontend sends workflow selection to Gateway
- Gateway routes to selected agent

### 3. Connected State
- Agent loads selected persona configuration
- Agent uses correct voice, prompt, tools, workflows
- Conversation starts with persona-specific greeting
- Dropdown remains hidden during conversation

### 4. Disconnected Again
- Dropdown reappears
- User can select different workflow for next session

---

## Technical Implementation

### Frontend Changes

**`frontend-v2/app/page.tsx`**
- Added `selectedWorkflow` state (defaults to 'triage')
- Added `availableWorkflows` state (loaded from `/api/personas`)
- Loads workflows on mount
- Passes workflow props to CommandBar

**`frontend-v2/components/chat/CommandBar.tsx`**
- Added workflow selector dropdown
- Only visible when disconnected
- Shows persona names from API
- Calls `onWorkflowChange` when selection changes

**`frontend-v2/lib/hooks/useWebSocket.ts`**
- Added `workflowId` parameter
- Sends `select_workflow` message on connection
- Passes workflow ID to Gateway

### Backend Changes

**`gateway/src/server.ts`**
- Removed hardcoded triage routing
- Added `selectedWorkflowId` variable (defaults to 'triage')
- Added `sessionInitialized` flag
- Handles `select_workflow` message type
- Routes to selected agent based on workflow ID
- Auto-initializes with default if no selection made

---

## Configuration Files

### Persona Configs (`backend/personas/*.json`)

Each persona defines:
- `id` - Unique identifier (used for routing)
- `name` - Display name (shown in dropdown)
- `description` - What the persona does
- `promptFile` - Path to prompt file
- `workflows` - Linked workflow IDs
- `allowedTools` - Tools the persona can use
- `voiceId` - Nova Sonic voice ID
- `metadata` - Additional configuration

Example:
```json
{
  "id": "persona-BankingDisputes",
  "name": "Banking Disputes Agent",
  "description": "Handles disputes, fraud, and unauthorized transactions",
  "promptFile": "persona-BankingDisputes.txt",
  "workflows": ["disputes"],
  "allowedTools": ["check_balance", "create_dispute", "check_fraud"],
  "voiceId": "matthew",
  "metadata": {
    "language": "en-US",
    "region": "UK",
    "tone": "professional-empathetic"
  }
}
```

### Prompt Files (`backend/prompts/*.txt`)

Each persona has a detailed prompt file that defines:
- Role and responsibilities
- Greeting instructions
- Tone and style
- Constraints and rules
- Example interactions

Example: `backend/prompts/persona-triage.txt`
```
### TRIAGE AGENT - ROUTING SPECIALIST ###

You are the initial routing agent for Barclays Bank...

### GREETING ###
Say: "Hello, welcome to Barclays Bank. One moment while I check your account status..."

### ROUTING LOGIC ###
- If vulnerability marker > 5: Route to Specialist Agent
- If account frozen: Route to Security Team
- Otherwise: Proceed to main banking services
```

---

## Workflow Selection Flow

### 1. Frontend Loads Workflows

```typescript
// On mount
const response = await fetch('/api/personas');
const personas = await response.json();
setAvailableWorkflows(personas.map(p => ({
  id: p.id,
  name: p.name
})));
```

### 2. User Selects Workflow

```typescript
// Dropdown change
<select value={selectedWorkflow} onChange={e => setSelectedWorkflow(e.target.value)}>
  <option value="triage">Triage Agent</option>
  <option value="persona-BankingDisputes">Banking Disputes Agent</option>
  <option value="persona-mortgage">Mortgage Agent</option>
</select>
```

### 3. User Connects

```typescript
// WebSocket opens
const ws = new WebSocket('ws://localhost:8080/sonic');

// On open, send workflow selection
ws.send(JSON.stringify({
  type: 'select_workflow',
  workflowId: selectedWorkflow
}));
```

### 4. Gateway Routes to Agent

```typescript
// Gateway receives workflow selection
if (message.type === 'select_workflow') {
  selectedWorkflowId = message.workflowId || 'triage';
  
  // Create session with selected workflow
  const session = await router.createSession(sessionId, selectedWorkflowId);
  const agent = await router.routeToAgent(sessionId);
  
  // Connect to agent
  await connectToAgent(agent);
}
```

### 5. Agent Loads Persona

```typescript
// Agent loads persona configuration
const persona = await personaLoader.loadPersona(workflowId);

// Combine persona prompt + workflow instructions
const systemPrompt = `
${persona.promptContent}

${workflowInstructions}
`;

// Initialize Nova Sonic with persona config
await novaSonic.initialize({
  voiceId: persona.voiceId,
  systemPrompt: systemPrompt,
  tools: persona.allowedTools
});
```

---

## Benefits

### For Users
✅ **Choice** - Select the experience they need
✅ **Direct Access** - No need to go through triage for known issues
✅ **Clarity** - See available options before connecting
✅ **Flexibility** - Try different personas easily

### For Developers
✅ **Testability** - Directly test specific personas
✅ **Maintainability** - Persona configs separate from code
✅ **Extensibility** - Easy to add new personas
✅ **Debugging** - Clear routing logs

### For Business
✅ **Analytics** - Track which workflows are used
✅ **Optimization** - Identify popular paths
✅ **Customization** - Different experiences for different needs
✅ **Scalability** - Add new personas without code changes

---

## What's Still Missing

### Multi-Agent Journeys

The current implementation supports **single-agent workflows** but NOT **multi-agent journeys**.

**What you CAN do:**
- Select "Banking Disputes Agent" → Talk to Banking Disputes Agent
- Select "Triage Agent" → Talk to Triage Agent
- Select "Mortgage Agent" → Talk to Mortgage Agent

**What you CANNOT do yet:**
- Start with Triage → Automatically handoff to Banking → Then to Resolution → Then to Survey
- Chain multiple agents in a predefined journey
- Automatic routing based on workflow outcomes

### To Implement Multi-Agent Journeys

You would need:

1. **Journey Configuration Files**
```json
{
  "id": "complaints-journey",
  "name": "Complaints Journey",
  "steps": [
    { "id": "triage", "agentId": "triage", "handoffRules": [...] },
    { "id": "complaints", "agentId": "banking", "handoffRules": [...] },
    { "id": "resolution", "agentId": "resolution", "handoffRules": [...] }
  ]
}
```

2. **JourneyRouter Class**
```typescript
class JourneyRouter {
  async startJourney(journeyId: string, sessionId: string)
  async handleHandoff(sessionId: string, outcome: string)
}
```

3. **Handoff Detection**
- Detect workflow outcomes (PROCEED, HANDOFF, COMPLETE)
- Route to next agent based on outcome
- Maintain journey state in Redis

4. **Frontend Journey Selector**
- Replace workflow dropdown with journey dropdown
- Show journey steps/progress
- Display current agent in journey

See `JOURNEY_CONFIGURATION_EXPLAINED.md` for detailed implementation guide.

---

## Testing

See `TEST_WORKFLOW_SELECTION.md` for complete testing guide.

Quick test:
1. Start services: `./start-all-services.sh`
2. Open `http://localhost:3000`
3. Select "Banking Disputes Agent" from dropdown
4. Click Connect
5. Verify agent uses banking disputes persona

---

## Troubleshooting

### Dropdown doesn't show
- Check `/api/personas` returns data
- Check browser console for errors
- Verify personas exist in `backend/personas/`

### Selection doesn't work
- Check WebSocket connection
- Check Gateway logs for `select_workflow` message
- Verify agent is registered for selected workflow

### Agent uses wrong persona
- Check agent logs for persona loading
- Verify prompt file exists
- Check persona config `promptFile` field

---

## Next Steps

### Immediate
1. ✅ Test workflow selection with all personas
2. ✅ Verify each persona loads correctly
3. ✅ Document for users

### Short-term
1. Add workflow descriptions to dropdown
2. Add workflow icons/avatars
3. Remember last selected workflow
4. Add analytics tracking

### Long-term
1. Implement multi-agent journey system
2. Add journey configuration files
3. Implement handoff detection
4. Add journey state tracking
5. Create journey selector UI

---

## Summary

Users can now select which persona/workflow they want to connect to before starting a conversation. The system routes them directly to the selected agent, which loads the correct persona configuration (prompt, voice, tools, workflows). This provides better user control and enables direct access to specific experiences.

The implementation is backward compatible (defaults to triage) and sets the foundation for future multi-agent journey support.

**Key Files:**
- `frontend-v2/app/page.tsx` - Workflow selection state
- `frontend-v2/components/chat/CommandBar.tsx` - Workflow selector UI
- `frontend-v2/lib/hooks/useWebSocket.ts` - Workflow ID parameter
- `gateway/src/server.ts` - Dynamic routing logic
- `backend/personas/*.json` - Persona configurations
- `backend/prompts/*.txt` - Persona prompts

**Documentation:**
- `WORKFLOW_SELECTION_IMPLEMENTED.md` - Implementation details
- `TEST_WORKFLOW_SELECTION.md` - Testing guide
- `JOURNEY_CONFIGURATION_EXPLAINED.md` - Multi-agent journey design
- `CONNECT_FLOW_COMPLETE.md` - This file
