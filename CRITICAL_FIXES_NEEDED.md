# Critical Fixes Needed - Branch Divergence Analysis

## Executive Summary
The `experimental-cleanup` branch (current) diverged from `experimental` branch at commit `55c3eaa`. The experimental branch contains critical fixes (commit `bf62db4`) that are NOT present in the current codebase. The current branch underwent a major refactor to service-based architecture which removed the original fix logic.

## Issues Identified & Root Causes

### 1. ❌ Tokens Not Showing Changes
**Status:** BROKEN
**Root Cause:** 
- No token tracking/usage API endpoint exists in current server.ts
- Session usage data is not being captured or exposed
- Frontend expects `/api/usage` or usage data in session responses

**Fix Required:**
```typescript
// Add to backend/src/server.ts
app.get('/api/usage/:sessionId', (req, res) => {
    const sessionFile = path.join(HISTORY_DIR, `session_${req.params.sessionId}.json`);
    if (fs.existsSync(sessionFile)) {
        const session = readJsonFile(sessionFile);
        res.json({
            inputTokens: session.usage?.inputTokens || 0,
            outputTokens: session.usage?.outputTokens || 0,
            totalTokens: session.usage?.totalTokens || 0
        });
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});
```

**Also Need:** SonicService must track and save token usage to session files.

---

### 2. ❌ Voices Not Being Correctly Pulled Through
**Status:** PARTIALLY WORKING
**Root Cause:**
- `/api/voices` endpoint exists but returns hardcoded list
- No metadata linking voices to specific agents/personas
- Voice configuration should be in persona/prompt config from Langfuse

**Current Code:**
```typescript
// backend/src/server.ts line 118
app.get('/api/voices', (req, res) => {
    res.json([
        { id: 'Matthew', name: 'Matthew (US Male)', language: 'en-US' },
        // ... hardcoded list
    ]);
});
```

**Fix Required:**
1. Add voice metadata to Langfuse prompt configs
2. Return voice config from `/api/prompts` endpoint
3. Frontend should read voice from persona config, not separate endpoint

**Langfuse Prompt Config Structure:**
```json
{
  "name": "banking_agent",
  "config": {
    "voice": "Matthew",
    "voiceSettings": {
      "stability": 0.5,
      "similarity": 0.75
    }
  }
}
```

---

### 3. ❌ Chat History Not Working
**Status:** BROKEN
**Root Cause:**
- `/api/history` endpoint exists (line 283) but may have path issues
- Session files might not be saved correctly by SonicService
- Frontend might be calling wrong endpoint or format

**Current Implementation:**
```typescript
// backend/src/server.ts line 283
app.get('/api/history', (req, res) => {
    const files = fs.readdirSync(HISTORY_DIR)
        .filter(f => f.endsWith('.json') && f.startsWith('session_'));
    // ... maps files to history list
});
```

**Issues:**
1. HISTORY_DIR path might be wrong (uses `__dirname` which is in dist/)
2. Session files might not be created/saved by SonicService
3. No error handling for missing directory

**Fix Required:**
```typescript
// Fix path resolution
const HISTORY_DIR = path.join(process.cwd(), 'history');

// Add error handling
app.get('/api/history', (req, res) => {
    try {
        if (!fs.existsSync(HISTORY_DIR)) {
            return res.json([]);
        }
        // ... rest of implementation
    } catch (e: any) {
        console.error('[Server] History fetch error:', e);
        res.status(500).json({ error: e.message });
    }
});
```

---

### 4. ❌ Workflow Designer Not Pulling Workflows
**Status:** BROKEN
**Root Cause:**
- `/api/workflows` endpoint exists (line 211) but uses wrong file pattern
- Expects `workflow_*.json` but files might be named differently
- WORKFLOWS_DIR path might be incorrect

**Current Code:**
```typescript
// backend/src/server.ts line 211
app.get('/api/workflows', (req, res) => {
    const files = fs.readdirSync(WORKFLOWS_DIR)
        .filter(f => f.startsWith('workflow_') && f.endsWith('.json'));
    // ...
});
```

**Debug Steps:**
1. Check actual workflow file names in `/backend/workflows/`
2. Verify WORKFLOWS_DIR path resolves correctly
3. Add logging to see what files are found

**Fix Required:**
```typescript
app.get('/api/workflows', (req, res) => {
    try {
        console.log('[Server] Workflows directory:', WORKFLOWS_DIR);
        if (!fs.existsSync(WORKFLOWS_DIR)) {
            console.error('[Server] Workflows directory does not exist');
            return res.json([]);
        }
        
        const files = fs.readdirSync(WORKFLOWS_DIR);
        console.log('[Server] Found files:', files);
        
        const workflowFiles = files.filter(f => f.endsWith('.json'));
        const workflows = workflowFiles.map(f => {
            const content = readJsonFile(path.join(WORKFLOWS_DIR, f), {});
            return { 
                id: content.id || f.replace('.json', ''), 
                name: content.name || f.replace('.json', '')
            };
        });
        
        res.json(workflows);
    } catch (e: any) {
        console.error('[Server] Workflows fetch error:', e);
        res.status(500).json({ error: e.message });
    }
});
```

---

### 5. ❌ Tool Management Shows Zero Tools
**Status:** BROKEN
**Root Cause:**
- ToolService uses wrong path: `path.join(__dirname, '../../tools')`
- Should use `path.join(process.cwd(), 'tools')`
- Path resolution breaks in Docker/compiled environment

**Current Code:**
```typescript
// backend/src/services/tool-service.ts line 5
const TOOLS_DIR = path.join(process.cwd(), 'tools');
```

**This is actually CORRECT**, so the issue is likely:
1. Tools directory doesn't exist or is empty
2. Tool files are malformed JSON
3. API response transformation is wrong

**Fix Required:**
```typescript
// backend/src/server.ts line 135
app.get('/api/tools', (req, res) => {
    try {
        console.log('[Server] Tools directory:', TOOLS_DIR);
        console.log('[Server] Tools directory exists:', fs.existsSync(TOOLS_DIR));
        
        if (fs.existsSync(TOOLS_DIR)) {
            const files = fs.readdirSync(TOOLS_DIR);
            console.log('[Server] Tool files found:', files);
        }
        
        const tools = toolService.loadTools();
        console.log('[Server] Loaded tools count:', tools.length);
        
        const formatted = tools.map(t => {
            const spec = t.toolSpec;
            let params = "{}";
            try {
                params = spec.inputSchema.json;
            } catch (e) {
                console.error('[Server] Failed to parse tool schema:', e);
            }

            return {
                name: spec.name,
                description: spec.description.split('\n\n[INSTRUCTION]:')[0],
                instruction: t.instruction,
                agentPrompt: t.agentPrompt,
                parameters: params
            };
        });
        
        res.json(formatted);
    } catch (e: any) {
        console.error('[Server] Tools fetch error:', e);
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});
```

---

### 6. ❌ Live Visualization Does Not Work
**Status:** BROKEN
**Root Cause:**
- No WebSocket events being sent for visualization
- SonicService doesn't emit workflow state changes
- Frontend expects specific event format

**Missing Events:**
- `workflow_step_change`
- `tool_execution_start`
- `tool_execution_complete`
- `agent_thinking`
- `decision_point`

**Fix Required in SonicService:**
```typescript
// Add to backend/src/services/sonic-service.ts

private emitVisualizationEvent(type: string, data: any) {
    if (this.session.ws.readyState === WebSocket.OPEN) {
        this.session.ws.send(JSON.stringify({
            type: 'visualization',
            event: type,
            data: data,
            timestamp: Date.now()
        }));
    }
}

// Call this when workflow steps change:
this.emitVisualizationEvent('workflow_step_change', {
    workflowId: this.session.currentWorkflowId,
    stepId: this.session.activeWorkflowStepId,
    stepName: 'Current Step Name'
});

// Call when tools execute:
this.emitVisualizationEvent('tool_execution_start', {
    toolName: toolName,
    parameters: params
});
```

---

### 7. ❌ Personas Not Being Fetched from Langfuse
**Status:** PARTIALLY WORKING
**Root Cause:**
- PromptService DOES fetch from Langfuse (line 36 in prompt-service.ts)
- BUT: Personas are prompts, not a separate entity
- Frontend might be looking for `/api/personas` instead of `/api/prompts`

**Current Implementation:**
```typescript
// backend/src/services/prompt-service.ts line 36
const prompt = await this.langfuse.getPrompt(promptName);
```

**This IS working**, but:
1. Langfuse credentials might not be set in .env
2. Prompts might not exist in Langfuse
3. Frontend might not understand that personas = prompts

**Fix Required:**
1. Verify Langfuse credentials in .env:
```bash
LANGFUSE_PUBLIC_KEY=pk-lf-xxx
LANGFUSE_SECRET_KEY=sk-lf-xxx
LANGFUSE_HOST=https://cloud.langfuse.com
```

2. Add persona-specific endpoint (alias for prompts):
```typescript
// backend/src/server.ts
app.get('/api/personas', async (req, res) => {
    try {
        const prompts = await promptService.listPrompts();
        // Filter to only persona-type prompts
        const personas = prompts.filter(p => 
            p.config?.type === 'persona' || 
            p.name.includes('agent') || 
            p.name.includes('persona')
        );
        res.json(personas);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
```

3. Update Langfuse prompts to include metadata:
```json
{
  "name": "banking_agent",
  "type": "chat",
  "config": {
    "type": "persona",
    "voice": "Matthew",
    "workflow": "banking_general",
    "tools": ["check_balance", "transfer_funds"]
  }
}
```

---

## Critical Missing Features from Experimental Branch

### From commit bf62db4 "Fix duplicate responses, recursive tool loops, and unsolicited usage"

**Key fixes that need to be ported:**

1. **Deduplication Logic**
   - Track last agent reply
   - Prevent duplicate responses
   - Similarity checking before sending

2. **Tool Loop Prevention**
   - Max tool execution limit per turn
   - Tool call history tracking
   - Recursive call detection

3. **Unsolicited Response Prevention**
   - Only respond when user speaks
   - Silence detection improvements
   - Interrupt handling

**These need to be implemented in SonicService.ts**

---

## Immediate Action Plan

### Priority 1 (Critical - Blocks All Features)
1. ✅ Fix path resolution for TOOLS_DIR, WORKFLOWS_DIR, HISTORY_DIR
2. ✅ Add comprehensive logging to all API endpoints
3. ✅ Verify Langfuse credentials and connection

### Priority 2 (High - Core Features)
4. ⚠️ Implement token tracking in SonicService
5. ⚠️ Add visualization events to SonicService
6. ⚠️ Fix session history saving

### Priority 3 (Medium - UX)
7. 🔄 Port deduplication logic from experimental branch
8. 🔄 Add voice metadata to persona configs
9. 🔄 Create `/api/personas` endpoint

### Priority 4 (Low - Nice to Have)
10. 📋 Add tool loop prevention
11. 📋 Improve error messages
12. 📋 Add health check for all services

---

## Testing Checklist

After fixes, verify:
- [ ] `/api/tools` returns list of tools
- [ ] `/api/workflows` returns list of workflows  
- [ ] `/api/prompts` returns prompts from Langfuse
- [ ] `/api/voices` returns voice list
- [ ] `/api/history` returns session history
- [ ] WebSocket sends visualization events
- [ ] Token usage is tracked and displayed
- [ ] Personas load from Langfuse with metadata

---

## Environment Variables Required

```bash
# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AGENT_CORE_RUNTIME_ARN=arn:aws:...

# Nova (if different from AWS)
NOVA_AWS_REGION=us-east-1
NOVA_AWS_ACCESS_KEY_ID=xxx
NOVA_AWS_SECRET_ACCESS_KEY=xxx

# Langfuse
LANGFUSE_PUBLIC_KEY=pk-lf-xxx
LANGFUSE_SECRET_KEY=sk-lf-xxx
LANGFUSE_HOST=https://cloud.langfuse.com

# Server
PORT=8080
```
