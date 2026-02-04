# Implementation Plan: Voice-Agnostic Agent Architecture

> **📋 SPEC AVAILABLE:** This implementation plan now has a comprehensive spec with requirements, design, and tasks.
> 
> **Location:** `.kiro/specs/voice-agnostic-agent-architecture/`
> - `requirements.md` - 13 requirements with 91 acceptance criteria
> - `design.md` - Architecture, interfaces, 26 correctness properties
> - `tasks.md` - 18 implementation tasks with property-based tests
>
> **To start implementation:** Open `tasks.md` and begin with Task 1

---

## Current State Analysis

### ✅ GOOD NEWS: No Duplication!
Gateway has **NO SonicClient** - it's purely a router:
- Routes WebSocket connections to agents
- Manages A2A handoffs
- Stores session memory in Redis
- Forwards binary audio frames transparently

### ❌ THE PROBLEM: Two Agent Runtimes

```
agents/src/
├── agent-runtime-s2s.ts    (983 lines) - Voice-first, requires SonicClient
├── agent-runtime.ts         (200 lines) - Text-only, no voice support
└── sonic-client.ts          (1,636 lines) - Reusable voice client
```

**Issue**: Can't plug in a chat-based LangGraph agent because:
1. Voice agents expect audio I/O
2. Text agents have no voice support
3. No unified interface

---

## Goal

> "Link in another chat-based LangGraph agent and enable it for voice with minimal code"

### Success Criteria
- ✅ Add new LangGraph agent with ~10 lines of code
- ✅ Agent works in text mode (WebSocket)
- ✅ Agent works in voice mode (Nova Sonic)
- ✅ Agent works in hybrid mode (both)
- ✅ No code duplication
- ✅ Gateway stays voice-agnostic

---

## Architecture Solution: Voice Side-Car Pattern

### Concept
```
┌─────────────────────────────────────────────────────┐
│                  Gateway (Router)                    │
│  - Routes sessions to agents                        │
│  - Manages A2A handoffs                             │
│  - Stores session memory                            │
│  - NO voice logic                                   │
└────────────────┬────────────────────────────────────┘
                 │ WebSocket (binary frames)
     ┌───────────┼───────────┬───────────┐
     ▼           ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ Agent 1 │ │ Agent 2 │ │ Agent 3 │ │ Agent 4 │
│         │ │         │ │         │ │         │
│ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │
│ │Voice│ │ │ │Voice│ │ │ │Voice│ │ │ │Text │ │
│ │Side │ │ │ │Side │ │ │ │Side │ │ │ │Only │ │
│ │Car  │ │ │ │Car  │ │ │ │Car  │ │ │ │     │ │
│ └──┬──┘ │ │ └──┬──┘ │ │ └──┬──┘ │ │ └──┬──┘ │
│    ↓    │ │    ↓    │ │    ↓    │ │    ↓    │
│ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │
│ │Agent│ │ │ │Agent│ │ │ │Agent│ │ │ │Agent│ │
│ │Core │ │ │ │Core │ │ │ │Core │ │ │ │Core │ │
│ │     │ │ │ │     │ │ │ │     │ │ │ │     │ │
│ │Lang │ │ │ │Lang │ │ │ │Lang │ │ │ │Lang │ │
│ │Graph│ │ │ │Graph│ │ │ │Graph│ │ │ │Graph│ │
│ └─────┘ │ │ └─────┘ │ │ └─────┘ │ │ └─────┘ │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
```

### Key Principles
1. **Agent Core**: Voice-agnostic LangGraph business logic
2. **Voice Side-Car**: Optional wrapper that adds voice I/O
3. **Text Adapter**: Optional wrapper that adds WebSocket I/O
4. **Gateway**: Transparent router (no voice awareness)

---

## Implementation Plan

### Phase 1: Extract Agent Core (2 days)

#### Goal
Create voice-agnostic agent interface that ANY LangGraph agent can implement.

#### Files to Create
```typescript
// agents/src/agent-core.ts (NEW)
export interface AgentConfig {
  agentId: string;
  workflow: WorkflowDefinition;
  toolsUrl: string;
  personasDir: string;
  promptsDir: string;
}

export interface AgentMessage {
  text: string;
  sessionId: string;
  context?: any;
}

export interface AgentResponse {
  text: string;
  toolCalls?: any[];
  metadata?: any;
  shouldHandoff?: boolean;
  handoffTarget?: string;
}

export interface VoiceConfig {
  systemPrompt: string;
  voiceId: string;
  tools: any[];
}

/**
 * Voice-Agnostic Agent Core
 * 
 * This is the base class for all agents. It handles:
 * - LangGraph workflow execution
 * - Tool execution
 * - Persona management
 * - Session state
 * 
 * It does NOT handle:
 * - Voice I/O (that's VoiceSideCar's job)
 * - WebSocket I/O (that's TextAdapter's job)
 */
export class AgentCore {
  private graphExecutor: GraphExecutor;
  private toolsClient: ToolsClient;
  private personaLoader: PersonaLoader;
  private decisionEvaluator: DecisionEvaluator;
  private config: AgentConfig;
  
  constructor(config: AgentConfig) {
    this.config = config;
    this.graphExecutor = new GraphExecutor(config.workflow);
    this.toolsClient = new ToolsClient(config.toolsUrl);
    this.personaLoader = new PersonaLoader(config.personasDir, config.promptsDir);
    this.decisionEvaluator = new DecisionEvaluator(process.env.AWS_REGION || 'us-east-1');
  }
  
  /**
   * Process a text message (voice-agnostic)
   */
  async processMessage(input: AgentMessage): Promise<AgentResponse> {
    console.log(`[AgentCore:${this.config.agentId}] Processing message: ${input.text.substring(0, 50)}...`);
    
    // Execute LangGraph workflow
    const result = await this.graphExecutor.process({
      input: input.text,
      sessionId: input.sessionId,
      context: input.context
    });
    
    // Check for handoff decision
    let shouldHandoff = false;
    let handoffTarget = undefined;
    
    if (result.metadata?.requiresHandoff) {
      const decision = await this.decisionEvaluator.evaluateHandoff(
        input.text,
        result.output,
        result.metadata.handoffOptions
      );
      
      if (decision.shouldHandoff) {
        shouldHandoff = true;
        handoffTarget = decision.targetAgent;
      }
    }
    
    return {
      text: result.output,
      toolCalls: result.toolCalls,
      metadata: result.metadata,
      shouldHandoff,
      handoffTarget
    };
  }
  
  /**
   * Handle tool execution result
   */
  async handleToolResult(toolResult: any): Promise<string> {
    return await this.graphExecutor.continueWithToolResult(toolResult);
  }
  
  /**
   * Get voice configuration for this agent
   */
  getVoiceConfig(): VoiceConfig {
    const persona = this.personaLoader.getCurrentPersona();
    return {
      systemPrompt: persona.systemPrompt,
      voiceId: persona.voiceId || 'matthew',
      tools: persona.allowedTools
    };
  }
  
  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      agentId: this.config.agentId,
      workflow: this.config.workflow.id,
      persona: this.personaLoader.getCurrentPersona().id
    };
  }
}
```

#### Files to Modify
- Extract business logic from `agent-runtime-s2s.ts` into `AgentCore`
- Keep only I/O handling in runtime files

---

### Phase 2: Create Voice Side-Car (2 days)

#### Goal
Wrap AgentCore with voice I/O using SonicClient.

#### Files to Create
```typescript
// agents/src/voice-sidecar.ts (NEW)
import { SonicClient, SonicEvent } from './sonic-client';
import { AgentCore } from './agent-core';

export interface VoiceSideCarConfig {
  awsRegion: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  sessionToken?: string;
}

/**
 * Voice Side-Car
 * 
 * Wraps an AgentCore with voice I/O capabilities.
 * Handles:
 * - Audio streaming via SonicClient
 * - Voice → Text conversion
 * - Text → Voice conversion
 * - Tool execution via voice
 */
export class VoiceSideCar {
  private sonicClient: SonicClient;
  private agentCore: AgentCore;
  private sessionId: string | null = null;
  private audioCallback?: (audio: Buffer) => void;
  
  constructor(agentCore: AgentCore, config: VoiceSideCarConfig) {
    this.agentCore = agentCore;
    
    // Get voice config from agent
    const voiceConfig = agentCore.getVoiceConfig();
    
    // Initialize SonicClient with agent's configuration
    this.sonicClient = new SonicClient({
      region: config.awsRegion,
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
      sessionToken: config.sessionToken,
      systemPrompt: voiceConfig.systemPrompt,
      voiceId: voiceConfig.voiceId,
      tools: voiceConfig.tools
    });
  }
  
  /**
   * Attach voice I/O to this agent
   */
  async attach(sessionId: string, audioCallback: (audio: Buffer) => void): Promise<void> {
    this.sessionId = sessionId;
    this.audioCallback = audioCallback;
    
    console.log(`[VoiceSideCar] Attaching voice to agent for session: ${sessionId}`);
    
    await this.sonicClient.startSession((event: SonicEvent) => {
      this.handleVoiceEvent(event);
    });
  }
  
  /**
   * Handle voice events from SonicClient
   */
  private async handleVoiceEvent(event: SonicEvent) {
    switch (event.type) {
      case 'transcript':
        // Voice → Agent
        await this.handleTranscript(event.data.text);
        break;
        
      case 'toolUse':
        // Tool execution via agent
        await this.handleToolUse(event.data);
        break;
        
      case 'audio':
        // Forward audio to client
        if (this.audioCallback) {
          this.audioCallback(event.data.audio);
        }
        break;
        
      case 'interruption':
        // Handle user interruption
        console.log('[VoiceSideCar] User interrupted');
        break;
        
      default:
        console.log(`[VoiceSideCar] Unhandled event: ${event.type}`);
    }
  }
  
  /**
   * Handle transcript from voice
   */
  private async handleTranscript(text: string) {
    if (!this.sessionId) return;
    
    console.log(`[VoiceSideCar] Transcript: ${text}`);
    
    // Send to agent core (voice-agnostic)
    const response = await this.agentCore.processMessage({
      text,
      sessionId: this.sessionId
    });
    
    // Send response back to voice
    await this.sonicClient.sendText(response.text);
    
    // Handle handoff if needed
    if (response.shouldHandoff && response.handoffTarget) {
      // Emit handoff event (gateway will handle routing)
      this.emit('handoff', {
        targetAgent: response.handoffTarget,
        context: response.metadata
      });
    }
  }
  
  /**
   * Handle tool use from voice
   */
  private async handleToolUse(toolData: any) {
    console.log(`[VoiceSideCar] Tool use: ${toolData.toolName}`);
    
    // Execute tool via agent core
    const result = await this.agentCore.handleToolResult(toolData);
    
    // Send result back to voice
    await this.sonicClient.sendToolResult(toolData.toolUseId, result);
  }
  
  /**
   * Send audio input to voice
   */
  async sendAudio(audio: Buffer): Promise<void> {
    await this.sonicClient.sendAudio(audio);
  }
  
  /**
   * Detach voice I/O
   */
  async detach(): Promise<void> {
    console.log('[VoiceSideCar] Detaching voice');
    await this.sonicClient.stopSession();
    this.sessionId = null;
  }
  
  /**
   * Event emitter for handoffs, etc.
   */
  private emit(event: string, data: any) {
    // Implement event emitter pattern
    console.log(`[VoiceSideCar] Event: ${event}`, data);
  }
}
```

---

### Phase 3: Create Text Adapter (1 day)

#### Goal
Wrap AgentCore with WebSocket text I/O.

#### Files to Create
```typescript
// agents/src/text-adapter.ts (NEW)
import { WebSocket } from 'ws';
import { AgentCore } from './agent-core';

/**
 * Text Adapter
 * 
 * Wraps an AgentCore with WebSocket text I/O.
 * Handles:
 * - WebSocket message parsing
 * - Text → Agent
 * - Agent → Text
 */
export class TextAdapter {
  private agentCore: AgentCore;
  private ws: WebSocket;
  private sessionId: string | null = null;
  
  constructor(agentCore: AgentCore, ws: WebSocket) {
    this.agentCore = agentCore;
    this.ws = ws;
  }
  
  /**
   * Attach text I/O to this agent
   */
  async attach(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    
    console.log(`[TextAdapter] Attaching text I/O for session: ${sessionId}`);
    
    this.ws.on('message', async (data: Buffer) => {
      await this.handleMessage(data);
    });
    
    this.ws.on('close', () => {
      console.log(`[TextAdapter] WebSocket closed for session: ${sessionId}`);
    });
    
    this.ws.on('error', (error) => {
      console.error('[TextAdapter] WebSocket error:', error);
    });
  }
  
  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(data: Buffer) {
    if (!this.sessionId) return;
    
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'user_message') {
        // Text → Agent
        const response = await this.agentCore.processMessage({
          text: message.text,
          sessionId: this.sessionId,
          context: message.context
        });
        
        // Agent → Text
        this.ws.send(JSON.stringify({
          type: 'agent_response',
          text: response.text,
          sessionId: this.sessionId,
          metadata: response.metadata
        }));
        
        // Handle handoff if needed
        if (response.shouldHandoff && response.handoffTarget) {
          this.ws.send(JSON.stringify({
            type: 'handoff_request',
            targetAgentId: response.handoffTarget,
            context: response.metadata
          }));
        }
      }
    } catch (error) {
      console.error('[TextAdapter] Failed to handle message:', error);
    }
  }
  
  /**
   * Detach text I/O
   */
  async detach(): Promise<void> {
    console.log('[TextAdapter] Detaching text I/O');
    this.ws.removeAllListeners();
    this.sessionId = null;
  }
}
```

---

### Phase 4: Unified Runtime (1 day)

#### Goal
Create single runtime that uses adapters based on mode.

#### Files to Create
```typescript
// agents/src/agent-runtime-unified.ts (NEW - REPLACES both old runtimes)
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AgentCore } from './agent-core';
import { VoiceSideCar } from './voice-sidecar';
import { TextAdapter } from './text-adapter';
import { WorkflowDefinition } from './graph-types';

// Environment configuration
const AGENT_ID = process.env.AGENT_ID || 'unknown';
const AGENT_PORT = parseInt(process.env.AGENT_PORT || '8081');
const MODE = process.env.MODE || 'voice'; // 'voice', 'text', or 'hybrid'
const WORKFLOW_FILE = process.env.WORKFLOW_FILE || '/app/workflow.json';
const LOCAL_TOOLS_URL = process.env.LOCAL_TOOLS_URL || 'http://local-tools:9000';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:8080';

// Paths
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const PERSONAS_DIR = path.join(BASE_DIR, 'backend/personas');
const PROMPTS_DIR = path.join(BASE_DIR, 'backend/prompts');

// Load workflow
let workflowDef: WorkflowDefinition | null = null;
try {
  if (fs.existsSync(WORKFLOW_FILE)) {
    workflowDef = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf-8'));
    console.log(`[Agent:${AGENT_ID}] Loaded workflow from ${WORKFLOW_FILE}`);
  }
} catch (error) {
  console.error(`[Agent:${AGENT_ID}] Failed to load workflow:`, error);
  process.exit(1);
}

if (!workflowDef) {
  console.error(`[Agent:${AGENT_ID}] No workflow definition found`);
  process.exit(1);
}

// Initialize Agent Core (voice-agnostic)
const agentCore = new AgentCore({
  agentId: AGENT_ID,
  workflow: workflowDef,
  toolsUrl: LOCAL_TOOLS_URL,
  personasDir: PERSONAS_DIR,
  promptsDir: PROMPTS_DIR
});

console.log(`[Agent:${AGENT_ID}] Agent Core initialized`);
console.log(`[Agent:${AGENT_ID}] Mode: ${MODE}`);

// Express app
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agent: AGENT_ID,
    mode: MODE,
    workflow: workflowDef?.id || 'unknown',
    timestamp: Date.now()
  });
});

// Create HTTP server
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/session' });

// Active sessions
const activeSessions = new Map<string, any>();

wss.on('connection', async (ws: WebSocket) => {
  let sessionId: string | null = null;
  let voiceSidecar: VoiceSideCar | null = null;
  let textAdapter: TextAdapter | null = null;
  
  console.log(`[Agent:${AGENT_ID}] New WebSocket connection`);
  
  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle session initialization
      if (message.type === 'session_init') {
        sessionId = message.sessionId;
        if (!sessionId) return;
        
        console.log(`[Agent:${AGENT_ID}] Session initialized: ${sessionId}`);
        
        // Attach adapters based on mode
        if (MODE === 'voice' || MODE === 'hybrid') {
          // Attach voice side-car
          voiceSidecar = new VoiceSideCar(agentCore, {
            awsRegion: process.env.AWS_REGION || 'us-east-1',
            awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
            awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
          });
          
          await voiceSidecar.attach(sessionId, (audio: Buffer) => {
            // Forward audio to client
            ws.send(audio);
          });
          
          console.log(`[Agent:${AGENT_ID}] Voice side-car attached`);
        }
        
        if (MODE === 'text' || MODE === 'hybrid') {
          // Attach text adapter
          textAdapter = new TextAdapter(agentCore, ws);
          await textAdapter.attach(sessionId);
          
          console.log(`[Agent:${AGENT_ID}] Text adapter attached`);
        }
        
        activeSessions.set(sessionId, {
          sessionId,
          voiceSidecar,
          textAdapter,
          startTime: Date.now()
        });
        
        // Send acknowledgment
        ws.send(JSON.stringify({
          type: 'session_ack',
          sessionId,
          agent: AGENT_ID,
          mode: MODE
        }));
        
        return;
      }
      
      // Forward audio to voice side-car
      if (voiceSidecar && message.type === 'audio') {
        await voiceSidecar.sendAudio(Buffer.from(message.data));
        return;
      }
      
    } catch (error) {
      // Binary data (audio) - forward to voice side-car
      if (voiceSidecar) {
        await voiceSidecar.sendAudio(data);
      }
    }
  });
  
  ws.on('close', async () => {
    console.log(`[Agent:${AGENT_ID}] WebSocket closed for session: ${sessionId}`);
    
    if (sessionId) {
      const session = activeSessions.get(sessionId);
      if (session) {
        if (session.voiceSidecar) {
          await session.voiceSidecar.detach();
        }
        if (session.textAdapter) {
          await session.textAdapter.detach();
        }
        activeSessions.delete(sessionId);
      }
    }
  });
});

// Register with gateway
async function registerWithGateway() {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: AGENT_ID,
        url: `http://${process.env.AGENT_HOST || 'localhost'}:${AGENT_PORT}`,
        capabilities: [MODE],
        port: AGENT_PORT
      })
    });
    
    if (response.ok) {
      console.log(`[Agent:${AGENT_ID}] Registered with gateway`);
    }
  } catch (error) {
    console.error(`[Agent:${AGENT_ID}] Failed to register with gateway:`, error);
  }
}

// Start server
server.listen(AGENT_PORT, '0.0.0.0', async () => {
  console.log(`[Agent:${AGENT_ID}] Server listening on port ${AGENT_PORT}`);
  console.log(`[Agent:${AGENT_ID}] WebSocket endpoint: ws://localhost:${AGENT_PORT}/session`);
  await registerWithGateway();
});
```

---

### Phase 5: Add New LangGraph Agent (10 minutes!)

#### Goal
Show how easy it is to add a new agent.

#### Example: Customer Support Agent
```typescript
// agents/workflows/workflow-support.json
{
  "id": "support",
  "name": "Customer Support",
  "personaId": "support",
  "voiceId": "amy",
  "nodes": [
    {
      "id": "greeting",
      "type": "message",
      "content": "Hello! I'm here to help with your support request."
    },
    {
      "id": "gather_issue",
      "type": "input",
      "prompt": "What can I help you with today?"
    },
    {
      "id": "resolve",
      "type": "tool",
      "tool": "search_knowledge_base"
    },
    {
      "id": "followup",
      "type": "decision",
      "question": "Is there anything else I can help with?"
    }
  ]
}
```

#### Docker Compose Entry
```yaml
# docker-compose.yml
services:
  agent-support:
    build:
      context: ./agents
      dockerfile: Dockerfile
    environment:
      - AGENT_ID=support
      - AGENT_PORT=8084
      - MODE=voice  # or 'text' or 'hybrid'
      - WORKFLOW_FILE=/app/workflows/workflow-support.json
      - AWS_REGION=${AWS_REGION}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    volumes:
      - ./backend/workflows:/app/workflows
      - ./backend/personas:/app/personas
      - ./backend/prompts:/app/prompts
    networks:
      - voice-network
```

**That's it!** The agent automatically:
- ✅ Registers with gateway
- ✅ Gets voice capabilities (if MODE=voice)
- ✅ Handles A2A handoffs
- ✅ Executes LangGraph workflow
- ✅ Works in text/voice/hybrid mode

---

## Migration Strategy

### Week 1: Foundation
- **Day 1-2**: Extract AgentCore from agent-runtime-s2s.ts
- **Day 3-4**: Create VoiceSideCar wrapper
- **Day 5**: Create TextAdapter wrapper

### Week 2: Integration
- **Day 1**: Create UnifiedRuntime
- **Day 2-3**: Migrate existing agents (triage, banking, IDV, disputes)
- **Day 4**: Test all modes (voice, text, hybrid)
- **Day 5**: Documentation and cleanup

### Week 3: Validation
- **Day 1**: Add new test agent (support)
- **Day 2**: Performance testing
- **Day 3**: A2A handoff testing
- **Day 4**: Production readiness
- **Day 5**: Deploy

---

## Benefits

### ✅ For Developers
```typescript
// Add new agent in 10 minutes
const myAgent = new AgentCore({
  agentId: 'my-agent',
  workflow: myWorkflow,
  toolsUrl: TOOLS_URL,
  personasDir: PERSONAS_DIR,
  promptsDir: PROMPTS_DIR
});

// Voice mode
const voiceSidecar = new VoiceSideCar(myAgent, awsConfig);
await voiceSidecar.attach(sessionId, audioCallback);

// Text mode
const textAdapter = new TextAdapter(myAgent, ws);
await textAdapter.attach(sessionId);

// Both!
// Just attach both adapters
```

### ✅ For Testing
```typescript
// Test agent without voice
const agent = new AgentCore(config);
const response = await agent.processMessage({
  text: 'test input',
  sessionId: '123'
});
expect(response.text).toBe('expected output');

// No AWS credentials needed!
// No audio streaming needed!
// Just pure business logic testing!
```

### ✅ For Production
- Single agent codebase (no duplication)
- Mode switching via environment variable
- Gateway stays simple (no voice logic)
- Easy to add new agents
- Easy to test
- Easy to maintain

---

## File Structure (After Migration)

```
agents/src/
├── agent-core.ts              (NEW - 300 lines)
├── voice-sidecar.ts           (NEW - 200 lines)
├── text-adapter.ts            (NEW - 100 lines)
├── agent-runtime-unified.ts   (NEW - 150 lines)
├── sonic-client.ts            (KEEP - 1,636 lines)
├── graph-executor.ts          (KEEP)
├── tools-client.ts            (KEEP)
├── persona-loader.ts          (KEEP)
├── decision-evaluator.ts      (KEEP)
├── banking-tools.ts           (KEEP)
├── handoff-tools.ts           (KEEP)
└── [DELETE]
    ├── agent-runtime-s2s.ts   (DELETE - 983 lines)
    └── agent-runtime.ts       (DELETE - 200 lines)
```

**Net Result**: 
- Remove 1,183 lines of duplicated code
- Add 750 lines of clean, reusable code
- **Save 433 lines** while gaining flexibility!

---

## Next Steps

### ✅ Spec Created!

A comprehensive spec has been created at `.kiro/specs/voice-agnostic-agent-architecture/` with:
- **Requirements:** 13 requirements, 91 acceptance criteria
- **Design:** Architecture diagrams, interfaces, 26 correctness properties
- **Tasks:** 18 implementation tasks with property-based tests

### 🚀 Ready to Implement

**Option 1: Execute All Tasks**
```bash
# Tell Kiro to execute all tasks in the spec
"Run all tasks for voice-agnostic-agent-architecture"
```

**Option 2: Execute Tasks Incrementally**
1. Open `.kiro/specs/voice-agnostic-agent-architecture/tasks.md`
2. Start with Task 1: "Create Agent Core with voice-agnostic interface"
3. Tell Kiro: "Execute task 1 from voice-agnostic-agent-architecture spec"

**Option 3: Review First**
1. Review `requirements.md` to understand acceptance criteria
2. Review `design.md` to understand architecture and interfaces
3. Review `tasks.md` to understand implementation approach
4. Then proceed with execution

### 📊 Expected Outcomes

- **Code Reduction:** ~433 lines saved (eliminate 1,183, add ~750)
- **New Files:** 4 new TypeScript files (agent-core, voice-sidecar, text-adapter, unified-runtime)
- **Deleted Files:** 2 old runtime files (agent-runtime-s2s.ts, agent-runtime.ts)
- **Test Coverage:** 26 property-based tests + unit tests + integration tests
- **Migration:** All 4 existing agents (triage, banking, IDV, disputes) migrate successfully

### 🎯 Success Criteria

- ✅ Add new LangGraph agent with ~10 lines of code
- ✅ Agent works in text mode (WebSocket)
- ✅ Agent works in voice mode (Nova Sonic)
- ✅ Agent works in hybrid mode (both)
- ✅ No code duplication
- ✅ Gateway stays voice-agnostic
- ✅ Net reduction in lines of code

Let me know when you're ready to start implementation!
