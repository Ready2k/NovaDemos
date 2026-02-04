# Developer Guide: Voice-Agnostic Agent Architecture

## Table of Contents

1. [Overview](#overview)
2. [Architecture Components](#architecture-components)
3. [Agent Core Interface](#agent-core-interface)
4. [Voice Side-Car Interface](#voice-side-car-interface)
5. [Text Adapter Interface](#text-adapter-interface)
6. [Unified Runtime Interface](#unified-runtime-interface)
7. [Adding New Agents](#adding-new-agents)
8. [Code Examples](#code-examples)
9. [Testing Your Agent](#testing-your-agent)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The Voice S2S platform uses a **Voice Side-Car Pattern** that separates agent business logic from I/O mechanisms. This architecture enables you to write agent logic once and deploy it in voice, text, or hybrid modes with minimal configuration.

### Key Benefits

- **Separation of Concerns**: Business logic is independent of I/O mechanism
- **Code Reuse**: Write once, deploy in any mode (voice, text, hybrid)
- **Easy Extension**: Add new agents with ~10 lines of configuration
- **Maintainability**: Reduced code duplication (~1,183 lines eliminated)
- **Backward Compatible**: All existing agents migrate seamlessly

### Architecture Diagram

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

---

## Architecture Components

### 1. Agent Core (`agent-core.ts`)

**Purpose**: Voice-agnostic business logic for agent operations.

**Responsibilities**:
- Session management (initialize, track, clean up)
- Message processing and LLM interaction
- Tool execution (validate, route, execute)
- Handoff management (detect, extract context, send to Gateway)
- Session memory (store/restore verified users, user intent)
- Workflow state management
- Observability (Langfuse integration)

**Key Feature**: No dependencies on SonicClient, WebSocket, or any I/O mechanism.

### 2. Voice Side-Car (`voice-sidecar.ts`)

**Purpose**: Wraps Agent Core with voice I/O using SonicClient.

**Responsibilities**:
- Audio streaming (handle audio chunks, forward to SonicClient)
- Event translation (convert SonicClient events to Agent Core calls)
- Lifecycle management (start/stop voice sessions)
- Error handling (voice-specific errors)
- Backward compatibility (support all existing voice features)

**Key Feature**: Thin wrapper that delegates business logic to Agent Core.

### 3. Text Adapter (`text-adapter.ts`)

**Purpose**: Wraps Agent Core with WebSocket text I/O.

**Responsibilities**:
- Message forwarding (route text messages to Agent Core)
- Response handling (send Agent Core responses via WebSocket)
- Session lifecycle (initialize/clean up text sessions)
- Error handling (text-specific errors)
- Backward compatibility (maintain existing text agent functionality)

**Key Feature**: Minimal adapter that connects WebSocket to Agent Core.

### 4. Unified Runtime (`agent-runtime-unified.ts`)

**Purpose**: Single entry point supporting voice, text, or hybrid modes.

**Responsibilities**:
- Mode selection (via MODE environment variable)
- Dynamic initialization (load appropriate adapters)
- Gateway integration (register, heartbeat)
- Configuration loading (workflow, persona)
- WebSocket server setup
- Graceful shutdown

**Key Feature**: Zero code changes needed to switch modes.

---

## Agent Core Interface

### Core Methods

```typescript
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
```

### Data Models

```typescript
interface SessionContext {
  sessionId: string;
  startTime: number;
  messages: Message[];
  currentNode?: string;
  verifiedUser?: VerifiedUser;
  userIntent?: string;
  graphState?: any;
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
```

### Usage Example

```typescript
import { AgentCore } from './agent-core';

// Initialize Agent Core
const agentCore = new AgentCore({
  agentId: 'my-agent',
  workflowDef: workflowDefinition,
  personaConfig: personaConfig,
  toolsClient: toolsClient,
  decisionEvaluator: decisionEvaluator,
  graphExecutor: graphExecutor
});

// Initialize session
const session = agentCore.initializeSession('session-123', {
  verified: true,
  userName: 'John Doe'
});

// Process user message
const response = await agentCore.processUserMessage(
  'session-123',
  'Check my balance'
);

// Execute tool
const toolResult = await agentCore.executeTool(
  'session-123',
  'check_balance',
  { accountNumber: '12345678', sortCode: '112233' },
  'tool-use-123'
);

// End session
agentCore.endSession('session-123');
```

---

## Voice Side-Car Interface

### Core Methods

```typescript
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

### Usage Example

```typescript
import { VoiceSideCar } from './voice-sidecar';
import { AgentCore } from './agent-core';

// Initialize Agent Core
const agentCore = new AgentCore(config);

// Initialize Voice Side-Car
const voiceSideCar = new VoiceSideCar({
  agentCore,
  sonicConfig: {
    region: 'us-east-1',
    modelId: 'amazon.nova-2-sonic-v1:0'
  }
});

// Start voice session
await voiceSideCar.startVoiceSession('session-123', ws, memory);

// Handle audio chunk
await voiceSideCar.handleAudioChunk('session-123', audioBuffer);

// Handle text input (hybrid mode)
await voiceSideCar.handleTextInput('session-123', 'Check my balance');

// Stop voice session
await voiceSideCar.stopVoiceSession('session-123');
```

---

## Text Adapter Interface

### Core Methods

```typescript
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

### Usage Example

```typescript
import { TextAdapter } from './text-adapter';
import { AgentCore } from './agent-core';

// Initialize Agent Core
const agentCore = new AgentCore(config);

// Initialize Text Adapter
const textAdapter = new TextAdapter({ agentCore });

// Start text session
textAdapter.startTextSession('session-123', ws, memory);

// Handle user input
await textAdapter.handleUserInput('session-123', 'Check my balance');

// Stop text session
textAdapter.stopTextSession('session-123');
```

---

## Unified Runtime Interface

### Configuration

```typescript
interface UnifiedRuntimeConfig {
  mode: 'voice' | 'text' | 'hybrid';
  agentId: string;
  agentPort: number;
  workflowFile: string;
  personaFile?: string;
  awsConfig?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    modelId: string;
  };
}
```

### Usage Example

```typescript
import { UnifiedRuntime } from './agent-runtime-unified';

// Initialize Unified Runtime
const runtime = new UnifiedRuntime({
  mode: 'voice',
  agentId: 'my-agent',
  agentPort: 8081,
  workflowFile: './workflows/my-workflow.json',
  personaFile: './personas/my-persona.json',
  awsConfig: {
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    modelId: 'amazon.nova-2-sonic-v1:0'
  }
});

// Start runtime
await runtime.start();

// Runtime handles:
// - Gateway registration
// - WebSocket server setup
// - Mode-specific adapter initialization
// - Session management
// - Graceful shutdown

// Stop runtime
await runtime.stop();
```

---

## Adding New Agents

### Quick Start (10 Lines of Configuration)

Adding a new agent requires only:
1. Workflow JSON file
2. Persona JSON file (optional)
3. Environment variables

### Step 1: Create Workflow Definition

Create `/workflows/workflow-myagent.json`:

```json
{
  "name": "my-agent",
  "description": "My custom agent",
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "next": "greet"
    },
    {
      "id": "greet",
      "type": "llm",
      "prompt": "Greet the user warmly",
      "next": "process"
    },
    {
      "id": "process",
      "type": "llm",
      "prompt": "Help the user with their request",
      "tools": ["tool1", "tool2"],
      "next": "end"
    },
    {
      "id": "end",
      "type": "end"
    }
  ]
}
```

### Step 2: Create Persona Configuration (Optional)

Create `/personas/my-agent.json`:

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "systemPrompt": "You are a helpful assistant specialized in...",
  "speechPrompt": "Speak clearly and naturally.",
  "voice": "Matthew",
  "allowedTools": ["tool1", "tool2", "tool3"],
  "metadata": {
    "description": "Custom agent for specific tasks",
    "category": "custom",
    "version": "1.0.0"
  }
}
```

### Step 3: Set Environment Variables

Create `/agents/.env`:

```bash
# Agent Configuration
AGENT_ID=my-agent
AGENT_PORT=8087
WORKFLOW_FILE=./workflows/workflow-myagent.json
PERSONA_FILE=./personas/my-agent.json

# Mode Selection
MODE=voice  # or text, or hybrid

# Gateway Configuration
GATEWAY_URL=http://localhost:8080
REDIS_URL=redis://localhost:6379

# Local Tools (if using)
LOCAL_TOOLS_URL=http://localhost:9000

# AWS Configuration (required for voice/hybrid modes)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0

# Langfuse (optional)
LANGFUSE_PUBLIC_KEY=your_public_key
LANGFUSE_SECRET_KEY=your_secret_key
LANGFUSE_HOST=https://cloud.langfuse.com
```

### Step 4: Deploy

**Option A: Using Docker**

```bash
cd agents
docker build -f Dockerfile.unified -t my-agent .
docker run -p 8087:8087 --env-file .env my-agent
```

**Option B: Using Node.js**

```bash
cd agents
npm install
npm run build
node dist/agent-runtime-unified.js
```

**Option C: Using Docker Compose**

Add to `docker-compose-unified.yml`:

```yaml
agent-myagent:
  build:
    context: ./agents
    dockerfile: Dockerfile.unified
  ports:
    - "8087:8087"
  environment:
    - MODE=voice
    - AGENT_ID=my-agent
    - AGENT_PORT=8087
    - REDIS_URL=redis://redis:6379
    - GATEWAY_URL=http://gateway:8080
    - LOCAL_TOOLS_URL=http://local-tools:9000
    - WORKFLOW_FILE=/app/workflow.json
    - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
    - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    - AWS_REGION=${AWS_REGION:-us-east-1}
  volumes:
    - ./workflows/workflow-myagent.json:/app/workflow.json:ro
    - ./personas:/app/personas:ro
  depends_on:
    - redis
    - gateway
  networks:
    - agent-network
```

Then run:

```bash
docker-compose -f docker-compose-unified.yml up -d agent-myagent
```

---

## Code Examples

### Example 1: Voice-Only Banking Agent

```typescript
// No code needed! Just configuration:

// .env
MODE=voice
AGENT_ID=banking
WORKFLOW_FILE=./workflows/workflow-banking.json
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

// That's it! The unified runtime handles everything.
```

### Example 2: Text-Only Support Agent

```typescript
// No code needed! Just configuration:

// .env
MODE=text
AGENT_ID=support
WORKFLOW_FILE=./workflows/workflow-support.json
# No AWS credentials needed for text mode!

// That's it! The unified runtime handles everything.
```

### Example 3: Hybrid Triage Agent

```typescript
// No code needed! Just configuration:

// .env
MODE=hybrid
AGENT_ID=triage
WORKFLOW_FILE=./workflows/workflow-triage.json
AWS_ACCESS_KEY_ID=xxx  # Required for voice capability
AWS_SECRET_ACCESS_KEY=xxx

// That's it! The unified runtime handles everything.
```

### Example 4: Custom Tool Integration

If you need custom tool logic, extend the ToolsClient:

```typescript
import { ToolsClient } from './tools-client';

class CustomToolsClient extends ToolsClient {
  async executeCustomTool(toolName: string, input: any): Promise<any> {
    // Your custom tool logic here
    if (toolName === 'my_custom_tool') {
      return {
        result: 'Custom tool result',
        success: true
      };
    }
    
    // Fallback to default execution
    return super.execute(toolName, input);
  }
}

// Use in Agent Core initialization
const agentCore = new AgentCore({
  agentId: 'my-agent',
  toolsClient: new CustomToolsClient(config),
  // ... other config
});
```

### Example 5: Custom Workflow Logic

If you need custom decision logic, extend the DecisionEvaluator:

```typescript
import { DecisionEvaluator } from './decision-evaluator';

class CustomDecisionEvaluator extends DecisionEvaluator {
  async evaluateCondition(
    condition: string,
    context: any
  ): Promise<boolean> {
    // Your custom decision logic here
    if (condition === 'is_premium_customer') {
      return context.customerTier === 'premium';
    }
    
    // Fallback to default evaluation
    return super.evaluateCondition(condition, context);
  }
}

// Use in Agent Core initialization
const agentCore = new AgentCore({
  agentId: 'my-agent',
  decisionEvaluator: new CustomDecisionEvaluator(),
  // ... other config
});
```

---

## Testing Your Agent

### Unit Testing

Test Agent Core in isolation:

```typescript
import { AgentCore } from '../src/agent-core';

describe('My Agent', () => {
  let agentCore: AgentCore;
  
  beforeEach(() => {
    agentCore = new AgentCore({
      agentId: 'test-agent',
      workflowDef: testWorkflow,
      personaConfig: null,
      toolsClient: mockToolsClient,
      decisionEvaluator: mockDecisionEvaluator,
      graphExecutor: mockGraphExecutor
    });
  });
  
  it('should initialize session', () => {
    const session = agentCore.initializeSession('session-123');
    expect(session.sessionId).toBe('session-123');
  });
  
  it('should process user message', async () => {
    agentCore.initializeSession('session-123');
    const response = await agentCore.processUserMessage(
      'session-123',
      'Hello'
    );
    expect(response.type).toBe('text');
  });
});
```

### Integration Testing

Test complete flow with adapters:

```typescript
import { UnifiedRuntime } from '../src/agent-runtime-unified';

describe('My Agent Integration', () => {
  it('should handle voice interaction', async () => {
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
    
    // Verify response
    expect(ws.sentMessages.length).toBeGreaterThan(0);
    
    await runtime.stop();
  });
});
```

### Property-Based Testing

Test universal properties:

```typescript
import * as fc from 'fast-check';

describe('Agent Core Properties', () => {
  it('should handle any valid session ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (sessionId) => {
          const agentCore = new AgentCore(config);
          const session = agentCore.initializeSession(sessionId);
          expect(session.sessionId).toBe(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

---

## Best Practices

### 1. Keep Business Logic in Agent Core

✅ **Good**: Business logic in Agent Core
```typescript
// agent-core.ts
async processUserMessage(sessionId: string, message: string) {
  // Validate input
  // Execute workflow
  // Handle tools
  // Return response
}
```

❌ **Bad**: Business logic in adapters
```typescript
// voice-sidecar.ts
async handleSonicEvent(event: SonicEvent) {
  // Don't put business logic here!
  // Just forward to Agent Core
}
```

### 2. Use Environment Variables for Configuration

✅ **Good**: Configuration via environment
```bash
MODE=voice
AGENT_ID=my-agent
WORKFLOW_FILE=./workflows/my-workflow.json
```

❌ **Bad**: Hardcoded configuration
```typescript
const mode = 'voice'; // Don't hardcode!
```

### 3. Handle Errors Gracefully

✅ **Good**: Graceful error handling
```typescript
try {
  await voiceSideCar.startVoiceSession(sessionId, ws);
} catch (error) {
  console.error('Failed to start voice session:', error);
  ws.send(JSON.stringify({
    type: 'error',
    message: 'Failed to start voice session'
  }));
}
```

❌ **Bad**: Unhandled errors
```typescript
await voiceSideCar.startVoiceSession(sessionId, ws); // May crash!
```

### 4. Clean Up Resources

✅ **Good**: Proper cleanup
```typescript
process.on('SIGTERM', async () => {
  await runtime.stop();
  process.exit(0);
});
```

❌ **Bad**: No cleanup
```typescript
// Resources leak on shutdown
```

### 5. Use Observability

✅ **Good**: Track important events
```typescript
langfuse.trace({
  name: 'user_message',
  input: message,
  output: response
});
```

❌ **Bad**: No observability
```typescript
// Can't debug issues in production
```

---

## Troubleshooting

### Issue: Agent won't start

**Symptoms**: Agent crashes on startup

**Solutions**:
1. Check workflow file exists: `ls -la workflows/workflow-myagent.json`
2. Validate JSON syntax: `cat workflows/workflow-myagent.json | jq`
3. Check environment variables: `env | grep AGENT`
4. Verify AWS credentials (voice mode): `aws sts get-caller-identity`

### Issue: Voice mode not working

**Symptoms**: No audio response, connection errors

**Solutions**:
1. Verify MODE=voice in environment
2. Check AWS credentials are set
3. Verify Nova Sonic model access in AWS console
4. Check SonicClient logs for errors
5. Test with MODE=text to isolate issue

### Issue: Tools not executing

**Symptoms**: Tool calls fail or timeout

**Solutions**:
1. Verify tool definitions exist in `/tools/`
2. Check LOCAL_TOOLS_URL is correct
3. Verify tool service is running: `curl http://localhost:9000/health`
4. Check tool input matches schema
5. Review Agent Core logs for tool execution errors

### Issue: Handoffs not working

**Symptoms**: Agent doesn't transfer to target agent

**Solutions**:
1. Verify Gateway is running: `curl http://localhost:8080/health`
2. Check target agent is registered with Gateway
3. Verify handoff tool name matches target agent ID
4. Review Gateway logs for handoff requests
5. Check Redis connection: `redis-cli ping`

### Issue: Session memory not persisting

**Symptoms**: Verified user data lost across messages

**Solutions**:
1. Check Redis is running: `redis-cli ping`
2. Verify REDIS_URL is correct
3. Check Gateway is storing memory
4. Review Agent Core logs for memory updates
5. Test memory restoration on session init

### Issue: High latency

**Symptoms**: Slow response times

**Solutions**:
1. Check network latency to AWS region
2. Verify tool caching is enabled
3. Review workflow complexity (too many nodes?)
4. Check LLM token usage (too long prompts?)
5. Monitor Redis performance
6. Consider using MODE=text for faster testing

### Issue: Docker build fails

**Symptoms**: Docker build errors

**Solutions**:
1. Verify Dockerfile.unified exists
2. Check Node.js version: `node --version` (need 18+)
3. Clear Docker cache: `docker system prune -a`
4. Check disk space: `df -h`
5. Review build logs for specific errors

---

## Additional Resources

- **[README.md](../README.md)**: Main project documentation
- **[User Guide](./USER_GUIDE.md)**: End-user documentation
- **[Tool Management](./tool_management.md)**: Tool configuration guide
- **[Workflows](./workflows.md)**: Workflow design guide
- **[Architecture](./architecture.md)**: Detailed architecture documentation

---

## Support

For issues, questions, or feature requests:
- Open an issue on GitHub
- Check existing documentation
- Review troubleshooting section
- Contact the development team

---

**Built with ❤️ for voice-agnostic agent development**
