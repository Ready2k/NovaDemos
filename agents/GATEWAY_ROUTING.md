# Gateway Routing - Agent-to-Agent Context Passing

## Overview

Gateway Routing enables agents to communicate with each other through the central gateway, passing context and state seamlessly. This allows for sophisticated multi-agent workflows where agents can hand off conversations while preserving user identity, intent, and conversation history.

## Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Agent A   │────────▶│   Gateway   │◀────────│   Agent B   │
│  (Triage)   │         │   Router    │         │  (Banking)  │
└─────────────┘         └─────────────┘         └─────────────┘
       │                       │                        │
       │                       ▼                        │
       │                  ┌─────────┐                   │
       └─────────────────▶│  Redis  │◀──────────────────┘
                          │ Memory  │
                          └─────────┘
```

## Key Components

### 1. GatewayRouter (`gateway-router.ts`)

The `GatewayRouter` class provides a clean abstraction for agent-to-agent communication:

```typescript
const router = new GatewayRouter({
    gatewayUrl: 'http://gateway:8080',
    agentId: 'my-agent',
    timeout: 5000
});
```

### 2. AgentCore Integration

`AgentCore` now includes gateway routing capabilities:

```typescript
// Route to another agent with context
await agentCore.routeToAgentViaGateway(
    sessionId,
    'banking',
    {
        verified: true,
        userName: 'John Smith',
        account: '12345678',
        sortCode: '12-34-56',
        userIntent: 'check balance'
    }
);
```

### 3. Gateway Endpoints

New REST endpoints for agent communication:

- `POST /api/sessions/:sessionId/memory` - Update session memory
- `GET /api/sessions/:sessionId/memory` - Retrieve session memory
- `POST /api/sessions/:sessionId/transfer` - Transfer session to another agent
- `GET /api/agents/:agentId` - Check agent status
- `POST /api/agents/:agentId/status` - Update agent status

## Context Structure

The `AgentContext` interface defines what can be passed between agents:

```typescript
interface AgentContext {
    // User Identity
    verified?: boolean;
    userName?: string;
    account?: string;
    sortCode?: string;
    
    // Journey State
    lastAgent?: string;
    userIntent?: string;
    lastUserMessage?: string;
    taskCompleted?: string;
    conversationSummary?: string;
    
    // Graph State
    graphState?: any;
    
    // Custom context
    [key: string]: any;
}
```

## Usage Examples

### Example 1: Basic Routing

```typescript
import { GatewayRouter } from './gateway-router';

const router = new GatewayRouter({
    gatewayUrl: 'http://gateway:8080',
    agentId: 'triage'
});

// Route user to banking agent
const response = await router.routeToAgent({
    sessionId: 'session-123',
    targetAgentId: 'banking',
    context: {
        lastAgent: 'triage',
        userIntent: 'check balance',
        lastUserMessage: 'What is my balance?'
    },
    reason: 'User needs banking assistance'
});

if (response.success) {
    console.log('Successfully routed to banking');
}
```

### Example 2: Routing with Verified User

```typescript
// After IDV verification, route to banking with credentials
const response = await router.routeToAgent({
    sessionId: 'session-123',
    targetAgentId: 'banking',
    context: {
        lastAgent: 'idv',
        verified: true,
        userName: 'John Smith',
        account: '12345678',
        sortCode: '12-34-56',
        userIntent: 'check balance'
    },
    reason: 'User verified, routing to banking'
});
```

### Example 3: Routing with Graph State

```typescript
// Route with workflow state
const response = await router.routeToAgent({
    sessionId: 'session-123',
    targetAgentId: 'disputes',
    context: {
        lastAgent: 'triage',
        userIntent: 'dispute transaction',
        graphState: {
            currentNodeId: 'dispute_detection',
            variables: {
                disputeReason: 'unauthorized charge',
                transactionId: 'TXN-12345'
            }
        }
    },
    reason: 'User needs dispute assistance'
});
```

### Example 4: Check Agent Availability

```typescript
// Check if target agent is available before routing
const isAvailable = await router.isAgentAvailable('banking');

if (isAvailable) {
    // Route to agent
} else {
    // Handle unavailable agent
}
```

### Example 5: Get Available Agents

```typescript
// Get list of all healthy agents
const agents = await router.getAvailableAgents();
console.log('Available agents:', agents);
// Output: ['triage', 'banking', 'idv', 'disputes']
```

### Example 6: Retrieve Session Memory

```typescript
// Get current session memory from gateway
const memory = await router.getSessionMemory('session-123');

if (memory) {
    console.log('User:', memory.userName);
    console.log('Intent:', memory.userIntent);
    console.log('Verified:', memory.verified);
}
```

### Example 7: Notify Status Changes

```typescript
// Notify gateway of agent status
await router.notifyStatusChange('busy', {
    currentTask: 'processing transaction'
});

// Later...
await router.notifyStatusChange('ready', {
    message: 'Transaction completed'
});
```

## Integration with AgentCore

The `AgentCore` class now includes built-in gateway routing:

```typescript
// In your agent code
const agentCore = new AgentCore({
    agentId: 'my-agent',
    workflowDef,
    personaConfig,
    toolsClient,
    decisionEvaluator,
    graphExecutor,
    gatewayUrl: 'http://gateway:8080' // Enable gateway routing
});

// Route to another agent
const success = await agentCore.routeToAgentViaGateway(
    sessionId,
    'banking',
    {
        verified: true,
        userName: 'John Smith',
        userIntent: 'check balance'
    }
);
```

## Configuration

### Environment Variables

```bash
# Gateway URL for agent communication
GATEWAY_URL=http://gateway:8080

# Agent identification
AGENT_ID=my-agent

# Request timeout (optional, default: 5000ms)
GATEWAY_TIMEOUT=5000
```

### UnifiedRuntime Configuration

The `UnifiedRuntime` automatically passes the gateway URL to `AgentCore`:

```typescript
const config: UnifiedRuntimeConfig = {
    mode: 'voice',
    agentId: 'my-agent',
    agentPort: 8081,
    workflowFile: '/app/workflow.json',
    gatewayUrl: process.env.GATEWAY_URL || 'http://gateway:8080'
};
```

## Testing

Run the test suite to verify gateway routing:

```bash
cd agents

# Build TypeScript
npm run build

# Run tests
GATEWAY_URL=http://localhost:8080 node dist/tests/test-gateway-routing.js
```

Or with ts-node:

```bash
GATEWAY_URL=http://localhost:8080 npx ts-node tests/test-gateway-routing.ts
```

## Error Handling

The Gateway Router includes comprehensive error handling:

```typescript
const response = await router.routeToAgent(request);

if (!response.success) {
    console.error('Routing failed:', response.error);
    
    // Handle specific errors
    if (response.error?.includes('Session not found')) {
        // Session doesn't exist
    } else if (response.error?.includes('Agent not available')) {
        // Target agent is down
    } else {
        // Other error
    }
}
```

## Best Practices

1. **Always check agent availability** before routing to avoid failed transfers
2. **Include comprehensive context** to ensure the target agent has all necessary information
3. **Use meaningful reasons** for routing to help with debugging and observability
4. **Handle routing failures gracefully** with fallback logic
5. **Update session memory** before routing to ensure context is preserved
6. **Track routing in Langfuse** for observability and debugging

## Benefits

- **Decoupled Agents**: Agents don't need direct connections to each other
- **Centralized State**: Gateway manages session state and memory
- **Flexible Routing**: Easy to add new agents or change routing logic
- **Context Preservation**: Full conversation context passed between agents
- **Observability**: All routing goes through gateway for monitoring
- **Fault Tolerance**: Gateway can handle agent failures and reroute

## Future Enhancements

- **Routing Rules**: Define routing rules in gateway configuration
- **Load Balancing**: Distribute requests across multiple instances of same agent
- **Circuit Breakers**: Automatically disable unhealthy agents
- **Routing Analytics**: Track routing patterns and performance
- **Priority Routing**: Route high-priority requests to dedicated agents
- **Conditional Routing**: Route based on context conditions

## Troubleshooting

### Gateway not responding

```bash
# Check gateway is running
curl http://localhost:8080/health

# Check Redis connection
docker logs gateway
```

### Agent not receiving context

```bash
# Check session memory in Redis
redis-cli GET session:session-123

# Check gateway logs
docker logs gateway | grep "Memory update"
```

### Routing timeout

```bash
# Increase timeout in configuration
GATEWAY_TIMEOUT=10000

# Or in code
const router = new GatewayRouter({
    gatewayUrl: 'http://gateway:8080',
    agentId: 'my-agent',
    timeout: 10000 // 10 seconds
});
```

## Related Documentation

- [Agent Architecture](../ARCHITECTURE.md)
- [A2A Protocol](./A2A_PROTOCOL.md)
- [Session Management](./SESSION_MANAGEMENT.md)
- [Testing Guide](./TESTING.md)
