# ❌ Voice Metadata NOT Carried Through

## Answer: NO

The voice metadata feature from the experimental branch has **NOT** been carried through to this codebase.

## What's Missing

### 1. Agent Registration - No Voice Metadata

**Current State:**
```typescript
// gateway/src/agent-registry.ts
export interface AgentInfo {
    id: string;
    url: string;
    status: 'healthy' | 'unhealthy' | 'starting';
    capabilities: string[];
    lastHeartbeat: number;
    port: number;
}
```

**What's Missing:**
- `voiceId?: string` - The voice to use for this agent
- `metadata?: Record<string, any>` - Additional agent metadata
- `personaConfig?: any` - Persona configuration from Langfuse

### 2. Workflow Files - No Voice Config

**Current State:**
Workflow JSON files have no voice configuration:
```json
{
  "id": "triage",
  "name": "Triage",
  "nodes": [...],
  "edges": [...]
}
```

**What's Missing:**
```json
{
  "id": "triage",
  "name": "Triage",
  "voiceId": "matthew",
  "metadata": {
    "voice": "matthew",
    "persona": "professional-banking",
    "language": "en-US"
  },
  "nodes": [...],
  "edges": [...]
}
```

### 3. Agent Registration - No Voice Sent

**Current State:**
```typescript
// agents/src/agent-runtime-s2s.ts
await axios.post(`${GATEWAY_URL}/api/agents/register`, {
    id: AGENT_ID,
    url: `http://${AGENT_HOST}:${AGENT_PORT}`,
    capabilities: workflowDef?.testConfig?.personaId ? [workflowDef.testConfig.personaId] : [],
    port: AGENT_PORT
});
```

**What's Missing:**
```typescript
await axios.post(`${GATEWAY_URL}/api/agents/register`, {
    id: AGENT_ID,
    url: `http://${AGENT_HOST}:${AGENT_PORT}`,
    capabilities: workflowDef?.testConfig?.personaId ? [workflowDef.testConfig.personaId] : [],
    port: AGENT_PORT,
    voiceId: workflowDef?.voiceId || 'matthew',
    metadata: workflowDef?.metadata || {}
});
```

### 4. Gateway API - No Agent Metadata Endpoint

**Current State:**
Gateway has no endpoint to expose agent metadata to the frontend.

**What's Missing:**
```typescript
// GET /api/agents - List all agents with metadata
app.get('/api/agents', async (req, res) => {
    const agents = await registry.getAllAgents();
    res.json(agents);
});

// GET /api/agents/:id - Get specific agent with metadata
app.get('/api/agents/:id', async (req, res) => {
    const agent = await registry.getAgent(req.params.id);
    res.json(agent);
});
```

## What Exists (But Unused)

The code has voice support in the runtime, but it's not connected to agent metadata:

### SonicClient Has Voice Config
```typescript
// agents/src/sonic-client.ts
private sessionConfig: { 
    systemPrompt?: string; 
    speechPrompt?: string; 
    voiceId?: string;  // ✅ Exists
    tools?: any[] 
} = {};

setConfig(config: { 
    systemPrompt?: string; 
    speechPrompt?: string; 
    voiceId?: string;  // ✅ Can be set
    tools?: any[] 
}) {
    this.sessionConfig = { ...this.sessionConfig, ...config };
}
```

### Voice Used in Session Start
```typescript
// agents/src/sonic-client.ts
const voiceId = this.sessionConfig.voiceId || "matthew";  // ✅ Used
console.log(`[SonicClient] Using Voice ID: ${voiceId}`);

// Session configuration
{
    voiceId: this.sessionConfig.voiceId || "matthew",  // ✅ Sent to AWS
    // ...
}
```

## The Problem

The voice infrastructure exists, but there's no way to:
1. Configure different voices per agent/workflow
2. Store voice metadata in agent registry
3. Expose agent voice info to frontend
4. Switch voices based on agent handoffs

## What Would Need To Be Implemented

### Step 1: Update AgentInfo Interface
```typescript
// gateway/src/agent-registry.ts
export interface AgentInfo {
    id: string;
    url: string;
    status: 'healthy' | 'unhealthy' | 'starting';
    capabilities: string[];
    lastHeartbeat: number;
    port: number;
    voiceId?: string;  // ADD THIS
    metadata?: {       // ADD THIS
        persona?: string;
        language?: string;
        [key: string]: any;
    };
}
```

### Step 2: Add Voice to Workflow Files
```bash
# Example: backend/workflows/workflow_triage.json
{
  "id": "triage",
  "name": "Triage",
  "voiceId": "matthew",
  "metadata": {
    "persona": "professional-banking",
    "language": "en-US"
  },
  "nodes": [...],
  "edges": [...]
}
```

### Step 3: Update Agent Registration
```typescript
// agents/src/agent-runtime-s2s.ts
async function registerWithGateway() {
    const response = await axios.post(`${GATEWAY_URL}/api/agents/register`, {
        id: AGENT_ID,
        url: `http://${AGENT_HOST}:${AGENT_PORT}`,
        capabilities: workflowDef?.testConfig?.personaId ? [workflowDef.testConfig.personaId] : [],
        port: AGENT_PORT,
        voiceId: workflowDef?.voiceId || 'matthew',  // ADD THIS
        metadata: workflowDef?.metadata || {}         // ADD THIS
    });
}
```

### Step 4: Pass Voice to SonicClient
```typescript
// agents/src/agent-runtime-s2s.ts
// After loading workflow
if (workflowDef?.voiceId) {
    sonicClient.setConfig({
        voiceId: workflowDef.voiceId
    });
}
```

### Step 5: Add Gateway Endpoints
```typescript
// gateway/src/server.ts
app.get('/api/agents', async (req, res) => {
    const agents = await registry.getAllAgents();
    res.json(agents);
});

app.get('/api/agents/:id', async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const agent = await registry.getAgent(id);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
});
```

### Step 6: Add Frontend API Proxy
```typescript
// frontend-v2/app/api/agents/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    const response = await fetch(`${apiUrl}/api/agents`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json([], { status: 500 });
  }
}
```

## Verification After Implementation

```bash
# Check agent has voice metadata
curl http://localhost:8080/api/agents | jq '.[0].voiceId'
# Should return: "matthew"

# Check workflow has voice config
jq '.voiceId' backend/workflows/workflow_triage.json
# Should return: "matthew"

# Check frontend can access
curl http://localhost:3000/api/agents | jq '.[0].voiceId'
# Should return: "matthew"
```

## Summary

**Current State:** Voice infrastructure exists but is hardcoded to "matthew"
**Missing:** Agent metadata system to configure voices per agent/workflow
**Impact:** All agents use the same voice, no voice switching on handoffs
**Effort:** ~2-3 hours to implement all 6 steps above

The experimental branch likely had this implemented, but it was not carried through to this codebase.
