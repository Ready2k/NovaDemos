# Voice Architecture Decision: Centralized vs Distributed

## The Question

Should we:
1. **Keep distributed voice** (Option 2 pattern): Each agent has its own SonicClient
2. **Centralize voice** (Option 3 + voice): Single voice connection at gateway, agents are voice-agnostic

## Goal Reminder

> "Use any agent and enable it for voice usage with an intelligent layer to manage the differences between Chat and Voice"

## Current State Analysis (Option 2)

### Architecture Pattern
```
Gateway (Router)
    ↓
Agent 1 → SonicClient → Nova Sonic
Agent 2 → SonicClient → Nova Sonic  
Agent 3 → SonicClient → Nova Sonic
```

### What We Have
- ✅ Each agent has standalone SonicClient
- ✅ Per-agent voice configuration (voice ID, prompts)
- ✅ A2A handoffs with voice continuity
- ✅ LangGraph workflow integration
- ❌ Agents are voice-first (can't use without voice)
- ❌ Duplicated voice logic across agents
- ❌ Complex session handoffs (voice + state)

### Code Structure
```
agents/src/
├── agent-runtime-s2s.ts    (983 lines - VOICE EMBEDDED)
├── agent-runtime.ts         (200 lines - TEXT ONLY)
├── sonic-client.ts          (1,636 lines - REUSABLE)
├── graph-executor.ts        (SHARED)
├── tools-client.ts          (SHARED)
└── persona-loader.ts        (SHARED)
```

**Key Finding**: We have TWO agent runtimes:
- `agent-runtime-s2s.ts` - Voice-first (can't run without voice)
- `agent-runtime.ts` - Text-only (no voice support)

This is the CORE problem! Agents aren't voice-agnostic.

---

## Alternative: Centralized Voice Architecture

### Architecture Pattern
```
Gateway (Router + Voice Manager)
    ↓ [Voice I/O Layer]
    ↓ [Text Adapter]
    ↓
Agent 1 (Voice-Agnostic)
Agent 2 (Voice-Agnostic)
Agent 3 (Voice-Agnostic)
```

### How It Would Work

#### 1. Gateway Manages Voice Connection
```typescript
// gateway/src/voice-manager.ts
class VoiceManager {
  private sonicClient: SonicClient;
  private sessionAgentMap: Map<string, string>; // sessionId → agentId
  
  async attachToSession(sessionId: string, agentId: string) {
    // Start voice for this session
    await this.sonicClient.startSession({
      onTranscript: (text) => this.sendToAgent(sessionId, text),
      onToolUse: (tool) => this.sendToAgent(sessionId, tool),
      onAudio: (audio) => this.sendToClient(sessionId, audio)
    });
  }
  
  async sendToAgent(sessionId: string, message: any) {
    const agentId = this.sessionAgentMap.get(sessionId);
    const agentWs = this.getAgentConnection(agentId);
    
    // Convert voice event to text message
    agentWs.send(JSON.stringify({
      type: 'user_message',
      text: message.text || message.transcript,
      sessionId
    }));
  }
  
  async handleAgentResponse(sessionId: string, response: any) {
    // Convert text response to voice
    await this.sonicClient.sendText(response.text);
  }
}
```

#### 2. Agents Become Voice-Agnostic
```typescript
// agents/src/agent-runtime.ts (UNIFIED)
class AgentRuntime {
  private graphExecutor: GraphExecutor;
  private toolsClient: ToolsClient;
  
  async handleMessage(message: { text: string; sessionId: string }) {
    // Process text (doesn't care if it came from voice or chat)
    const result = await this.graphExecutor.process({
      input: message.text,
      sessionId: message.sessionId
    });
    
    // Return text (gateway decides if it becomes voice or chat)
    return {
      type: 'agent_response',
      text: result.output,
      sessionId: message.sessionId
    };
  }
}
```

#### 3. Voice Adapter Layer
```typescript
// gateway/src/voice-adapter.ts
class VoiceAdapter {
  // Converts voice events to agent messages
  voiceToAgent(voiceEvent: SonicEvent): AgentMessage {
    return {
      type: 'user_message',
      text: voiceEvent.data.transcript || voiceEvent.data.text,
      metadata: {
        isVoice: true,
        sentiment: voiceEvent.data.sentiment,
        interruption: voiceEvent.type === 'interruption'
      }
    };
  }
  
  // Converts agent responses to voice
  agentToVoice(agentResponse: AgentMessage): VoiceCommand {
    return {
      type: 'speak',
      text: agentResponse.text,
      voiceId: this.getVoiceForAgent(agentResponse.agentId),
      emotion: agentResponse.metadata?.emotion
    };
  }
  
  // Handles voice-specific behaviors
  handleInterruption(sessionId: string) {
    // Stop current speech
    // Clear agent's pending output
    // Signal agent to reset context
  }
}
```

---

## Comparison Matrix

| Aspect | Distributed (Current) | Centralized (Alternative) |
|--------|----------------------|---------------------------|
| **Agent Reusability** | ❌ Voice-first only | ✅ Works with ANY agent |
| **Code Duplication** | ❌ SonicClient per agent | ✅ Single voice manager |
| **Complexity** | 🟡 Medium (per-agent) | 🟢 Low (centralized) |
| **Voice Customization** | ✅ Per-agent voice config | ⚠️ Needs config passing |
| **A2A Handoffs** | 🟡 Complex (voice + state) | ✅ Simple (just routing) |
| **Latency** | ✅ Direct connection | ⚠️ Extra hop (gateway) |
| **Scalability** | ⚠️ N voice connections | ✅ 1 voice per session |
| **Testing** | ❌ Need voice for tests | ✅ Test agents without voice |
| **Maintenance** | ❌ Update N agents | ✅ Update 1 voice layer |
| **Chat Fallback** | ❌ Need separate runtime | ✅ Same agent, different I/O |

---

## Deep Dive: The Real Problem

### Current Issue: Two Agent Runtimes

```typescript
// agents/src/agent-runtime-s2s.ts (Voice-First)
const sonicClient = new SonicClient(awsConfig);
await sonicClient.startSession((event) => {
  if (event.type === 'transcript') {
    handleUserMessage(event.data.text);
  }
});

// agents/src/agent-runtime.ts (Text-Only)
ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === 'user_message') {
    handleUserMessage(message.text);
  }
});
```

**Problem**: Same business logic, different I/O wrappers!

### Solution 1: Distributed with Abstraction (Side-Car)
```typescript
// Create unified agent runtime
class UnifiedAgentRuntime {
  async processMessage(text: string): Promise<string> {
    // Business logic (voice-agnostic)
    return await this.graphExecutor.process(text);
  }
}

// Wrap with voice
const agent = new UnifiedAgentRuntime(config);
const voiceSidecar = new VoiceSideCar(agent);
await voiceSidecar.attach(); // Adds voice I/O

// Or use without voice
const agent = new UnifiedAgentRuntime(config);
const textAdapter = new TextAdapter(agent);
await textAdapter.attach(); // Adds WebSocket I/O
```

### Solution 2: Centralized Voice Manager
```typescript
// Gateway manages voice
class Gateway {
  private voiceManager: VoiceManager;
  private agents: Map<string, AgentConnection>;
  
  async handleSession(sessionId: string, mode: 'voice' | 'text') {
    if (mode === 'voice') {
      await this.voiceManager.attachToSession(sessionId);
    }
    
    // Route to agent (agent doesn't know about voice)
    const agent = await this.selectAgent(sessionId);
    await this.routeToAgent(agent, sessionId);
  }
}

// Agents are always voice-agnostic
class Agent {
  async handleMessage(text: string): Promise<string> {
    // Just process text
    return await this.process(text);
  }
}
```

---

## Recommendation: HYBRID APPROACH

### Why Not Pure Centralized?

**Latency Concerns**:
- Voice requires <500ms latency
- Extra hop through gateway adds 50-100ms
- Per-agent voice is faster for real-time

**Voice Customization**:
- Different agents need different voices
- Banking agent: Professional (Matthew)
- Support agent: Friendly (Amy)
- Centralized needs complex config passing

**A2A Handoffs**:
- Voice continuity during handoffs
- Easier with per-agent voice
- Centralized needs voice transfer logic

### The Hybrid Solution

```
┌─────────────────────────────────────────────────────────┐
│                    Gateway (Router)                      │
│  - Session routing                                       │
│  - Agent discovery                                       │
│  - NO voice logic                                        │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┼───────────┬───────────┐
         ▼           ▼           ▼           ▼
    ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
    │Agent 1 │  │Agent 2 │  │Agent 3 │  │Agent 4 │
    │        │  │        │  │        │  │        │
    │┌──────┐│  │┌──────┐│  │┌──────┐│  │┌──────┐│
    ││Voice ││  ││Voice ││  ││Voice ││  ││Voice ││
    ││Side  ││  ││Side  ││  ││Side  ││  ││Side  ││
    ││Car   ││  ││Car   ││  ││Car   ││  ││Car   ││
    │└──┬───┘│  │└──┬───┘│  │└──┬───┘│  │└──┬───┘│
    │   ↓    │  │   ↓    │  │   ↓    │  │   ↓    │
    │┌──────┐│  │┌──────┐│  │┌──────┐│  │┌──────┐│
    ││Agent ││  ││Agent ││  ││Agent ││  ││Agent ││
    ││Core  ││  ││Core  ││  ││Core  ││  ││Core  ││
    │└──────┘│  │└──────┘│  │└──────┘│  │└──────┘│
    └────────┘  └────────┘  └────────┘  └────────┘
```

### Implementation Strategy

#### Phase 1: Extract Agent Core (1-2 days)
```typescript
// agents/src/agent-core.ts (NEW - Voice-Agnostic)
export class AgentCore {
  private graphExecutor: GraphExecutor;
  private toolsClient: ToolsClient;
  private personaLoader: PersonaLoader;
  
  constructor(config: AgentConfig) {
    this.graphExecutor = new GraphExecutor(config.workflow);
    this.toolsClient = new ToolsClient(config.toolsUrl);
    this.personaLoader = new PersonaLoader(config.personasDir);
  }
  
  async processMessage(input: {
    text: string;
    sessionId: string;
    context?: any;
  }): Promise<{
    text: string;
    toolCalls?: any[];
    metadata?: any;
  }> {
    // Pure business logic - no voice awareness
    const result = await this.graphExecutor.process({
      input: input.text,
      sessionId: input.sessionId,
      context: input.context
    });
    
    return {
      text: result.output,
      toolCalls: result.toolCalls,
      metadata: result.metadata
    };
  }
  
  async handleToolResult(toolResult: any): Promise<string> {
    // Process tool results
    return await this.graphExecutor.continueWithToolResult(toolResult);
  }
  
  getConfig(): {
    systemPrompt: string;
    voiceId: string;
    tools: any[];
  } {
    const persona = this.personaLoader.getCurrentPersona();
    return {
      systemPrompt: persona.systemPrompt,
      voiceId: persona.voiceId,
      tools: persona.allowedTools
    };
  }
}
```

#### Phase 2: Create Voice Side-Car (2-3 days)
```typescript
// agents/src/voice-sidecar.ts (NEW)
export class VoiceSideCar {
  private sonicClient: SonicClient;
  private agentCore: AgentCore;
  private sessionId: string;
  
  constructor(agentCore: AgentCore, awsConfig: any) {
    this.agentCore = agentCore;
    
    // Get voice config from agent
    const config = agentCore.getConfig();
    
    this.sonicClient = new SonicClient({
      ...awsConfig,
      systemPrompt: config.systemPrompt,
      voiceId: config.voiceId,
      tools: config.tools
    });
  }
  
  async attach(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    
    await this.sonicClient.startSession((event) => {
      this.handleVoiceEvent(event);
    });
  }
  
  private async handleVoiceEvent(event: SonicEvent) {
    if (event.type === 'transcript') {
      // Voice → Agent
      const response = await this.agentCore.processMessage({
        text: event.data.text,
        sessionId: this.sessionId
      });
      
      // Agent → Voice
      await this.sonicClient.sendText(response.text);
    }
    
    if (event.type === 'toolUse') {
      // Execute tool via agent
      const result = await this.agentCore.handleToolResult(event.data);
      await this.sonicClient.sendToolResult(event.data.toolUseId, result);
    }
    
    if (event.type === 'audio') {
      // Forward audio to client
      this.emit('audio', event.data.audio);
    }
  }
  
  async detach(): Promise<void> {
    await this.sonicClient.stopSession();
  }
}
```

#### Phase 3: Create Text Adapter (1 day)
```typescript
// agents/src/text-adapter.ts (NEW)
export class TextAdapter {
  private agentCore: AgentCore;
  private ws: WebSocket;
  
  constructor(agentCore: AgentCore, ws: WebSocket) {
    this.agentCore = agentCore;
    this.ws = ws;
  }
  
  async attach(sessionId: string): Promise<void> {
    this.ws.on('message', async (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'user_message') {
        // Text → Agent
        const response = await this.agentCore.processMessage({
          text: message.text,
          sessionId: sessionId
        });
        
        // Agent → Text
        this.ws.send(JSON.stringify({
          type: 'agent_response',
          text: response.text,
          sessionId: sessionId
        }));
      }
    });
  }
}
```

#### Phase 4: Unified Runtime (1 day)
```typescript
// agents/src/agent-runtime-unified.ts (REPLACES both runtimes)
const agentCore = new AgentCore({
  workflow: workflowDef,
  toolsUrl: LOCAL_TOOLS_URL,
  personasDir: PERSONAS_DIR
});

// Voice mode
if (process.env.MODE === 'voice') {
  const voiceSidecar = new VoiceSideCar(agentCore, awsConfig);
  await voiceSidecar.attach(sessionId);
}

// Text mode
if (process.env.MODE === 'text') {
  const textAdapter = new TextAdapter(agentCore, ws);
  await textAdapter.attach(sessionId);
}

// Or BOTH (hybrid)
if (process.env.MODE === 'hybrid') {
  const voiceSidecar = new VoiceSideCar(agentCore, awsConfig);
  const textAdapter = new TextAdapter(agentCore, ws);
  
  await Promise.all([
    voiceSidecar.attach(sessionId),
    textAdapter.attach(sessionId)
  ]);
}
```

---

## Benefits of Hybrid Approach

### ✅ Agent Reusability
```typescript
// Same agent core works everywhere
const agent = new AgentCore(config);

// Use with voice
new VoiceSideCar(agent, awsConfig);

// Use with text
new TextAdapter(agent, ws);

// Use with both
new VoiceSideCar(agent, awsConfig);
new TextAdapter(agent, ws);
```

### ✅ Low Latency
- Voice stays at agent level (no extra hop)
- Direct connection to Nova Sonic
- <500ms latency maintained

### ✅ Simple A2A Handoffs
```typescript
// Gateway just routes sessions
await router.handoffSession(sessionId, 'banking', 'disputes');

// Each agent's voice sidecar handles continuity
// No voice transfer logic needed
```

### ✅ Easy Testing
```typescript
// Test agent without voice
const agent = new AgentCore(config);
const result = await agent.processMessage({ text: 'test', sessionId: '123' });
expect(result.text).toBe('expected');

// Test with voice (integration test)
const voiceSidecar = new VoiceSideCar(agent, awsConfig);
await voiceSidecar.attach('123');
```

### ✅ Maintainability
- Single agent core (no duplication)
- Voice logic in one place (SonicClient + VoiceSideCar)
- Clear separation of concerns

---

## Migration Path

### Current State
```
agents/src/
├── agent-runtime-s2s.ts    (983 lines - DELETE)
├── agent-runtime.ts         (200 lines - DELETE)
├── sonic-client.ts          (1,636 lines - KEEP)
└── [shared modules]         (KEEP)
```

### Target State
```
agents/src/
├── agent-core.ts            (NEW - 300 lines)
├── voice-sidecar.ts         (NEW - 200 lines)
├── text-adapter.ts          (NEW - 100 lines)
├── agent-runtime-unified.ts (NEW - 150 lines)
├── sonic-client.ts          (KEEP - 1,636 lines)
└── [shared modules]         (KEEP)
```

### Steps
1. **Extract AgentCore** from agent-runtime-s2s.ts (remove voice logic)
2. **Create VoiceSideCar** wrapper around SonicClient
3. **Create TextAdapter** for WebSocket I/O
4. **Create UnifiedRuntime** that uses adapters
5. **Test** with existing agents
6. **Delete** old runtimes
7. **Document** new pattern

### Effort Estimate
- Phase 1: Extract AgentCore (1-2 days)
- Phase 2: Create VoiceSideCar (2-3 days)
- Phase 3: Create TextAdapter (1 day)
- Phase 4: Unified Runtime (1 day)
- Phase 5: Testing & Migration (2-3 days)

**Total: 1-2 weeks**

---

## Final Recommendation

### ✅ Use Hybrid Approach (Distributed Voice with Side-Car Pattern)

**Why?**
1. **Achieves your goal**: Any agent can be voice-enabled with ~10 lines
2. **Maintains performance**: No latency penalty from centralization
3. **Simplifies code**: Single agent core, multiple adapters
4. **Enables testing**: Test agents without voice
5. **Preserves features**: A2A handoffs, per-agent voice config
6. **Low risk**: Incremental refactoring, not rewrite

**Why NOT pure centralized?**
1. Latency concerns (extra hop)
2. Complex voice transfer during A2A
3. Loses per-agent voice customization
4. More gateway complexity

### Next Steps

1. **Review this analysis** - Confirm approach
2. **Start Phase 1** - Extract AgentCore
3. **Proof of concept** - Wrap one agent (banking)
4. **Iterate** - Test and refine
5. **Migrate** - Update remaining agents
6. **Document** - Create integration guide

---

## Questions to Resolve

1. **Should we support hybrid mode** (voice + text simultaneously)?
2. **How to handle voice config** (per-agent vs centralized)?
3. **A2A voice continuity** - Keep current approach or simplify?
4. **Testing strategy** - Unit tests for core, integration for voice?
5. **Packaging** - Monorepo or separate NPM packages?

Let me know your thoughts!
