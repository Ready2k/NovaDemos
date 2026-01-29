# Your Questions - Answered

## Question 1: "When I hit Connect, how do I select the experience?"

### Answer: Use the Workflow Selector Dropdown

**Before (What you saw):**
- Click Connect → Always goes to Triage
- No way to choose

**Now (What you have):**
1. **Workflow dropdown appears** when disconnected
2. **Select your desired experience:**
   - Triage Agent (default)
   - Banking Disputes Agent
   - Simple Banking Agent
   - Mortgage Agent
3. **Click Connect** → Routes to selected agent
4. **Agent loads correct persona** → Uses right voice, prompt, tools

### Visual Flow

```
┌─────────────────────────────────────┐
│  Select Experience:                 │
│  ┌───────────────────────────────┐  │
│  │ Banking Disputes Agent      ▼ │  │  ← Dropdown appears when disconnected
│  └───────────────────────────────┘  │
│                                     │
│  [Connect Button]                   │  ← Click to connect
└─────────────────────────────────────┘
```

---

## Question 2: "If I want a Complaints journey (Triage → Complaints → Resolution → Survey), how do I configure it?"

### Answer: This Requires Multi-Agent Journeys (Not Yet Implemented)

**Current System:**
- ✅ Can select **single agent** (Triage OR Banking OR Mortgage)
- ❌ Cannot chain **multiple agents** (Triage → Banking → Resolution)

**What You Need:**
A **Journey Configuration System** that defines:
1. Which agents to use in sequence
2. When to handoff between agents
3. What triggers each transition

### Example Journey Configuration

**File: `backend/journeys/complaints-journey.json`**

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
          "condition": "intent == 'complaint'",
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

### How It Would Work

```
User selects "Complaints Journey"
    ↓
Gateway starts journey at "triage" step
    ↓
Triage Agent: "Hello, I see you have a complaint..."
    ↓
Triage completes with outcome: "PROCEED"
    ↓
Gateway detects handoff rule: PROCEED → complaints
    ↓
Gateway routes to Banking Agent (complaints step)
    ↓
Banking Agent: "I'll help you with your complaint..."
    ↓
Banking creates dispute, outcome: "DISPUTE_CREATED"
    ↓
Gateway detects handoff rule: DISPUTE_CREATED → resolution
    ↓
Gateway routes to Resolution Agent
    ↓
Resolution Agent: "Let me review your dispute..."
    ↓
Resolution completes, outcome: "RESOLVED"
    ↓
Gateway detects handoff rule: RESOLVED → survey
    ↓
Gateway routes to Survey Agent
    ↓
Survey Agent: "How was your experience today?"
    ↓
Journey complete
```

### Implementation Required

**1. Journey Configuration Files**
- Create `backend/journeys/` directory
- Define journey JSON files
- Specify agent sequences and handoff rules

**2. JourneyRouter Class (Gateway)**
```typescript
class JourneyRouter {
  async startJourney(journeyId: string, sessionId: string) {
    // Load journey config
    // Route to first agent
    // Store journey state in Redis
  }
  
  async handleHandoff(sessionId: string, outcome: string) {
    // Get current journey state
    // Find next step based on outcome
    // Route to next agent
    // Update journey state
  }
}
```

**3. Handoff Detection (Agent)**
```typescript
// Agent detects workflow completion
if (workflowComplete) {
  const outcome = determineOutcome(); // "PROCEED", "HANDOFF", etc.
  
  // Send handoff request to Gateway
  ws.send(JSON.stringify({
    type: 'handoff_request',
    outcome: outcome,
    reason: 'Workflow completed'
  }));
}
```

**4. Frontend Journey Selector**
```typescript
// Replace workflow dropdown with journey dropdown
<select value={selectedJourney}>
  <option value="complaints-journey">Complaints Journey</option>
  <option value="banking-journey">Banking Journey</option>
  <option value="mortgage-journey">Mortgage Journey</option>
</select>

// Show journey progress
<div>
  Step 1: Triage ✓
  Step 2: Complaints (current)
  Step 3: Resolution
  Step 4: Survey
</div>
```

### Current Workaround

**Option 1: Configure Triage to Route**
Update triage persona prompt to automatically route to complaints:

```
### ROUTING LOGIC ###
If customer says "complaint" or "dispute":
- Say: "I understand you have a complaint. Let me connect you to our Complaints team."
- Route to: Banking Disputes Agent
```

**Option 2: Manual Selection**
1. Start with Triage Agent
2. Disconnect when triage complete
3. Select Banking Disputes Agent
4. Connect again
5. Continue conversation

**Option 3: Single Agent Handles All**
Create a "Complaints Handler" persona that:
- Does triage
- Handles complaint
- Resolves issue
- Collects feedback
All in one agent (no handoffs needed)

---

## Question 3: "Triage has zero System Prompt - how does the LLM know what to say and do?"

### Answer: Triage NOW Has a System Prompt

**Before (What you saw):**
```json
{
  "id": "triage",
  "promptFile": null,  ← No prompt!
  "allowedTools": []
}
```

The agent only got workflow instructions:
```
Node: triage_start - Start Triage Protocol
Node: check_vuln - Check Memory: Is 'marker_Vunl' > 5?
Edge: triage_start -> check_vuln
...
```

**Now (What you have):**
```json
{
  "id": "triage",
  "promptFile": "persona-triage.txt",  ← Has prompt!
  "allowedTools": []
}
```

**File: `backend/prompts/persona-triage.txt`**
```
### TRIAGE AGENT - ROUTING SPECIALIST ###

You are the initial routing agent for Barclays Bank. Your role is to quickly assess the customer's account status and route them to the appropriate team.

### YOUR JOB ###
1. Greet the customer briefly
2. Check their account status (vulnerability markers, account status)
3. Route them to the correct specialist
4. DO NOT attempt to solve their problem - just route

### GREETING ###
Say: "Hello, welcome to Barclays Bank. One moment while I check your account status and connect you to the right team."

### ROUTING LOGIC ###

**High Vulnerability (marker_Vunl > 5):**
- Say: "I can see you have a priority account marker. I'm connecting you to a Specialist Agent who can best assist you right now."
- Route to: Specialist Agent

**Account Frozen:**
- Say: "I see your account is currently frozen. I need to transfer you to the Security Team to resolve this."
- Route to: Security Team

**Normal Account (Open & Low Risk):**
- Say: "Your account is in good standing. Connecting you to our banking services now."
- Route to: Banking Services

### TONE & STYLE ###
- Professional and efficient
- Brief - no unnecessary conversation
- Warm but focused on routing
- Do NOT engage in problem-solving
```

### How Agent Uses It

```typescript
// Agent loads persona
const persona = await personaLoader.loadPersona('triage');

// Combines persona prompt + workflow instructions
const systemPrompt = `
${persona.promptContent}  ← Triage prompt from file

--- WORKFLOW INSTRUCTIONS ---
${workflowInstructions}  ← Generated from workflow JSON
`;

// Sends to Nova Sonic
await novaSonic.initialize({
  systemPrompt: systemPrompt,
  voiceId: 'matthew'
});
```

### Result

Now the LLM knows:
- ✅ It's a triage agent
- ✅ Its job is to route, not solve
- ✅ How to greet customers
- ✅ What to say for each routing decision
- ✅ Tone and style to use
- ✅ Constraints and rules

**Before:** Generic workflow instructions only
**After:** Detailed persona prompt + workflow instructions

---

## Summary

### Question 1: How to select experience?
**Answer:** Use the workflow selector dropdown that appears when disconnected.

### Question 2: How to configure multi-agent journeys?
**Answer:** Not implemented yet. Requires journey configuration system. See implementation guide in `JOURNEY_CONFIGURATION_EXPLAINED.md`.

### Question 3: How does Triage know what to say?
**Answer:** Triage now has a detailed prompt file (`persona-triage.txt`) that defines its role, greeting, routing logic, tone, and constraints.

---

## What You Can Do Now

✅ **Select workflow before connecting** (dropdown appears when disconnected)
✅ **Connect directly to any persona** (Triage, Banking, Mortgage, Disputes)
✅ **Triage has proper instructions** (detailed prompt file)
✅ **Each persona has unique behavior** (voice, prompt, tools, workflows)

## What You Need to Implement

❌ **Multi-agent journeys** (Triage → Complaints → Resolution → Survey)
❌ **Automatic handoffs** (based on workflow outcomes)
❌ **Journey state tracking** (know where you are in journey)
❌ **Journey selector UI** (choose journey instead of single workflow)

---

## Next Steps

1. **Test current implementation:**
   - Try selecting different workflows
   - Verify each persona works correctly
   - Check that triage now has proper greeting

2. **If you need multi-agent journeys:**
   - Read `JOURNEY_CONFIGURATION_EXPLAINED.md`
   - Decide on journey configuration format
   - Implement JourneyRouter class
   - Add handoff detection to agents
   - Create journey configuration files
   - Update frontend with journey selector

3. **Or use workarounds:**
   - Configure triage to route based on intent
   - Use manual workflow switching
   - Create single-agent personas that handle full flows

---

## Files to Check

**Triage Persona Config:**
- `backend/personas/triage.json`

**Triage Prompt:**
- `backend/prompts/persona-triage.txt`

**Workflow Selector UI:**
- `frontend-v2/components/chat/CommandBar.tsx`

**Routing Logic:**
- `gateway/src/server.ts`

**Documentation:**
- `WORKFLOW_SELECTION_IMPLEMENTED.md` - What was built
- `TEST_WORKFLOW_SELECTION.md` - How to test
- `JOURNEY_CONFIGURATION_EXPLAINED.md` - Multi-agent journey design
- `CONNECT_FLOW_COMPLETE.md` - Complete system overview
- `YOUR_QUESTIONS_ANSWERED.md` - This file
