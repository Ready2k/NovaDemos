# Journey Configuration - How It Works & What's Missing

## Your Questions

### Q1: "When I hit Connect, how do I select the experience?"
**Answer:** Currently, you **can't**. The system always connects to the "triage" agent by default.

### Q2: "How do I configure a Complaints journey (Triage → Complaints → Resolution → Survey)?"
**Answer:** This **isn't implemented yet**. The current system only supports single-agent workflows, not multi-agent journeys.

### Q3: "Triage has zero System Prompt - how does the LLM know what to say?"
**Answer:** It uses the **workflow instructions** converted to text, but you're right - it's missing the detailed persona prompt.

---

## Current System (What Happens Now)

### When You Click "Connect"

1. **Frontend:** Opens WebSocket to `ws://localhost:8080/sonic`
2. **Gateway:** Receives connection, generates sessionId
3. **Gateway:** Routes to "triage" agent (hardcoded)
4. **Agent:** Loads triage workflow
5. **Agent:** Converts workflow to text instructions
6. **Agent:** Sends to Nova Sonic
7. **Nova Sonic:** Starts conversation

### Problems

❌ **No workflow selection** - Always uses "triage"
❌ **No persona prompt** - Triage has `promptFile: null`
❌ **No multi-agent journeys** - Can't chain agents
❌ **No handoff logic** - Can't transfer between agents
❌ **Hardcoded routing** - Gateway always routes to triage

---

## What's Missing: Journey Configuration

### Concept: Journey vs Workflow vs Persona

**Persona:**
- Configuration (voice, tools, prompt)
- Example: "Banking Disputes Agent"

**Workflow:**
- Single-agent logic (nodes, edges, decisions)
- Example: "Banking workflow" (check auth → show balance → handle dispute)

**Journey:** ⚠️ **NOT IMPLEMENTED**
- Multi-agent experience
- Example: "Complaints Journey" (Triage → Complaints → Resolution → Survey)
- Includes handoff logic between agents

### Current Architecture

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

### What You Want

```
User selects "Complaints Journey"
    ↓
Gateway routes to first agent
    ↓
Triage Agent
    ↓ (handoff based on workflow outcome)
Complaints Agent
    ↓ (handoff based on workflow outcome)
Resolution Agent
    ↓ (handoff based on workflow outcome)
Survey Agent
    ↓
End
```

---

## Solution 1: Add Workflow Selection (Quick Fix)

### Add Workflow Dropdown to Connect Button

**Frontend Changes:**

```typescript
// Add workflow selector
const [selectedWorkflow, setSelectedWorkflow] = useState('triage');

// Update connect to send workflow
const connect = () => {
  ws.send(JSON.stringify({
    type: 'connect',
    workflow: selectedWorkflow  // 'triage', 'banking', 'mortgage', etc.
  }));
};
```

**Gateway Changes:**

```typescript
// Route based on workflow
case 'connect':
  const workflow = message.workflow || 'triage';
  const agent = await agentRegistry.findAgentByCapability(`persona-${workflow}`);
  // Connect to that agent
```

**Benefits:**
- ✅ User can choose workflow
- ✅ Simple to implement
- ✅ Works with existing system

**Limitations:**
- ❌ Still single-agent only
- ❌ No multi-agent journeys
- ❌ No handoffs

---

## Solution 2: Implement Multi-Agent Journeys (Proper Fix)

### Create Journey Configuration Files

**New File:** `backend/journeys/journey-complaints.json`

```json
{
  "id": "complaints-journey",
  "name": "Complaints Journey",
  "description": "Full complaints handling from triage to resolution",
  "steps": [
    {
      "id": "triage",
      "agentId": "triage",
      "workflowId": "triage",
      "handoffRules": [
        {
          "outcome": "PROCEED",
          "nextStep": "complaints"
        },
        {
          "outcome": "VULNERABILITY_HANDOFF",
          "nextStep": "specialist"
        }
      ]
    },
    {
      "id": "complaints",
      "agentId": "banking",
      "workflowId": "disputes",
      "handoffRules": [
        {
          "outcome": "DISPUTE_CREATED",
          "nextStep": "resolution"
        },
        {
          "outcome": "FRAUD_HANDOFF",
          "nextStep": "fraud"
        }
      ]
    },
    {
      "id": "resolution",
      "agentId": "resolution",
      "workflowId": "resolution",
      "handoffRules": [
        {
          "outcome": "RESOLVED",
          "nextStep": "survey"
        }
      ]
    },
    {
      "id": "survey",
      "agentId": "survey",
      "workflowId": "survey",
      "handoffRules": []
    }
  ],
  "initialStep": "triage"
}
```

### Gateway Journey Router

```typescript
class JourneyRouter {
  async startJourney(journeyId: string, sessionId: string) {
    const journey = loadJourney(journeyId);
    const currentStep = journey.steps.find(s => s.id === journey.initialStep);
    
    // Store journey state in Redis
    await redis.set(`journey:${sessionId}`, JSON.stringify({
      journeyId,
      currentStepId: currentStep.id,
      history: []
    }));
    
    // Route to first agent
    return await routeToAgent(currentStep.agentId);
  }
  
  async handleHandoff(sessionId: string, outcome: string) {
    const journeyState = await redis.get(`journey:${sessionId}`);
    const journey = loadJourney(journeyState.journeyId);
    const currentStep = journey.steps.find(s => s.id === journeyState.currentStepId);
    
    // Find next step based on outcome
    const handoffRule = currentStep.handoffRules.find(r => r.outcome === outcome);
    if (!handoffRule) {
      // End of journey
      return null;
    }
    
    const nextStep = journey.steps.find(s => s.id === handoffRule.nextStep);
    
    // Update journey state
    journeyState.currentStepId = nextStep.id;
    journeyState.history.push(currentStep.id);
    await redis.set(`journey:${sessionId}`, JSON.stringify(journeyState));
    
    // Route to next agent
    return await routeToAgent(nextStep.agentId);
  }
}
```

### Frontend Journey Selector

```typescript
// Journey dropdown
<select value={selectedJourney} onChange={e => setSelectedJourney(e.target.value)}>
  <option value="complaints-journey">Complaints Journey</option>
  <option value="banking-journey">Banking Journey</option>
  <option value="mortgage-journey">Mortgage Journey</option>
</select>

// Connect with journey
const connect = () => {
  ws.send(JSON.stringify({
    type: 'connect',
    journey: selectedJourney
  }));
};
```

**Benefits:**
- ✅ Multi-agent journeys
- ✅ Automatic handoffs
- ✅ Configurable routing
- ✅ Journey state tracking
- ✅ User selects experience

---

## Solution 3: Fix Triage Persona Prompt

### Problem

Triage persona has:
```json
{
  "promptFile": null,
  "allowedTools": []
}
```

So the agent only gets workflow instructions, which are basic:
```
Node: triage_start - Start Triage Protocol
Node: check_vuln - Check Memory: Is 'marker_Vunl' > 5?
...
```

### Solution

Create a proper triage prompt:

**File:** `backend/prompts/persona-triage.txt`

```
### TRIAGE AGENT ###

You are the initial routing agent for Barclays Bank. Your role is to:
1. Greet the customer professionally
2. Assess their account status and vulnerability markers
3. Route them to the appropriate specialist

### GREETING ###
Say: "Hello, welcome to Barclays Bank. I'm here to help route your call to the right team. One moment while I check your account status."

### ROUTING LOGIC ###
- If vulnerability marker > 5: Route to Specialist Agent
- If account status is FROZEN: Route to Security Team
- Otherwise: Proceed to main banking services

### TONE ###
- Professional and efficient
- Brief and to the point
- No unnecessary conversation
- Focus on routing, not problem-solving

### CONSTRAINTS ###
- Do NOT attempt to solve customer issues
- Do NOT ask for account details (already have them)
- Do NOT engage in extended conversation
- Your ONLY job is to route correctly
```

**Update persona config:**

```json
{
  "id": "triage",
  "name": "Triage Agent",
  "promptFile": "persona-triage.txt",  // ← Add this
  "allowedTools": [],
  "voiceId": "matthew"
}
```

---

## Recommended Implementation Order

### Phase 1: Fix Triage Prompt (15 min)
1. Create `backend/prompts/persona-triage.txt`
2. Update `backend/personas/triage.json` to reference it
3. Restart agent
4. Test that triage now has proper instructions

### Phase 2: Add Workflow Selection (1 hour)
1. Add workflow dropdown to frontend
2. Update connect to send workflow ID
3. Update Gateway to route based on workflow
4. Test selecting different workflows

### Phase 3: Implement Journeys (4-6 hours)
1. Create journey configuration schema
2. Create journey files
3. Implement JourneyRouter in Gateway
4. Add handoff detection in agents
5. Update frontend with journey selector
6. Test multi-agent journeys

---

## Quick Answer to Your Questions

### "How do I select the experience when I hit Connect?"

**Current:** You can't - it always uses triage

**Quick Fix:** Add workflow dropdown:
```typescript
<select value={workflow} onChange={e => setWorkflow(e.target.value)}>
  <option value="triage">Triage</option>
  <option value="banking">Banking</option>
  <option value="mortgage">Mortgage</option>
</select>
```

### "How do I configure Triage → Complaints → Resolution → Survey?"

**Current:** Not possible - single-agent only

**Proper Fix:** Implement Journey system (Solution 2 above)

### "Triage has zero System Prompt - how does LLM know what to say?"

**Current:** It only gets workflow instructions (nodes/edges converted to text)

**Fix:** Create `persona-triage.txt` with proper instructions

---

## What to Do Next

### Option A: Quick Fixes (Recommended for now)

1. **Fix Triage Prompt** (do this now)
   - Create proper triage prompt file
   - Update persona config
   - Restart agent

2. **Add Workflow Selection** (do this next)
   - Add dropdown to UI
   - Update connect logic
   - Test different workflows

### Option B: Full Journey System (Later)

1. Design journey configuration schema
2. Implement JourneyRouter
3. Add handoff detection
4. Create journey files
5. Update UI with journey selector

---

## Summary

**Current State:**
- ❌ No workflow selection (always triage)
- ❌ No multi-agent journeys
- ❌ Triage has no prompt (only workflow instructions)
- ❌ No handoff logic

**Quick Fixes:**
1. ✅ Create triage prompt file
2. ✅ Add workflow dropdown
3. ✅ Update routing logic

**Proper Solution:**
- Implement Journey configuration system
- Multi-agent handoffs
- Journey state tracking
- User selects complete experience

**Immediate Action:**
Create `backend/prompts/persona-triage.txt` with proper instructions so the LLM knows what to say!
