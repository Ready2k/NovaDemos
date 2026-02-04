# Test Fixtures

This directory contains mock implementations and test data for the voice-agnostic agent architecture.

## Overview

The test fixtures provide reusable mocks and test data that can be used across unit tests, property-based tests, and integration tests. These fixtures ensure consistent testing patterns and reduce code duplication.

## Contents

### Mock Implementations

#### `mock-sonic-client.ts`
Mock implementation of SonicClient for testing voice interactions without AWS dependencies.

**Features:**
- Tracks all method calls (startSession, sendAudioChunk, sendText, etc.)
- Records received data (audio chunks, text messages, tool results)
- Supports event emission for simulating SonicClient events
- Configurable error simulation for testing error handling
- Helper methods for common test scenarios

**Usage:**
```typescript
import { MockSonicClient } from '../fixtures';

const mockSonic = new MockSonicClient();
await mockSonic.startSession(onEvent, 'session-123');

// Simulate events
mockSonic.emitTranscript('user', 'Hello');
mockSonic.emitToolUse('check_balance', 'tool-1', { accountId: '12345678' });

// Verify behavior
expect(mockSonic.startSessionCalled).toBe(1);
expect(mockSonic.receivedTexts).toContain('Hello');
```

#### `mock-websocket.ts`
Mock implementation of WebSocket for testing client communication without network dependencies.

**Features:**
- Tracks all sent messages (binary and text)
- Supports event handlers (message, close, error, open)
- Helper methods for finding and filtering messages
- Simulates WebSocket state transitions
- JSON message parsing utilities

**Usage:**
```typescript
import { MockWebSocket } from '../fixtures';

const mockWs = new MockWebSocket();
mockWs.send(JSON.stringify({ type: 'session_init' }));

// Verify messages
expect(mockWs.hasMessageType('session_init')).toBe(true);
expect(mockWs.countMessagesByType('transcript')).toBe(3);

// Simulate events
mockWs.receiveMessage(Buffer.from('audio data'));
mockWs.simulateError(new Error('Connection lost'));
```

### Test Data

#### `test-workflows.ts`
Pre-defined workflow definitions for testing different workflow patterns.

**Available Workflows:**
- `simpleWorkflow` - Linear flow (Start → Message → End)
- `decisionWorkflow` - Branching logic with decisions
- `toolWorkflow` - Tool execution workflow
- `handoffWorkflow` - Agent handoff workflow
- `complexWorkflow` - Multi-step workflow with tools and decisions
- `emptyWorkflow` - Edge case testing

**Usage:**
```typescript
import { simpleWorkflow, getTestWorkflow } from '../fixtures';

const agentCore = new AgentCore({
    workflowDef: simpleWorkflow,
    // ... other config
});

// Or get by ID
const workflow = getTestWorkflow('test-decision');
```

#### `test-personas.ts`
Pre-defined persona configurations for testing different agent types.

**Available Personas:**
- `basicPersona` - Minimal configuration for simple tests
- `bankingPersona` - Banking agent with tool access
- `triagePersona` - Triage agent for handoff testing
- `specialistPersona` - Specialist agent for handoff targets
- `multilingualPersona` - Multi-language support testing

**Usage:**
```typescript
import { bankingPersona, getTestPersona } from '../fixtures';

const agentCore = new AgentCore({
    personaConfig: bankingPersona,
    // ... other config
});
```

#### `test-tools.ts`
Pre-defined tool definitions for testing tool execution.

**Available Tools:**
- `balanceCheckTool` - Account balance check
- `idvCheckTool` - Identity verification
- `transferToBankingTool` - Handoff to banking agent
- `returnToTriageTool` - Return to triage agent
- `knowledgeBaseSearchTool` - Knowledge base search
- `genericTool` - Generic tool with no required params

**Usage:**
```typescript
import { balanceCheckTool, convertToNovaFormat } from '../fixtures';

// Use in tests
const toolName = balanceCheckTool.name;

// Convert to Nova Sonic format
const novaTools = convertToNovaFormat([balanceCheckTool, idvCheckTool]);
```

### Index

#### `index.ts`
Central export point for all fixtures. Import everything from here for convenience.

**Usage:**
```typescript
import {
    MockSonicClient,
    MockWebSocket,
    simpleWorkflow,
    bankingPersona,
    balanceCheckTool
} from '../fixtures';
```

## Testing Patterns

### Unit Tests
Use mocks to isolate components and verify specific behavior:

```typescript
import { MockSonicClient, MockWebSocket } from '../fixtures';

describe('VoiceSideCar', () => {
    it('should forward audio to SonicClient', async () => {
        const mockSonic = new MockSonicClient();
        const voiceSideCar = new VoiceSideCar({
            agentCore,
            sonicConfig: {}
        });
        
        // Test implementation
    });
});
```

### Property-Based Tests
Use fixtures with fast-check generators:

```typescript
import { simpleWorkflow } from '../fixtures';
import * as fc from 'fast-check';

it('should handle any valid session ID', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.uuid(),
            async (sessionId) => {
                const agentCore = new AgentCore({
                    workflowDef: simpleWorkflow,
                    // ... config
                });
                
                agentCore.initializeSession(sessionId);
                expect(agentCore.getSession(sessionId)).toBeDefined();
            }
        ),
        { numRuns: 100 }
    );
});
```

### Integration Tests
Combine multiple fixtures for end-to-end scenarios:

```typescript
import {
    MockSonicClient,
    MockWebSocket,
    toolWorkflow,
    bankingPersona
} from '../fixtures';

describe('Voice Mode Integration', () => {
    it('should handle complete voice flow', async () => {
        const mockSonic = new MockSonicClient();
        const mockWs = new MockWebSocket();
        
        // Setup runtime with fixtures
        // Test complete flow
    });
});
```

## Best Practices

1. **Reset Mocks Between Tests**: Always call `reset()` on mocks in `afterEach` hooks
2. **Use Descriptive Test Data**: Choose workflow/persona names that clearly indicate test intent
3. **Verify State Changes**: Check both method calls and state changes in mocks
4. **Test Error Paths**: Use error simulation flags to test error handling
5. **Keep Fixtures Simple**: Fixtures should be minimal and focused on testing needs

## Validation

All fixtures are validated against the actual type definitions:
- `MockSonicClient` implements the SonicClient interface
- `MockWebSocket` implements the WebSocket interface
- Test workflows conform to `WorkflowDefinition`
- Test personas conform to `PersonaConfig`
- Test tools follow the tool schema format

## Requirements Validated

These fixtures validate the following requirements:
- **Requirement 13.2**: Agent Core testable without I/O dependencies
- **Requirement 13.3**: Voice Side-Car testable with mock SonicClient
- **Requirement 13.4**: Text Adapter testable with mock WebSocket
- **Requirement 13.5**: Test fixtures for common scenarios (handoffs, tool calls, errors)
