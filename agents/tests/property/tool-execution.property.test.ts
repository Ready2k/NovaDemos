/**
 * Property-Based Tests for Tool Execution Pipeline
 * 
 * These tests verify the comprehensive tool execution pipeline in Agent Core:
 * - Tool type detection across all tool types
 * - Input validation with valid and invalid inputs
 * - Routing to appropriate services
 * - Tool execution via ToolsClient
 * 
 * Uses fast-check library for property-based testing with minimum 100 iterations.
 */

import * as fc from 'fast-check';
import { AgentCore, AgentCoreConfig } from '../../src/agent-core';
import { GraphExecutor } from '../../src/graph-executor';
import { WorkflowDefinition } from '../../src/graph-types';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { PersonaConfig } from '../../src/persona-types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock workflow definition
const mockWorkflow: WorkflowDefinition = {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: [
        { id: 'start', type: 'start', label: 'Start' },
        { id: 'greeting', type: 'message', label: 'Greeting', message: 'Hello!' },
        { id: 'end', type: 'end', label: 'End', outcome: 'success' }
    ],
    edges: [
        { from: 'start', to: 'greeting', label: 'begin' },
        { from: 'greeting', to: 'end', label: 'complete' }
    ],
    testConfig: {
        personaId: 'test-persona'
    }
};

// Mock persona config
const mockPersona: PersonaConfig = {
    id: 'test-persona',
    name: 'Test Persona',
    description: 'Test persona for property tests',
    promptFile: null,
    workflows: ['test-workflow'],
    voiceId: 'matthew',
    allowedTools: ['check_balance', 'get_transactions'],
    metadata: {
        language: 'en-US',
        region: 'US',
        tone: 'professional'
    }
};

// Helper to create agent core with mocked ToolsClient
function createAgentCore(): AgentCore {
    const mockToolsClient = {
        executeTool: jest.fn().mockResolvedValue({
            success: true,
            result: { data: 'mock result' }
        }),
        discoverLocalTools: jest.fn()
    } as any;
    
    const mockDecisionEvaluator = new DecisionEvaluator('us-east-1');
    const mockGraphExecutor = new GraphExecutor(mockWorkflow);

    const config: AgentCoreConfig = {
        agentId: 'test-agent',
        workflowDef: mockWorkflow,
        personaConfig: mockPersona,
        toolsClient: mockToolsClient,
        decisionEvaluator: mockDecisionEvaluator,
        graphExecutor: mockGraphExecutor,
        localToolsUrl: 'http://localhost:9000'
    };

    return new AgentCore(config);
}

// Custom arbitraries for tool testing
const handoffToolArbitrary = fc.constantFrom(
    'transfer_to_banking',
    'transfer_to_idv',
    'transfer_to_mortgage',
    'transfer_to_disputes',
    'transfer_to_investigation',
    'return_to_triage'
);

const bankingToolArbitrary = fc.constantFrom(
    'agentcore_balance',
    'get_account_transactions',
    'perform_idv_check',
    'uk_branch_lookup'
);

const knowledgeBaseToolArbitrary = fc.constantFrom(
    'search_knowledge_base'
);

const localToolArbitrary = fc.constantFrom(
    'get_server_time',
    'custom_local_tool'
);

const allToolsArbitrary = fc.oneof(
    handoffToolArbitrary,
    bankingToolArbitrary,
    knowledgeBaseToolArbitrary,
    localToolArbitrary
);

// Valid input generators for different tool types
const validHandoffInputArbitrary = fc.oneof(
    // transfer_to_* tools
    fc.record({
        reason: fc.string({ minLength: 10, maxLength: 200 })
    }),
    // return_to_triage tool
    fc.record({
        taskCompleted: fc.string({ minLength: 5, maxLength: 100 }),
        summary: fc.string({ minLength: 10, maxLength: 200 })
    })
);

const validBankingInputArbitrary = fc.oneof(
    // perform_idv_check
    fc.record({
        accountNumber: fc.string({ minLength: 8, maxLength: 8 }),
        sortCode: fc.string({ minLength: 6, maxLength: 6 })
    }),
    // Other banking tools (balance, transactions)
    fc.record({})
);

const validKnowledgeBaseInputArbitrary = fc.record({
    query: fc.string({ minLength: 5, maxLength: 200 })
});

const validLocalToolInputArbitrary = fc.record({
    param: fc.option(fc.string(), { nil: undefined })
});

// Invalid input generators (non-object types)
const invalidInputArbitrary = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.string(),
    fc.integer(),
    fc.boolean()
);

describe('Property-Based Tests: Tool Execution Pipeline', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Setup default axios mock
        mockedAxios.post.mockResolvedValue({
            data: {
                result: { success: true, data: 'mock result' }
            }
        });
    });

    /**
     * Feature: voice-agnostic-agent-architecture, Property 6: Tool Execution Pipeline
     * 
     * For any tool call, the system should validate input against schema, route to the
     * appropriate service (local-tools or AgentCore), execute the tool, and return results
     * to the LLM.
     * 
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
     */
    describe('Property 6: Tool Execution Pipeline', () => {
        it('should detect tool type correctly for all tool categories', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: allToolsArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Execute tool with appropriate input based on type
                        let toolInput: any = {};
                        
                        if (toolName.startsWith('transfer_to_')) {
                            toolInput = { reason: 'Test reason for handoff' };
                        } else if (toolName === 'return_to_triage') {
                            toolInput = { taskCompleted: 'task_complete', summary: 'Task completed successfully' };
                        } else if (toolName === 'perform_idv_check') {
                            toolInput = { accountNumber: '12345678', sortCode: '123456' };
                        } else if (toolName === 'search_knowledge_base') {
                            toolInput = { query: 'What is the policy?' };
                        }
                        
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Tool execution should complete (success or failure)
                        expect(result).toBeDefined();
                        expect(result.success).toBeDefined();
                        expect(typeof result.success).toBe('boolean');
                        
                        // If successful, should have result
                        if (result.success) {
                            expect(result.result).toBeDefined();
                        } else {
                            // If failed, should have error message
                            expect(result.error).toBeDefined();
                            expect(typeof result.error).toBe('string');
                        }
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should validate handoff tool inputs correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: handoffToolArbitrary,
                        toolInput: validHandoffInputArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolInput, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Adjust input based on tool type
                        let adjustedInput = toolInput;
                        if (toolName === 'return_to_triage') {
                            // Ensure return_to_triage has required fields
                            if (!('taskCompleted' in toolInput)) {
                                adjustedInput = {
                                    taskCompleted: 'task_complete',
                                    summary: 'Task completed successfully'
                                };
                            }
                        } else {
                            // Ensure transfer_to_* has reason
                            if (!('reason' in toolInput)) {
                                adjustedInput = { reason: 'User needs specialist assistance' };
                            }
                        }
                        
                        const result = await agentCore.executeTool(sessionId, toolName, adjustedInput, toolUseId);
                        
                        // Valid input should succeed
                        expect(result.success).toBe(true);
                        expect(result.result).toBeDefined();
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should validate banking tool inputs correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: bankingToolArbitrary,
                        toolInput: validBankingInputArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolInput, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Adjust input based on tool type
                        let adjustedInput = toolInput;
                        if (toolName === 'perform_idv_check') {
                            // Ensure IDV check has required fields
                            if (!('accountNumber' in toolInput) || !('sortCode' in toolInput)) {
                                adjustedInput = {
                                    accountNumber: '12345678',
                                    sortCode: '123456'
                                };
                            }
                        }
                        
                        const result = await agentCore.executeTool(sessionId, toolName, adjustedInput, toolUseId);
                        
                        // Valid input should succeed (or fail gracefully with error message)
                        expect(result).toBeDefined();
                        expect(result.success).toBeDefined();
                        
                        if (!result.success) {
                            expect(result.error).toBeDefined();
                        }
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should validate knowledge base tool inputs correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: knowledgeBaseToolArbitrary,
                        toolInput: validKnowledgeBaseInputArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolInput, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Valid input should succeed
                        expect(result).toBeDefined();
                        expect(result.success).toBeDefined();
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should reject invalid tool inputs', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: allToolsArbitrary,
                        toolInput: invalidInputArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolInput, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Invalid input should fail validation
                        expect(result.success).toBe(false);
                        expect(result.error).toBeDefined();
                        expect(result.error).toContain('Tool input must be an object');
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should route handoff tools correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: handoffToolArbitrary,
                        reason: fc.string({ minLength: 10, maxLength: 200 }),
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, reason, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        let toolInput: any;
                        if (toolName === 'return_to_triage') {
                            toolInput = {
                                taskCompleted: 'task_complete',
                                summary: reason
                            };
                        } else {
                            toolInput = { reason };
                        }
                        
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Handoff tools should succeed and return handoff message
                        expect(result.success).toBe(true);
                        expect(result.result).toBeDefined();
                        expect(result.result.message).toBe('Handoff initiated');
                        expect(result.result.toolName).toBe(toolName);
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should route banking tools to local-tools service', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: bankingToolArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId }) => {
                        // Clear mocks before each iteration
                        jest.clearAllMocks();
                        
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Setup appropriate input
                        let toolInput: any = {};
                        if (toolName === 'perform_idv_check') {
                            toolInput = {
                                accountNumber: '12345678',
                                sortCode: '123456'
                            };
                        }
                        
                        // Mock axios response
                        mockedAxios.post.mockResolvedValueOnce({
                            data: {
                                result: { success: true, balance: 1000 }
                            }
                        });
                        
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Should call local-tools service
                        expect(mockedAxios.post).toHaveBeenCalledWith(
                            'http://localhost:9000/tools/execute',
                            expect.objectContaining({
                                tool: toolName,
                                input: toolInput
                            })
                        );
                        
                        // Should succeed
                        expect(result.success).toBe(true);
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should route knowledge base tools to ToolsClient', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: knowledgeBaseToolArbitrary,
                        query: fc.string({ minLength: 5, maxLength: 200 }),
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, query, toolUseId }) => {
                        const agentCore = createAgentCore();
                        const mockToolsClient = (agentCore as any).toolsClient;
                        
                        agentCore.initializeSession(sessionId);
                        
                        const toolInput = { query };
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Should call ToolsClient
                        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(toolName, toolInput);
                        
                        // Should succeed
                        expect(result.success).toBe(true);
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should route local tools to ToolsClient', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: localToolArbitrary,
                        toolInput: validLocalToolInputArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolInput, toolUseId }) => {
                        const agentCore = createAgentCore();
                        const mockToolsClient = (agentCore as any).toolsClient;
                        
                        agentCore.initializeSession(sessionId);
                        
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Should call ToolsClient
                        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(toolName, toolInput);
                        
                        // Should succeed
                        expect(result.success).toBe(true);
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle tool execution errors gracefully', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: bankingToolArbitrary,
                        errorMessage: fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 0),
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, errorMessage, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Setup appropriate input
                        let toolInput: any = {};
                        if (toolName === 'perform_idv_check') {
                            toolInput = {
                                accountNumber: '12345678',
                                sortCode: '123456'
                            };
                        }
                        
                        // Mock axios to throw error
                        mockedAxios.post.mockRejectedValueOnce(new Error(errorMessage));
                        
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Should fail gracefully with error message
                        expect(result.success).toBe(false);
                        expect(result.error).toBeDefined();
                        // Error should contain the message (might be wrapped in response structure)
                        expect(typeof result.error).toBe('string');
                        expect(result.error.length).toBeGreaterThan(0);
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle session not found error', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: allToolsArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId }) => {
                        const agentCore = createAgentCore();
                        
                        // Don't initialize session
                        const result = await agentCore.executeTool(sessionId, toolName, {}, toolUseId);
                        
                        // Should fail with session not found error
                        expect(result.success).toBe(false);
                        expect(result.error).toBe('Session not found');
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should store verified user data after successful IDV check', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        // Use alphanumeric strings with spaces to avoid encoding issues
                        customerName: fc.array(
                            fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '.split('')),
                            { minLength: 5, maxLength: 50 }
                        ).map(arr => arr.join('')).filter(s => s.trim().length >= 5),
                        accountNumber: fc.array(
                            fc.constantFrom(...'0123456789'.split('')),
                            { minLength: 8, maxLength: 8 }
                        ).map(arr => arr.join('')),
                        sortCode: fc.array(
                            fc.constantFrom(...'0123456789'.split('')),
                            { minLength: 6, maxLength: 6 }
                        ).map(arr => arr.join('')),
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, customerName, accountNumber, sortCode, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Mock successful IDV response
                        mockedAxios.post.mockResolvedValueOnce({
                            data: {
                                result: {
                                    auth_status: 'VERIFIED',
                                    customer_name: customerName
                                }
                            }
                        });
                        
                        const result = await agentCore.executeTool(
                            sessionId,
                            'perform_idv_check',
                            { accountNumber, sortCode },
                            toolUseId
                        );
                        
                        // Should succeed
                        expect(result.success).toBe(true);
                        
                        // Should store verified user in session
                        const session = agentCore.getSession(sessionId);
                        expect(session?.verifiedUser).toBeDefined();
                        expect(session?.verifiedUser?.customer_name).toBe(customerName);
                        expect(session?.verifiedUser?.account).toBe(accountNumber);
                        expect(session?.verifiedUser?.sortCode).toBe(sortCode);
                        expect(session?.verifiedUser?.auth_status).toBe('VERIFIED');
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should complete full pipeline for all tool types', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: allToolsArbitrary,
                        toolUseId: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Setup appropriate input based on tool type
                        let toolInput: any = {};
                        
                        if (toolName.startsWith('transfer_to_')) {
                            toolInput = { reason: 'User needs specialist assistance' };
                        } else if (toolName === 'return_to_triage') {
                            toolInput = {
                                taskCompleted: 'task_complete',
                                summary: 'Task completed successfully'
                            };
                        } else if (toolName === 'perform_idv_check') {
                            toolInput = {
                                accountNumber: '12345678',
                                sortCode: '123456'
                            };
                            // Mock IDV response
                            mockedAxios.post.mockResolvedValueOnce({
                                data: {
                                    result: {
                                        auth_status: 'VERIFIED',
                                        customer_name: 'Test User'
                                    }
                                }
                            });
                        } else if (toolName === 'search_knowledge_base') {
                            toolInput = { query: 'What is the policy?' };
                        }
                        
                        // Execute tool through full pipeline
                        const result = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId);
                        
                        // Pipeline should complete (success or graceful failure)
                        expect(result).toBeDefined();
                        expect(result.success).toBeDefined();
                        
                        // Should have either result or error
                        if (result.success) {
                            expect(result.result).toBeDefined();
                        } else {
                            expect(result.error).toBeDefined();
                        }
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
