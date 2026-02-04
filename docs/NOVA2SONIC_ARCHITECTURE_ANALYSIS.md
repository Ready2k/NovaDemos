# Nova2Sonic Architecture Analysis - Current Implementation

## Executive Summary

You've built a **HYBRID ARCHITECTURE** that implements Nova2Sonic at **BOTH the Gateway level AND the Agent level**, creating a sophisticated multi-agent system with voice capabilities. This is MORE advanced than a simple side-car pattern.

## Current Architecture Pattern

### **Three-Tier Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIER 1: Gateway Layer                         │
│                     (gateway/src/server.ts)                      │
│                                                                  │
│  - WebSocket routing & session management                       │
│  - Agent registry & discovery (Redis)                           │
│  - Session memory & context passing                             │
│  - Agent-to-Agent (A2A) handoff orchestration                   │
│  - Langfuse tracing                                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  SessionRouter: Manages session state & routing        │    │
│  │  AgentRegistry: Tracks healthy agents                  │    │
│  │  Memory Management: Verified users, intents, context   │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                          ↓ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                    TIER 2: Agent Layer                           │
│                  (agents/src/agent-runtime-s2s.ts)               │
│                                                                  │
│  Multiple specialized agents (triage, banking, IDV, etc.)       │
│  Each agent has:                                                │
│  - Own Nova2Sonic client (SonicClient)                          │
│  - LangGraph workflow executor (GraphExecutor)                  │
│  - Persona configuration (PersonaLoader)                        │
│  - Tool execution (banking, handoff tools)                      │
│  - Decision evaluation (DecisionEvaluator)                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Agent Instance (e.g., "triage")                       │    │
│  │  ├─ SonicClient: Voice I/O                             │    │
│  │  ├─ GraphExecutor: Workflow state machine              │    │
│  │  ├─ PersonaLoader: Persona-specific config             │    │
│  │  └─ ToolsClient: Tool execution                        │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                          ↓ AWS Bedrock
┌─────────────────────────────────────────────────────────────────┐
│                    TIER 3: AWS Services                          │
│                                                                  │
│  - Amazon Nova 2 Sonic (bidirectional streaming)                │
│  - AgentCore Gateway (tool execution)                           │
│  - Bedrock Runtime (LLM inference)                              │
│  - Local Tools Service (custom tools)                           │
└─────────────────────────────────────────────────────────────────┘
```

## What You've Actually Built

### ✅ **Gateway Pattern (Interface Level)**
- **Location**: `gateway/src/server.ts`
- **Purpose**: Routes sessions to appropriate agents
- **Responsibilities**:
  - WebSocket connection management
  - Agent discovery & health checks
  - Session routing & handoffs
  - Memory persistence (verified users, intents)
  - A2A protocol orchestration

### ✅ **Agent-Level Nova2Sonic Integration**
- **Location**: `agents/src/agent-runtime-s2s.ts` + `agents/src/sonic-client.ts`
- **Purpose**: Each agent has its own voice interface
- **Responsibilities**:
  - Bidirectional audio streaming per agent
  - Agent-specific system prompts & personas
  - Workflow-driven conversation flow
  - Tool execution (banking, handoffs)
  - Context injection from session memory

### ✅ **Reusable SonicClient Component**
- **Location**: `agents/src/sonic-client.ts`
- **Purpose**: Standalone Nova2Sonic wrapper
- **Features**:
  - Configurable system prompts
  - Tool configuration
  - Audio I/O handling
  - Event-driven architecture
  - Langfuse integration

## Architecture Comparison

### **Your Current Implementation vs. Original Backend**

| Aspect | Original Backend | Current Multi-Agent System |
|--------|------------------|---------------------------|
| **Nova2Sonic Integration** | Single instance in `backend/src/sonic-client.ts` | Multiple instances (one per agent) |
| **Tool Routing** | Centralized in `server.ts` | Distributed across agents |
| **Session Management** | In-memory Map | Redis-backed with persistence |
| **Agent Handoffs** | Not supported | Full A2A protocol with memory |
| **Scalability** | Single process | Multi-container, horizontally scalable |
| **Persona Support** | Basic | Advanced (PersonaLoader, workflow injection) |
| **Context Passing** | Limited | Rich (verified users, intents, graph state) |

## Good Things ✅

### 1. **Separation of Concerns**
- Gateway handles routing, agents handle business logic
- Clean abstraction layers
- Each agent is independently deployable

### 2. **Reusable SonicClient**
- Already extracted as standalone component
- Can be used by any agent
- Configurable and extensible

### 3. **Agent-to-Agent Handoffs**
- Sophisticated handoff protocol
- Memory preservation across handoffs
- Context injection (verified users, intents)
- Graph state hydration

### 4. **Scalability**
- Redis-backed session management
- Agent registry for discovery
- Health checks & heartbeats
- Docker-ready

### 5. **Workflow Integration**
- LangGraph-based state machines
- Decision evaluation with LLM
- Workflow-to-text conversion for prompts
- Node tracking & transitions

### 6. **Persona System**
- PersonaLoader for configuration
- Voice ID per persona
- Tool filtering per persona
- Prompt injection

## Bad Things / Limitations ❌

### 1. **Not a True Side-Car Pattern**
- **Issue**: Nova2Sonic is embedded IN each agent, not wrapped AROUND it
- **Impact**: Can't easily attach to existing non-voice agents
- **Why**: Agents are built voice-first, not voice-agnostic

### 2. **Tight Coupling to Voice**
- **Issue**: Agents assume voice I/O (audio buffers, transcripts)
- **Impact**: Can't reuse agents in text-only scenarios
- **Why**: No abstraction between agent logic and voice layer

### 3. **Duplicated SonicClient Code**
- **Issue**: `backend/src/sonic-client.ts` vs `agents/src/sonic-client.ts`
- **Impact**: Maintenance burden, potential drift
- **Why**: Two separate implementations for same functionality

### 4. **Complex Initialization**
- **Issue**: Multi-step session setup (gateway → agent → Nova)
- **Impact**: Race conditions, timing issues
- **Why**: Three-tier architecture with async handoffs

### 5. **No Agent Interface Contract**
- **Issue**: Agents don't implement a common interface
- **Impact**: Hard to add new agents, no type safety
- **Why**: Organic growth without formal abstraction

### 6. **Memory Management Complexity**
- **Issue**: Session memory split between Gateway (Redis) and Agent (in-memory)
- **Impact**: Potential inconsistencies, hard to debug
- **Why**: Distributed state without clear ownership

### 7. **Tool Execution Split**
- **Issue**: Some tools in agents, some in gateway, some in backend
- **Impact**: Unclear where to add new tools
- **Why**: Evolved architecture without consolidation

## Your Goal: Repeatable Side-Car Pattern

### **What You Want:**
```
┌─────────────────────────────────────────────────────────┐
│           Nova2Sonic Side-Car Wrapper                    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Voice Interface Layer                          │    │
│  │  - Audio → Text transcription                  │    │
│  │  - Text → Audio synthesis                      │    │
│  │  - Tool call detection                         │    │
│  └────────────────────────────────────────────────┘    │
│                      ↓                                   │
│  ┌────────────────────────────────────────────────┐    │
│  │  Agent Adapter (Interface)                     │    │
│  │  - processMessage(text) → agent                │    │
│  │  - handleToolCall(tool, params) → agent        │    │
│  │  - getSystemPrompt() → agent                   │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                      ↓
          ┌───────────────────────┐
          │  ANY Existing Agent    │
          │  - LangGraph agent     │
          │  - LangChain agent     │
          │  - Custom logic        │
          │  - Text-based agent    │
          └───────────────────────┘
```

### **What You Have:**
```
┌─────────────────────────────────────────────────────────┐
│              Voice-First Agent                           │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  SonicClient (embedded)                        │    │
│  │  - Audio I/O                                   │    │
│  │  - Tool detection                              │    │
│  └────────────────────────────────────────────────┘    │
│                      ↓                                   │
│  ┌────────────────────────────────────────────────┐    │
│  │  Agent Logic (tightly coupled)                 │    │
│  │  - GraphExecutor                               │    │
│  │  - PersonaLoader                               │    │
│  │  - ToolsClient                                 │    │
│  │  - DecisionEvaluator                           │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Gap Analysis

| Requirement | Current State | Gap |
|-------------|---------------|-----|
| **Reusable across agents** | ❌ Each agent has embedded SonicClient | Need to extract voice layer |
| **Agent-agnostic** | ❌ Agents are voice-first | Need interface abstraction |
| **Attach to existing agents** | ❌ Requires rewrite | Need adapter pattern |
| **Text-only fallback** | ❌ Voice is required | Need I/O abstraction |
| **Simple integration** | ❌ Complex multi-tier setup | Need simplified API |
| **Single source of truth** | ❌ Duplicated SonicClient | Need shared package |

## Recommended Refactoring Path

### **Phase 1: Extract Voice Layer (2-3 days)**

1. **Create `@voice-s2s/sonic-adapter` package**
   ```typescript
   // packages/sonic-adapter/src/index.ts
   export class Nova2SonicAdapter {
     constructor(config: SonicConfig) { }
     
     async start(onMessage: (text: string) => void): Promise<void> { }
     async speak(text: string): Promise<void> { }
     async handleToolCall(tool: string, params: any): Promise<any> { }
     async stop(): Promise<void> { }
   }
   ```

2. **Define Agent Interface**
   ```typescript
   // packages/sonic-adapter/src/agent-interface.ts
   export interface VoiceAgentInterface {
     processMessage(text: string): Promise<string>;
     handleToolCall(tool: string, params: any): Promise<any>;
     getSystemPrompt(): string;
     getAvailableTools(): Tool[];
     getVoiceConfig(): { voiceId: string; language: string };
   }
   ```

3. **Create Side-Car Wrapper**
   ```typescript
   // packages/sonic-adapter/src/sidecar.ts
   export class Nova2SonicSideCar {
     constructor(agent: VoiceAgentInterface) {
       this.agent = agent;
       this.adapter = new Nova2SonicAdapter({
         systemPrompt: agent.getSystemPrompt(),
         tools: agent.getAvailableTools(),
         voiceId: agent.getVoiceConfig().voiceId
       });
     }
     
     async start() {
       await this.adapter.start(async (text) => {
         const response = await this.agent.processMessage(text);
         await this.adapter.speak(response);
       });
     }
   }
   ```

### **Phase 2: Adapt Existing Agents (1-2 days per agent)**

1. **Create Agent Wrapper**
   ```typescript
   // agents/src/adapters/banking-agent-adapter.ts
   export class BankingAgentAdapter implements VoiceAgentInterface {
     private graphExecutor: GraphExecutor;
     private personaLoader: PersonaLoader;
     
     async processMessage(text: string): Promise<string> {
       // Your existing banking logic
       return await this.graphExecutor.processInput(text);
     }
     
     async handleToolCall(tool: string, params: any): Promise<any> {
       // Route to appropriate tool handler
       return await this.toolsClient.executeTool(tool, params);
     }
     
     getSystemPrompt(): string {
       return this.personaLoader.getPrompt('banking');
     }
     
     getAvailableTools(): Tool[] {
       return generateBankingTools();
     }
     
     getVoiceConfig() {
       return { voiceId: 'matthew', language: 'en-US' };
     }
   }
   ```

2. **Update Agent Runtime**
   ```typescript
   // agents/src/agent-runtime-s2s.ts (refactored)
   const bankingAgent = new BankingAgentAdapter(config);
   const sidecar = new Nova2SonicSideCar(bankingAgent);
   await sidecar.start();
   ```

### **Phase 3: Consolidate & Simplify (2-3 days)**

1. **Merge SonicClient implementations**
   - Keep `agents/src/sonic-client.ts` as source of truth
   - Remove `backend/src/sonic-client.ts`
   - Update backend to use shared package

2. **Simplify Gateway**
   - Remove voice-specific logic
   - Focus on routing & session management
   - Let agents handle all voice I/O

3. **Create Agent Template**
   - Provide boilerplate for new agents
   - Include interface implementation
   - Document integration steps

### **Phase 4: Test & Document (1-2 days)**

1. **Test existing agents with new pattern**
2. **Create migration guide**
3. **Document side-car API**
4. **Provide examples**

## Benefits of Refactoring

### ✅ **Reusability**
- Attach Nova2Sonic to ANY agent with 10 lines of code
- Use same voice layer across all agents
- Share improvements across system

### ✅ **Maintainability**
- Single SonicClient implementation
- Clear separation of concerns
- Easier to debug & test

### ✅ **Flexibility**
- Support text-only agents
- Easy to swap voice providers
- Agent logic independent of I/O

### ✅ **Scalability**
- Add new agents without touching voice code
- Horizontal scaling of agents
- Independent deployment

### ✅ **Developer Experience**
- Simple API for agent developers
- Type-safe interfaces
- Clear documentation

## Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Extract Voice Layer | 2-3 days | HIGH |
| Phase 2: Adapt Existing Agents | 1-2 days per agent | MEDIUM |
| Phase 3: Consolidate & Simplify | 2-3 days | MEDIUM |
| Phase 4: Test & Document | 1-2 days | HIGH |
| **Total** | **1-2 weeks** | - |

## Conclusion

You've built a sophisticated multi-agent voice system that's MORE advanced than a simple side-car pattern. However, it's not yet a **repeatable** side-car that can be attached to existing agents.

The good news: You have all the pieces! The SonicClient is already well-abstracted, and your agent architecture is solid. You just need to:

1. **Extract** the voice layer into a standalone package
2. **Define** a clear agent interface
3. **Create** adapter wrappers for existing agents
4. **Consolidate** the duplicated code

This will give you the best of both worlds: the sophistication of your current system with the reusability of a true side-car pattern.

## Next Steps

Would you like me to:
1. **Start Phase 1**: Create the `@voice-s2s/sonic-adapter` package?
2. **Create a proof-of-concept**: Show how to wrap one existing agent?
3. **Document the interface**: Define the `VoiceAgentInterface` contract?
4. **Analyze specific agents**: Deep-dive into banking or triage agent for migration?

Let me know which direction you'd like to take!
