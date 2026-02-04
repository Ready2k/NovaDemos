/**
 * Property-Based Tests for Tool Result Caching
 * 
 * These tests verify that tool results are cached appropriately to reduce API calls:
 * - Tool results are cached for cacheable tools
 * - Cache hits reduce API calls
 * - Cache expiration works correctly
 * - Non-cacheable tools are not cached
 * 
 * Uses fast-check library for property-based testing with minimum 100 iterations.
 * 
 * NOTE: Tool result caching is not yet implemented in agent-core.ts.
 * These tests currently validate the non-cached behavior and will need to be updated
 * when caching is implemented.
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

// Custom arbitraries for cacheable tools
const cacheableBankingToolArbitrary = fc.constantFrom(
    'agentcore_balance',
    'get_account_transactions'
);

const cacheableKnowledgeBaseToolArbitrary = fc.constantFrom(
    'search_knowledge_base'
);

const cacheableToolArbitrary = fc.oneof(
    cacheableBankingToolArbitrary,
    cacheableKnowledgeBaseToolArbitrary
);

// Non-cacheable tools (tools that modify state or have side effects)
const nonCacheableToolArbitrary = fc.constantFrom(
    'perform_idv_check',
    'transfer_to_banking',
    'return_to_triage'
);

describe('Property-Based Tests: Tool Result Caching', () => {
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
     * Feature: voice-agnostic-agent-architecture, Property 8: Tool Result Caching
     * 
     * For any cacheable tool, executing the same tool with the same input twice should
     * return the cached result on the second call without re-executing.
     * 
     * **Validates: Requirements 8.6**
     * 
     * TODO: This test currently validates non-cached behavior. Update when caching is implemented.
     */
    describe('Property 8: Tool Result Caching', () => {
        it('should execute cacheable tools without caching (current behavior)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: cacheableToolArbitrary,
                        toolUseId1: fc.uuid(),
                        toolUseId2: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId1, toolUseId2 }) => {
                        const agentCore = createAgentCore();
                        const mockToolsClient = (agentCore as any).toolsClient;
                        
                        agentCore.initializeSession(sessionId);
                        
                        // Setup appropriate input based on tool type
                        let toolInput: any = {};
                        
                        if (toolName === 'search_knowledge_base') {
                            toolInput = { query: 'What is the policy?' };
                        } else if (toolName === 'agentcore_balance') {
                            toolInput = {};
                        } else if (toolName === 'get_account_transactions') {
                            toolInput = {};
                        }
                        
                        // Execute tool first time
                        const result1 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId1);
                        
                        // Execute tool second time with same input
                        const result2 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId2);
                        
                        // Both should succeed
                        expect(result1.success).toBe(true);
                        expect(result2.success).toBe(true);
                        
                        // TODO: When caching is implemented, verify:
                        // 1. Second call should return cached result
                        // 2. API should only be called once
                        // 3. Results should be identical
                        
                        // Current behavior: Both calls execute the tool
                        // For knowledge base tools, ToolsClient is called twice
                        if (toolName === 'search_knowledge_base') {
                            expect(mockToolsClient.executeTool).toHaveBeenCalledTimes(2);
                        }
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should execute banking tools without caching (current behavior)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: cacheableBankingToolArbitrary,
                        toolUseId1: fc.uuid(),
                        toolUseId2: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId1, toolUseId2 }) => {
                        jest.clearAllMocks();
                        
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        const toolInput = {};
                        
                        // Mock axios responses
                        mockedAxios.post
                            .mockResolvedValueOnce({
                                data: {
                                    result: { balance: 1000, timestamp: Date.now() }
                                }
                            })
                            .mockResolvedValueOnce({
                                data: {
                                    result: { balance: 1000, timestamp: Date.now() }
                                }
                            });
                        
                        // Execute tool first time
                        const result1 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId1);
                        
                        // Execute tool second time with same input
                        const result2 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId2);
                        
                        // Both should succeed
                        expect(result1.success).toBe(true);
                        expect(result2.success).toBe(true);
                        
                        // TODO: When caching is implemented, verify:
                        // 1. Second call should return cached result
                        // 2. local-tools API should only be called once
                        // 3. Results should be identical
                        
                        // Current behavior: Both calls execute the tool
                        expect(mockedAxios.post).toHaveBeenCalledTimes(2);
                        expect(mockedAxios.post).toHaveBeenCalledWith(
                            'http://localhost:9000/tools/execute',
                            expect.objectContaining({
                                tool: toolName,
                                input: toolInput
                            })
                        );
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should not cache non-cacheable tools', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: nonCacheableToolArbitrary,
                        toolUseId1: fc.uuid(),
                        toolUseId2: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId1, toolUseId2 }) => {
                        jest.clearAllMocks();
                        
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Setup appropriate input based on tool type
                        let toolInput: any = {};
                        
                        if (toolName === 'perform_idv_check') {
                            toolInput = {
                                accountNumber: '12345678',
                                sortCode: '123456'
                            };
                            
                            // Mock IDV responses
                            mockedAxios.post
                                .mockResolvedValueOnce({
                                    data: {
                                        result: {
                                            auth_status: 'VERIFIED',
                                            customer_name: 'Test User'
                                        }
                                    }
                                })
                                .mockResolvedValueOnce({
                                    data: {
                                        result: {
                                            auth_status: 'VERIFIED',
                                            customer_name: 'Test User'
                                        }
                                    }
                                });
                        } else if (toolName.startsWith('transfer_to_')) {
                            toolInput = { reason: 'User needs specialist assistance' };
                        } else if (toolName === 'return_to_triage') {
                            toolInput = {
                                taskCompleted: 'task_complete',
                                summary: 'Task completed successfully'
                            };
                        }
                        
                        // Execute tool first time
                        const result1 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId1);
                        
                        // Execute tool second time with same input
                        const result2 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId2);
                        
                        // Both should succeed
                        expect(result1.success).toBe(true);
                        expect(result2.success).toBe(true);
                        
                        // Non-cacheable tools should always execute
                        // (This is the expected behavior even when caching is implemented)
                        if (toolName === 'perform_idv_check') {
                            expect(mockedAxios.post).toHaveBeenCalledTimes(2);
                        }
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle different inputs separately (no cross-contamination)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        query1: fc.string({ minLength: 5, maxLength: 50 }),
                        query2: fc.string({ minLength: 5, maxLength: 50 }).filter(q2 => q2 !== ''),
                        toolUseId1: fc.uuid(),
                        toolUseId2: fc.uuid()
                    }),
                    async ({ sessionId, query1, query2, toolUseId1, toolUseId2 }) => {
                        // Skip if queries are the same
                        if (query1 === query2) {
                            return;
                        }
                        
                        const agentCore = createAgentCore();
                        const mockToolsClient = (agentCore as any).toolsClient;
                        
                        agentCore.initializeSession(sessionId);
                        
                        const toolName = 'search_knowledge_base';
                        
                        // Execute tool with first input
                        const result1 = await agentCore.executeTool(
                            sessionId,
                            toolName,
                            { query: query1 },
                            toolUseId1
                        );
                        
                        // Execute tool with different input
                        const result2 = await agentCore.executeTool(
                            sessionId,
                            toolName,
                            { query: query2 },
                            toolUseId2
                        );
                        
                        // Both should succeed
                        expect(result1.success).toBe(true);
                        expect(result2.success).toBe(true);
                        
                        // TODO: When caching is implemented, verify:
                        // 1. Different inputs should not share cache entries
                        // 2. Both calls should execute (no cache hit)
                        
                        // Current behavior: Both calls execute the tool
                        expect(mockToolsClient.executeTool).toHaveBeenCalledTimes(2);
                        expect(mockToolsClient.executeTool).toHaveBeenNthCalledWith(
                            1,
                            toolName,
                            { query: query1 }
                        );
                        expect(mockToolsClient.executeTool).toHaveBeenNthCalledWith(
                            2,
                            toolName,
                            { query: query2 }
                        );
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle cache expiration correctly (placeholder for future implementation)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: cacheableToolArbitrary,
                        toolUseId1: fc.uuid(),
                        toolUseId2: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId1, toolUseId2 }) => {
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        // Setup appropriate input
                        let toolInput: any = {};
                        if (toolName === 'search_knowledge_base') {
                            toolInput = { query: 'What is the policy?' };
                        }
                        
                        // Execute tool first time
                        const result1 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId1);
                        
                        // TODO: When caching is implemented with TTL:
                        // 1. Wait for cache expiration (or mock time)
                        // 2. Execute tool second time
                        // 3. Verify cache miss and re-execution
                        
                        // Execute tool second time (no delay in current implementation)
                        const result2 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId2);
                        
                        // Both should succeed
                        expect(result1.success).toBe(true);
                        expect(result2.success).toBe(true);
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle cache across different sessions (placeholder for future implementation)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId1: fc.uuid(),
                        sessionId2: fc.uuid(),
                        toolName: cacheableToolArbitrary,
                        toolUseId1: fc.uuid(),
                        toolUseId2: fc.uuid()
                    }),
                    async ({ sessionId1, sessionId2, toolName, toolUseId1, toolUseId2 }) => {
                        // Skip if sessions are the same
                        if (sessionId1 === sessionId2) {
                            return;
                        }
                        
                        const agentCore = createAgentCore();
                        
                        // Setup appropriate input
                        let toolInput: any = {};
                        if (toolName === 'search_knowledge_base') {
                            toolInput = { query: 'What is the policy?' };
                        }
                        
                        // Execute tool in first session
                        agentCore.initializeSession(sessionId1);
                        const result1 = await agentCore.executeTool(sessionId1, toolName, toolInput, toolUseId1);
                        agentCore.endSession(sessionId1);
                        
                        // TODO: When caching is implemented:
                        // 1. Decide if cache should be shared across sessions
                        // 2. If shared, verify cache hit in second session
                        // 3. If not shared, verify cache miss in second session
                        
                        // Execute tool in second session
                        agentCore.initializeSession(sessionId2);
                        const result2 = await agentCore.executeTool(sessionId2, toolName, toolInput, toolUseId2);
                        agentCore.endSession(sessionId2);
                        
                        // Both should succeed
                        expect(result1.success).toBe(true);
                        expect(result2.success).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle cache invalidation on errors (placeholder for future implementation)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: cacheableBankingToolArbitrary,
                        toolUseId1: fc.uuid(),
                        toolUseId2: fc.uuid(),
                        toolUseId3: fc.uuid()
                    }),
                    async ({ sessionId, toolName, toolUseId1, toolUseId2, toolUseId3 }) => {
                        jest.clearAllMocks();
                        
                        const agentCore = createAgentCore();
                        agentCore.initializeSession(sessionId);
                        
                        const toolInput = {};
                        
                        // Mock first call success
                        mockedAxios.post.mockResolvedValueOnce({
                            data: {
                                result: { balance: 1000 }
                            }
                        });
                        
                        // Execute tool first time (success)
                        const result1 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId1);
                        expect(result1.success).toBe(true);
                        
                        // Mock second call failure
                        mockedAxios.post.mockRejectedValueOnce(new Error('Service unavailable'));
                        
                        // Execute tool second time (failure)
                        const result2 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId2);
                        expect(result2.success).toBe(false);
                        
                        // TODO: When caching is implemented:
                        // 1. Decide if errors should invalidate cache
                        // 2. If yes, verify cache is cleared on error
                        // 3. If no, verify cached result is still returned
                        
                        // Mock third call success
                        mockedAxios.post.mockResolvedValueOnce({
                            data: {
                                result: { balance: 1000 }
                            }
                        });
                        
                        // Execute tool third time (success again)
                        const result3 = await agentCore.executeTool(sessionId, toolName, toolInput, toolUseId3);
                        expect(result3.success).toBe(true);
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should reduce API calls with caching (placeholder for future implementation)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionId: fc.uuid(),
                        toolName: cacheableToolArbitrary,
                        numCalls: fc.integer({ min: 2, max: 5 })
                    }),
                    async ({ sessionId, toolName, numCalls }) => {
                        jest.clearAllMocks();
                        
                        const agentCore = createAgentCore();
                        const mockToolsClient = (agentCore as any).toolsClient;
                        
                        agentCore.initializeSession(sessionId);
                        
                        // Setup appropriate input
                        let toolInput: any = {};
                        if (toolName === 'search_knowledge_base') {
                            toolInput = { query: 'What is the policy?' };
                        } else if (toolName === 'agentcore_balance') {
                            toolInput = {};
                            // Mock axios responses for banking tools
                            for (let i = 0; i < numCalls; i++) {
                                mockedAxios.post.mockResolvedValueOnce({
                                    data: {
                                        result: { balance: 1000 }
                                    }
                                });
                            }
                        } else if (toolName === 'get_account_transactions') {
                            toolInput = {};
                            // Mock axios responses for banking tools
                            for (let i = 0; i < numCalls; i++) {
                                mockedAxios.post.mockResolvedValueOnce({
                                    data: {
                                        result: { transactions: [] }
                                    }
                                });
                            }
                        }
                        
                        // Execute tool multiple times with same input
                        const results = [];
                        for (let i = 0; i < numCalls; i++) {
                            const result = await agentCore.executeTool(
                                sessionId,
                                toolName,
                                toolInput,
                                `tool-use-${i}`
                            );
                            results.push(result);
                        }
                        
                        // All should succeed
                        results.forEach(result => {
                            expect(result.success).toBe(true);
                        });
                        
                        // TODO: When caching is implemented, verify:
                        // 1. API should only be called once (first call)
                        // 2. Subsequent calls should return cached result
                        // 3. All results should be identical
                        
                        // Current behavior: API is called every time
                        if (toolName === 'search_knowledge_base') {
                            expect(mockToolsClient.executeTool).toHaveBeenCalledTimes(numCalls);
                        } else {
                            expect(mockedAxios.post).toHaveBeenCalledTimes(numCalls);
                        }
                        
                        agentCore.endSession(sessionId);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
