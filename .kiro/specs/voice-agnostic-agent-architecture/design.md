# Design Document: Voice-Agnostic Agent Architecture

## Overview

This design implements a Voice Side-Car Pattern that decouples agent business logic from I/O mechanisms. The architecture consists of four main components:

1. **Agent Core** - Voice-agnostic LangGraph business logic
2. **Voice Side-Car** - Wraps Agent Core with voice I/O via SonicClient
3. **Text Adapter** - Wraps Agent Core with WebSocket text I/O
4. **Unified Runtime** - Single entry point supporting voice, text, or hybrid modes

The key insight is that agent business logic (workflow execution, tool calling, state management) is fundamentally the same whether the user is speaking or typing. Only the I/O layer differs. By extracting the core logic and wrapping it with thin adapters, we enable developers to write agents once and deploy them in any mode.

### Design Goals

- **Separation of Concerns**: Business logic independent of I/O mechanism
- **Code Reuse**: Write once, deploy in voice, text, or hybrid modes
- **Easy Extension**: Add new agents with ~10 lines of configuration
- **Backward Compatibility**: Existing agents migrate seamlessly
- **Code Reduction**: Net reduction of ~433 lines by eliminating duplication

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Unified Runtime                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Mode Selection (ENV: MODE = voice | text | hybrid)   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Voice        │    │ Text         │    │ Hybrid       │
│ Side-Car     │    │ Adapter      │    │ (Both)       │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Agent Core   │
                    │ (Business    │
                    │  Logic)      │
                    └──────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ LangGraph    │    │ Tool         │    │ Gateway      │
│ Executor     │    │ Execution    │    │ Integration  │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Component Interaction Flow

**Voice Mode:**
```
User Audio → WebSocket → Voice Side-Car → SonicClient → Nova Sonic
                              ↓
                         Agent Core
                              ↓
                    Tool Execution / Handoffs
                              ↓
Nova Sonic → SonicClient → Voice Side-Car → WebSocket → User Audio
```

**Text Mode:**
```
User Text → WebSocket → Text Adapter → Agent Core
                                           ↓
                                  Tool Execution / Handoffs
                                           ↓
                        Agent Core → Text Adapter → WebSocket → User Text
```

**Hybrid Mode:**
```
User (Audio/Text) → WebSocket → Voice Side-Car + Text Adapter → Agent Core
                                                                      ↓
                                                            Tool Execution / Handoffs
                                                                      ↓
                                  Agent Core → Voice Side-Car + Text Adapter → WebSocket → User (Audio/Text)
```

## Components and Interfaces

### 1. Agent Core Interface

The Agent Core provides a voice-agnostic interface for agent business logic.

```typescript
interface AgentCoreConfig {
  agentId: string;
  workflowDef: WorkflowDefinition;
  personaConfig: PersonaConfig | null;
  toolsClient: ToolsClient;
  decisionEvaluator: DecisionEvaluator;
  graphExecutor: GraphExecutor | null;
}

interface SessionContext {
  sessionId: string;
  startTime: number;
  messages: any[];
  currentNode?: string;
  verifiedUser?: {
    customer_name: string;
    account: string;
    sortCode: string;
    auth_status: string;
  };
  userIntent?: string;
  graphState?: any;
}

interface AgentCore {
  // Session Management
  initializeSession(sessionId: string, memory?: any): SessionContext;
  getSession(sessionId: string): SessionContext | undefined;
  endSession(sessionId: string): void;
  
  // Message Processing
  processUserMessage(sessionId: string, message: string): Promise<AgentResponse>;
  
  // Tool Execution
  executeTool(sessionId: string, toolName: string, toolInput: any, toolUseId: string): Promise<ToolResult>;
  
  // Handoff Management
  requestHandoff(sessionId: string, targetAgent: string, context: any): HandoffRequest;
  
  // State Management
  updateSessionMemory(sessionId: string, memory: any): void;
  getSessionMemory(sessionId: string): any;
  
  // Workflow Management
  updateWorkflowState(sessionId: string, nodeId: string): WorkflowUpdate;
  
  // Configuration
  getSystemPrompt(sessionId: string): string;
  getPersonaConfig(): PersonaConfig | null;
  getWorkflowDefinition(): WorkflowDefinition | null;
}

interface AgentResponse {
  type: 'text' | 'tool_call' | 'handoff' | 'error';
  content: string;
  toolCalls?: ToolCall[];
  handoffRequest?: HandoffRequest;
  error?: string;
}

interface ToolResult {
  success: boolean;
  result: any;
  error?: string;
}

interface HandoffRequest {
  targetAgentId: string;
  context: any;
  graphState: any;
}

interface WorkflowUpdate {
  currentNode: string;
  previousNode?: string;
  nextNodes: any[];
  validTransition: boolean;
}
```

### 2. Voice Side-Car Interface

The Voice Side-Car wraps Agent Core with voice I/O using SonicClient.

```typescript
interface VoiceSideCarConfig {
  agentCore: AgentCore;
  sonicConfig: SonicConfig;
}

interface VoiceSideCar {
  // Session Management
  startVoiceSession(sessionId: string, ws: WebSocket, memory?: any): Promise<void>;
  stopVoiceSession(sessionId: string): Promise<void>;
  
  // Audio I/O
  handleAudioChunk(sessionId: string, audioBuffer: Buffer): Promise<void>;
  endAudioInput(sessionId: string): Promise<void>;
  
  // Text Input (for hybrid mode)
  handleTextInput(sessionId: string, text: string): Promise<void>;
  
  // Event Handling
  handleSonicEvent(sessionId: string, event: SonicEvent): Promise<void>;
  
  // Configuration
  updateSessionConfig(sessionId: string, config: any): void;
}
```

### 3. Text Adapter Interface

The Text Adapter wraps Agent Core with WebSocket text I/O.

```typescript
interface TextAdapterConfig {
  agentCore: AgentCore;
}

interface TextAdapter {
  // Session Management
  startTextSession(sessionId: string, ws: WebSocket, memory?: any): void;
  stopTextSession(sessionId: string): void;
  
  // Message Handling
  handleUserInput(sessionId: string, text: string): Promise<void>;
  
  // Response Sending
  sendResponse(sessionId: string, response: AgentResponse): void;
  sendToolResult(sessionId: string, toolName: string, result: any): void;
  sendHandoffRequest(sessionId: string, handoff: HandoffRequest): void;
  sendError(sessionId: string, error: string): void;
}
```

### 4. Unified Runtime Interface

The Unified Runtime provides a single entry point that supports all modes.

```typescript
type RuntimeMode = 'voice' | 'text' | 'hybrid';

interface UnifiedRuntimeConfig {
  mode: RuntimeMode;
  agentId: string;
  agentPort: number;
  workflowFile: string;
  awsConfig?: SonicConfig;
}

interface UnifiedRuntime {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // Gateway Integration
  registerWithGateway(): Promise<void>;
  sendHeartbeat(): Promise<void>;
  
  // Session Handling
  handleConnection(ws: WebSocket): void;
  handleMessage(sessionId: string, data: Buffer, isBinary: boolean): Promise<void>;
  handleDisconnect(sessionId: string): Promise<void>;
}
```

## Data Models

### Session State Model

```typescript
interface SessionState {
  // Identity
  sessionId: string;
  agentId: string;
  
  // Timing
  startTime: number;
  lastActivity: number;
  
  // Communication
  ws: WebSocket;
  mode: 'voice' | 'text' | 'hybrid';
  
  // Agent State
  messages: Message[];
  currentNode?: string;
  graphState?: any;
  
  // User Context
  verifiedUser?: VerifiedUser;
  userIntent?: string;
  
  // Voice-Specific (if mode includes voice)
  sonicClient?: SonicClient;
  
  // Workflow
  graphExecutor?: GraphExecutor;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: any;
}

interface VerifiedUser {
  customer_name: string;
  account: string;
  sortCode: string;
  auth_status: 'VERIFIED' | 'FAILED';
}
```

### Tool Execution Model

```typescript
interface ToolCall {
  toolName: string;
  toolUseId: string;
  input: any;
  timestamp: number;
}

interface ToolExecution {
  toolCall: ToolCall;
  result: any;
  success: boolean;
  error?: string;
  duration: number;
  executionMode: 'local-tools' | 'agentcore' | 'handoff';
}
```

### Handoff Model

```typescript
interface HandoffContext {
  // Source
  fromAgent: string;
  
  // Target
  targetAgent: string;
  targetPersonaId: string;
  
  // Context
  reason?: string;
  lastUserMessage?: string;
  userIntent?: string;
  
  // User State
  verified?: boolean;
  userName?: string;
  account?: string;
  sortCode?: string;
  
  // Return Handoff
  isReturn?: boolean;
  taskCompleted?: string;
  summary?: string;
  
  // Full State
  graphState?: any;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Core Architecture Properties

**Property 1: Agent Core I/O Independence**
*For any* workflow execution in Agent_Core, the execution should complete successfully without requiring SonicClient, WebSocket, or any other I/O-specific dependencies.
**Validates: Requirements 1.2, 1.4, 1.5**

**Property 2: Adapter Forwarding Consistency**
*For any* message or event received by an adapter (Voice_SideCar or Text_Adapter), the adapter should forward it to Agent_Core, and for any Agent_Core response, the adapter should forward it to the client.
**Validates: Requirements 2.2, 2.3, 2.6, 3.2, 3.3, 3.7**

**Property 3: Session State Persistence**
*For any* session operation (message processing, tool execution, handoff), the session state should be maintained and accessible for subsequent operations within the same session.
**Validates: Requirements 1.7, 4.8**

**Property 4: SonicClient Lifecycle Management**
*For any* voice session, starting the session should initialize SonicClient, and stopping the session should cleanly terminate SonicClient without resource leaks.
**Validates: Requirements 2.5**

**Property 5: Text Session Lifecycle Management**
*For any* text session, starting the session should initialize WebSocket handlers, and stopping the session should cleanly remove handlers and free resources.
**Validates: Requirements 3.4**

### Tool Execution Properties

**Property 6: Tool Execution Pipeline**
*For any* tool call, the system should validate input against schema, route to the appropriate service (local-tools or AgentCore), execute the tool, and return results to the LLM.
**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

**Property 7: Tool Error Handling**
*For any* tool execution that fails, the system should return an error result to the LLM with a descriptive error message instead of crashing.
**Validates: Requirements 8.5, 12.2**

**Property 8: Tool Result Caching**
*For any* cacheable tool, executing the same tool with the same input twice should return the cached result on the second call without re-executing.
**Validates: Requirements 8.6**

### Handoff Properties

**Property 9: Handoff Detection and Routing**
*For any* tool call with a handoff tool name (transfer_to_*, return_to_triage), the system should detect it as a handoff, extract context (reason, verified user, user intent), and send a handoff_request to Gateway with full LangGraph state.
**Validates: Requirements 9.1, 9.2, 9.3, 9.4**

**Property 10: Handoff Context Preservation**
*For any* handoff request with verified user data or user intent, that data should be included in the handoff context and preserved when the target agent receives the session.
**Validates: Requirements 9.5, 9.6**

**Property 11: Return Handoff Completion Status**
*For any* return handoff (return_to_triage), the handoff context should include task completion status and summary.
**Validates: Requirements 9.7**

### Session Memory Properties

**Property 12: Memory Storage After IDV**
*For any* successful IDV check (auth_status === 'VERIFIED'), the system should store verified user data (customer_name, account, sortCode) in session memory.
**Validates: Requirements 10.1**

**Property 13: Memory Restoration on Session Init**
*For any* session initialization with existing memory from Gateway, the system should restore that memory into the session context before processing begins.
**Validates: Requirements 10.3**

**Property 14: Memory Synchronization**
*For any* session memory update, the system should notify Gateway via update_memory message to keep Gateway's memory in sync.
**Validates: Requirements 10.4**

**Property 15: Context Injection into Prompts**
*For any* session with verified user or user intent in memory, that context should be injected into the system prompt so the LLM is aware of it.
**Validates: Requirements 10.5**

**Property 16: Memory Cleanup on Session End**
*For any* session that ends, the session memory should be cleared to prevent memory leaks and data persistence across sessions.
**Validates: Requirements 10.7**

### Observability Properties

**Property 17: Session Event Tracking**
*For any* session, the system should track session start and session end events in Langfuse with session metadata.
**Validates: Requirements 11.2**

**Property 18: Message Tracking**
*For any* user input or assistant response, the system should track it in Langfuse with role, content, and timestamp.
**Validates: Requirements 11.3**

**Property 19: Tool Invocation Tracking**
*For any* tool invocation, the system should track the tool name, input, result, and execution time in Langfuse.
**Validates: Requirements 11.4**

**Property 20: Latency Tracking**
*For any* assistant response, the system should track time to first token and total duration in Langfuse metadata.
**Validates: Requirements 11.5**

**Property 21: Token Usage Tracking**
*For any* LLM call, the system should track input tokens, output tokens, and total tokens in Langfuse.
**Validates: Requirements 11.6**

**Property 22: Error and Interruption Tracking**
*For any* interruption or error, the system should track it as an event in Langfuse with context and severity level.
**Validates: Requirements 11.7**

### Error Handling Properties

**Property 23: Voice Session Startup Error Handling**
*For any* SonicClient startup failure, the system should send an error message to the client instead of leaving the session in a broken state.
**Validates: Requirements 12.1**

**Property 24: Connection Drop Cleanup**
*For any* WebSocket connection drop, the system should gracefully clean up the session, stop SonicClient (if voice mode), and free resources.
**Validates: Requirements 12.3**

**Property 25: Workflow Execution Error Handling**
*For any* workflow execution failure, the system should log the error with stack trace and notify the client with an error message.
**Validates: Requirements 12.4, 12.7**

**Property 26: Missing Configuration Error Handling**
*For any* missing workflow or persona file, the system should provide a clear error message indicating which file is missing and where it was expected.
**Validates: Requirements 12.6**

## Error Handling

### Error Categories

1. **Configuration Errors**
   - Missing workflow file
   - Missing persona file
   - Invalid JSON in configuration files
   - Missing AWS credentials (voice mode only)
   - Invalid MODE environment variable

2. **Runtime Errors**
   - SonicClient startup failure
   - WebSocket connection drop
   - Tool execution failure
   - Workflow execution failure
   - LangGraph state corruption

3. **Integration Errors**
   - Gateway registration failure
   - Gateway heartbeat failure
   - Tool service unavailable (local-tools, AgentCore)
   - Langfuse connection failure

### Error Handling Strategy

**Configuration Errors:**
- Validate configuration on startup
- Fail fast with clear error messages
- Log missing files with expected paths
- Exit process for critical configuration errors (AWS credentials in voice mode)

**Runtime Errors:**
- Catch errors at adapter boundaries (Voice_SideCar, Text_Adapter)
- Send error messages to client via WebSocket
- Log errors with full stack traces
- Clean up resources (stop SonicClient, close WebSocket)
- Keep session state consistent (don't leave partial state)

**Integration Errors:**
- Retry Gateway registration with exponential backoff
- Continue operation if Langfuse unavailable (observability is optional)
- Return tool errors to LLM (let LLM handle gracefully)
- Log integration failures for debugging

### Error Recovery

**Voice Session Errors:**
```typescript
try {
  await sonicClient.startSession(onEvent, sessionId);
} catch (error) {
  console.error('[VoiceSideCar] Failed to start voice session:', error);
  ws.send(JSON.stringify({
    type: 'error',
    message: 'Failed to start voice session',
    details: error.message
  }));
  // Clean up session
  activeSessions.delete(sessionId);
}
```

**Tool Execution Errors:**
```typescript
try {
  const result = await toolsClient.execute(toolName, toolInput);
  await agentCore.sendToolResult(sessionId, toolUseId, result, false);
} catch (error) {
  console.error('[AgentCore] Tool execution failed:', error);
  await agentCore.sendToolResult(sessionId, toolUseId, {
    error: error.message
  }, true);
}
```

**WebSocket Errors:**
```typescript
ws.on('error', (error) => {
  console.error('[Adapter] WebSocket error:', error);
  // Clean up session
  if (sessionId) {
    agentCore.endSession(sessionId);
    if (voiceSideCar) {
      voiceSideCar.stopVoiceSession(sessionId);
    }
  }
});
```

## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs
- Both are complementary and necessary for comprehensive coverage

### Unit Testing Balance

Unit tests are helpful for specific examples and edge cases, but we avoid writing too many unit tests since property-based tests handle covering lots of inputs. Unit tests should focus on:

- Specific examples that demonstrate correct behavior
- Integration points between components
- Edge cases and error conditions

Property tests should focus on:

- Universal properties that hold for all inputs
- Comprehensive input coverage through randomization

### Property-Based Testing Configuration

- Use **fast-check** library for TypeScript property-based testing
- Configure each test to run minimum **100 iterations** (due to randomization)
- Each property test must reference its design document property
- Tag format: **Feature: voice-agnostic-agent-architecture, Property {number}: {property_text}**
- Each correctness property MUST be implemented by a SINGLE property-based test

### Test Organization

```
agents/
├── src/
│   ├── agent-core.ts
│   ├── voice-sidecar.ts
│   ├── text-adapter.ts
│   └── agent-runtime-unified.ts
├── tests/
│   ├── unit/
│   │   ├── agent-core.test.ts
│   │   ├── voice-sidecar.test.ts
│   │   ├── text-adapter.test.ts
│   │   └── unified-runtime.test.ts
│   ├── property/
│   │   ├── agent-core.property.test.ts
│   │   ├── adapters.property.test.ts
│   │   ├── tool-execution.property.test.ts
│   │   ├── handoffs.property.test.ts
│   │   └── session-memory.property.test.ts
│   ├── integration/
│   │   ├── voice-mode.integration.test.ts
│   │   ├── text-mode.integration.test.ts
│   │   └── hybrid-mode.integration.test.ts
│   └── fixtures/
│       ├── mock-sonic-client.ts
│       ├── mock-websocket.ts
│       ├── test-workflows.ts
│       └── test-personas.ts
```

### Unit Test Examples

**Agent Core Session Management:**
```typescript
describe('AgentCore Session Management', () => {
  it('should initialize session with memory', () => {
    const agentCore = new AgentCore(config);
    const memory = { verified: true, userName: 'John Doe' };
    const session = agentCore.initializeSession('session-123', memory);
    
    expect(session.sessionId).toBe('session-123');
    expect(session.verifiedUser?.customer_name).toBe('John Doe');
  });
  
  it('should end session and clear memory', () => {
    const agentCore = new AgentCore(config);
    agentCore.initializeSession('session-123');
    agentCore.endSession('session-123');
    
    expect(agentCore.getSession('session-123')).toBeUndefined();
  });
});
```

**Voice Side-Car Audio Forwarding:**
```typescript
describe('VoiceSideCar Audio Forwarding', () => {
  it('should forward audio chunks to SonicClient', async () => {
    const mockSonicClient = new MockSonicClient();
    const voiceSideCar = new VoiceSideCar({ agentCore, sonicClient: mockSonicClient });
    
    const audioBuffer = Buffer.alloc(3200); // 100ms of audio
    await voiceSideCar.handleAudioChunk('session-123', audioBuffer);
    
    expect(mockSonicClient.receivedChunks).toHaveLength(1);
    expect(mockSonicClient.receivedChunks[0]).toEqual(audioBuffer);
  });
});
```

### Property-Based Test Examples

**Property 1: Agent Core I/O Independence**
```typescript
// Feature: voice-agnostic-agent-architecture, Property 1: Agent Core I/O Independence
describe('Property 1: Agent Core I/O Independence', () => {
  it('should execute workflows without I/O dependencies', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionId: fc.uuid(),
          userMessage: fc.string({ minLength: 1, maxLength: 200 }),
          workflowDef: fc.constant(testWorkflow)
        }),
        async ({ sessionId, userMessage, workflowDef }) => {
          const agentCore = new AgentCore({
            agentId: 'test-agent',
            workflowDef,
            personaConfig: null,
            toolsClient: mockToolsClient,
            decisionEvaluator: mockDecisionEvaluator,
            graphExecutor: new GraphExecutor(workflowDef)
          });
          
          agentCore.initializeSession(sessionId);
          const response = await agentCore.processUserMessage(sessionId, userMessage);
          
          // Should complete without throwing
          expect(response).toBeDefined();
          expect(response.type).toMatch(/text|tool_call|handoff|error/);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 6: Tool Execution Pipeline**
```typescript
// Feature: voice-agnostic-agent-architecture, Property 6: Tool Execution Pipeline
describe('Property 6: Tool Execution Pipeline', () => {
  it('should validate, route, execute, and return tool results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionId: fc.uuid(),
          toolName: fc.constantFrom('check_balance', 'get_transactions', 'perform_idv_check'),
          toolInput: fc.object(),
          toolUseId: fc.uuid()
        }),
        async ({ sessionId, toolName, toolInput, toolUseId }) => {
          const agentCore = new AgentCore(config);
          agentCore.initializeSession(sessionId);
          
          const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
          
          // Should complete pipeline
          expect(result).toBeDefined();
          expect(result.success).toBeDefined();
          if (result.success) {
            expect(result.result).toBeDefined();
          } else {
            expect(result.error).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 9: Handoff Detection and Routing**
```typescript
// Feature: voice-agnostic-agent-architecture, Property 9: Handoff Detection and Routing
describe('Property 9: Handoff Detection and Routing', () => {
  it('should detect handoffs and extract full context', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionId: fc.uuid(),
          handoffTool: fc.constantFrom('transfer_to_banking', 'transfer_to_idv', 'return_to_triage'),
          reason: fc.string({ minLength: 10, maxLength: 100 }),
          verifiedUser: fc.option(fc.record({
            customer_name: fc.fullName(),
            account: fc.string({ minLength: 8, maxLength: 8 }),
            sortCode: fc.string({ minLength: 6, maxLength: 6 })
          }), { nil: null })
        }),
        async ({ sessionId, handoffTool, reason, verifiedUser }) => {
          const agentCore = new AgentCore(config);
          const session = agentCore.initializeSession(sessionId);
          if (verifiedUser) {
            session.verifiedUser = { ...verifiedUser, auth_status: 'VERIFIED' };
          }
          
          const targetAgent = getTargetAgentFromTool(handoffTool);
          const handoff = agentCore.requestHandoff(sessionId, targetAgent, { reason });
          
          // Should extract full context
          expect(handoff.targetAgentId).toBeDefined();
          expect(handoff.context.reason).toBe(reason);
          expect(handoff.graphState).toBeDefined();
          if (verifiedUser) {
            expect(handoff.context.verified).toBe(true);
            expect(handoff.context.userName).toBe(verifiedUser.customer_name);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 12: Memory Storage After IDV**
```typescript
// Feature: voice-agnostic-agent-architecture, Property 12: Memory Storage After IDV
describe('Property 12: Memory Storage After IDV', () => {
  it('should store verified user data after successful IDV', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionId: fc.uuid(),
          customer_name: fc.fullName(),
          account: fc.string({ minLength: 8, maxLength: 8 }),
          sortCode: fc.string({ minLength: 6, maxLength: 6 })
        }),
        async ({ sessionId, customer_name, account, sortCode }) => {
          const agentCore = new AgentCore(config);
          agentCore.initializeSession(sessionId);
          
          // Simulate IDV tool result
          const idvResult = {
            auth_status: 'VERIFIED',
            customer_name
          };
          
          await agentCore.executeTool(sessionId, 'perform_idv_check', {
            accountNumber: account,
            sortCode
          }, 'idv-123');
          
          // Should store in session memory
          const session = agentCore.getSession(sessionId);
          expect(session?.verifiedUser).toBeDefined();
          expect(session?.verifiedUser?.customer_name).toBe(customer_name);
          expect(session?.verifiedUser?.account).toBe(account);
          expect(session?.verifiedUser?.sortCode).toBe(sortCode);
          expect(session?.verifiedUser?.auth_status).toBe('VERIFIED');
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Integration Test Examples

**Voice Mode End-to-End:**
```typescript
describe('Voice Mode Integration', () => {
  it('should handle complete voice interaction flow', async () => {
    const runtime = new UnifiedRuntime({
      mode: 'voice',
      agentId: 'test-agent',
      agentPort: 8081,
      workflowFile: './test-workflow.json',
      awsConfig: testAwsConfig
    });
    
    await runtime.start();
    
    // Simulate client connection
    const ws = new MockWebSocket();
    runtime.handleConnection(ws);
    
    // Send session init
    await runtime.handleMessage('session-123', Buffer.from(JSON.stringify({
      type: 'session_init',
      sessionId: 'session-123'
    })), false);
    
    // Send audio chunk
    const audioBuffer = Buffer.alloc(3200);
    await runtime.handleMessage('session-123', audioBuffer, true);
    
    // Should receive audio response
    expect(ws.sentMessages.some(m => Buffer.isBuffer(m))).toBe(true);
    
    await runtime.stop();
  });
});
```

**Text Mode End-to-End:**
```typescript
describe('Text Mode Integration', () => {
  it('should handle complete text interaction flow', async () => {
    const runtime = new UnifiedRuntime({
      mode: 'text',
      agentId: 'test-agent',
      agentPort: 8081,
      workflowFile: './test-workflow.json'
    });
    
    await runtime.start();
    
    // Simulate client connection
    const ws = new MockWebSocket();
    runtime.handleConnection(ws);
    
    // Send session init
    await runtime.handleMessage('session-123', Buffer.from(JSON.stringify({
      type: 'session_init',
      sessionId: 'session-123'
    })), false);
    
    // Send text input
    await runtime.handleMessage('session-123', Buffer.from(JSON.stringify({
      type: 'user_input',
      text: 'Check my balance'
    })), false);
    
    // Should receive text response
    const responses = ws.sentMessages.filter(m => {
      const msg = JSON.parse(m.toString());
      return msg.type === 'transcript' && msg.role === 'assistant';
    });
    expect(responses.length).toBeGreaterThan(0);
    
    await runtime.stop();
  });
});
```

### Test Fixtures

**Mock SonicClient:**
```typescript
export class MockSonicClient implements SonicClient {
  receivedChunks: Buffer[] = [];
  receivedTexts: string[] = [];
  eventCallback?: (event: SonicEvent) => void;
  
  async startSession(onEvent: (event: SonicEvent) => void, sessionId: string): Promise<void> {
    this.eventCallback = onEvent;
  }
  
  async sendAudioChunk(chunk: AudioChunk): Promise<void> {
    this.receivedChunks.push(chunk.buffer);
  }
  
  async sendText(text: string): Promise<void> {
    this.receivedTexts.push(text);
  }
  
  async stopSession(): Promise<void> {
    this.receivedChunks = [];
    this.receivedTexts = [];
    this.eventCallback = undefined;
  }
  
  emitEvent(event: SonicEvent): void {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }
}
```

**Mock WebSocket:**
```typescript
export class MockWebSocket {
  sentMessages: (Buffer | string)[] = [];
  readyState: number = 1; // OPEN
  
  send(data: Buffer | string): void {
    this.sentMessages.push(data);
  }
  
  close(): void {
    this.readyState = 3; // CLOSED
  }
  
  on(event: string, handler: Function): void {
    // Store handlers for testing
  }
}
```

### Migration Testing

To ensure backward compatibility, we'll create migration tests that verify existing agents work with the new architecture:

```typescript
describe('Migration Compatibility', () => {
  const existingAgents = ['triage', 'banking', 'idv', 'disputes'];
  
  existingAgents.forEach(agentId => {
    it(`should migrate ${agentId} agent successfully`, async () => {
      const runtime = new UnifiedRuntime({
        mode: 'voice',
        agentId,
        agentPort: 8081,
        workflowFile: `./workflows/workflow-${agentId}.json`
      });
      
      await runtime.start();
      
      // Test basic functionality
      const ws = new MockWebSocket();
      runtime.handleConnection(ws);
      
      await runtime.handleMessage('session-123', Buffer.from(JSON.stringify({
        type: 'session_init',
        sessionId: 'session-123'
      })), false);
      
      // Should receive connected message
      const connected = ws.sentMessages.find(m => {
        const msg = JSON.parse(m.toString());
        return msg.type === 'connected';
      });
      expect(connected).toBeDefined();
      
      await runtime.stop();
    });
  });
});
```
