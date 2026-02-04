/**
 * Test Fixtures Index
 * 
 * Central export point for all test fixtures and mocks.
 * This makes it easy to import fixtures in tests.
 * 
 * Usage:
 * ```typescript
 * import { MockSonicClient, MockWebSocket, simpleWorkflow, basicPersona } from '../fixtures';
 * ```
 */

// Mock implementations
export { MockSonicClient } from './mock-sonic-client';
export { MockWebSocket, WebSocketState } from './mock-websocket';

// Test workflows
export {
    simpleWorkflow,
    decisionWorkflow,
    toolWorkflow,
    handoffWorkflow,
    complexWorkflow,
    emptyWorkflow,
    allTestWorkflows,
    getTestWorkflow
} from './test-workflows';

// Test personas
export {
    basicPersona,
    bankingPersona,
    triagePersona,
    specialistPersona,
    multilingualPersona,
    allTestPersonas,
    getTestPersona
} from './test-personas';

// Test tools
export {
    balanceCheckTool,
    idvCheckTool,
    transferToBankingTool,
    returnToTriageTool,
    knowledgeBaseSearchTool,
    genericTool,
    allTestTools,
    getTestTool,
    getAllTestToolNames,
    convertToNovaFormat
} from './test-tools';
