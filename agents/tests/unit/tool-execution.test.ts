/**
 * Unit Tests for Tool Execution Pipeline
 * 
 * Tests the comprehensive tool execution pipeline in Agent Core:
 * - Tool type detection
 * - Input validation
 * - Routing to appropriate services
 * - Error handling
 */

import { AgentCore, AgentCoreConfig } from '../../src/agent-core';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { GraphExecutor } from '../../src/graph-executor';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Tool Execution Pipeline', () => {
    let agentCore: AgentCore;
    let mockToolsClient: jest.Mocked<ToolsClient>;
    let mockDecisionEvaluator: jest.Mocked<DecisionEvaluator>;
    
    beforeEach(() => {
        // Create mock ToolsClient
        mockToolsClient = {
            executeTool: jest.fn(),
            discoverLocalTools: jest.fn()
        } as any;
        
        // Create mock DecisionEvaluator
        mockDecisionEvaluator = {
            evaluate: jest.fn()
        } as any;
        
        // Create AgentCore config
        const config: AgentCoreConfig = {
            agentId: 'test-agent',
            workflowDef: null,
            personaConfig: null,
            toolsClient: mockToolsClient,
            decisionEvaluator: mockDecisionEvaluator,
            graphExecutor: null,
            localToolsUrl: 'http://local-tools:9000'
        };
        
        agentCore = new AgentCore(config);
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Tool Type Detection', () => {
        it('should detect handoff tools', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            const result = await agentCore.executeTool(
                sessionId,
                'transfer_to_banking',
                { reason: 'User needs balance check' },
                'tool-use-1'
            );
            
            expect(result.success).toBe(true);
            expect(result.result.message).toBe('Handoff initiated');
        });
        
        it('should detect banking tools', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: { balance: 1000 }
                }
            });
            
            const result = await agentCore.executeTool(
                sessionId,
                'agentcore_balance',
                {},
                'tool-use-1'
            );
            
            expect(result.success).toBe(true);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://local-tools:9000/tools/execute',
                {
                    tool: 'agentcore_balance',
                    input: {}
                }
            );
        });
        
        it('should detect knowledge base tools', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockToolsClient.executeTool.mockResolvedValue({
                success: true,
                result: { answer: 'Test answer' }
            });
            
            const result = await agentCore.executeTool(
                sessionId,
                'search_knowledge_base',
                { query: 'What is the policy?' },
                'tool-use-1'
            );
            
            expect(result.success).toBe(true);
            expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
                'search_knowledge_base',
                { query: 'What is the policy?' }
            );
        });
        
        it('should route unknown tools to ToolsClient', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockToolsClient.executeTool.mockResolvedValue({
                success: true,
                result: { data: 'test' }
            });
            
            const result = await agentCore.executeTool(
                sessionId,
                'unknown_tool',
                { param: 'value' },
                'tool-use-1'
            );
            
            expect(result.success).toBe(true);
            expect(mockToolsClient.executeTool).toHaveBeenCalled();
        });
    });
    
    describe('Input Validation', () => {
        it('should validate handoff tool input - transfer_to_*', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            // Missing reason is OK - will use userIntent or default
            const result = await agentCore.executeTool(
                sessionId,
                'transfer_to_banking',
                {},
                'tool-use-1'
            );
            
            // Should succeed with default reason
            expect(result.success).toBe(true);
            expect(result.result.handoffRequest).toBeDefined();
            expect(result.result.handoffRequest.context.reason).toBe('User needs specialist assistance');
        });
        
        it('should validate handoff tool input - return_to_triage', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            // Missing taskCompleted
            const result = await agentCore.executeTool(
                sessionId,
                'return_to_triage',
                { summary: 'Done' },
                'tool-use-1'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('taskCompleted is required');
        });
        
        it('should validate banking tool input - perform_idv_check', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            // Missing accountNumber
            const result = await agentCore.executeTool(
                sessionId,
                'perform_idv_check',
                { sortCode: '123456' },
                'tool-use-1'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('accountNumber is required');
        });
        
        it('should validate knowledge base tool input', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            // Missing query
            const result = await agentCore.executeTool(
                sessionId,
                'search_knowledge_base',
                {},
                'tool-use-1'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('query is required');
        });
        
        it('should reject non-object input', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            const result = await agentCore.executeTool(
                sessionId,
                'some_tool',
                'invalid input' as any,
                'tool-use-1'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Tool input must be an object');
        });
    });
    
    describe('Tool Execution', () => {
        it('should execute banking tool and handle IDV result', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        auth_status: 'VERIFIED',
                        customer_name: 'John Doe'
                    }
                }
            });
            
            const result = await agentCore.executeTool(
                sessionId,
                'perform_idv_check',
                { accountNumber: '12345678', sortCode: '123456' },
                'tool-use-1'
            );
            
            expect(result.success).toBe(true);
            
            // Check that verified user was stored in session
            const session = agentCore.getSession(sessionId);
            expect(session?.verifiedUser).toBeDefined();
            expect(session?.verifiedUser?.customer_name).toBe('John Doe');
            expect(session?.verifiedUser?.auth_status).toBe('VERIFIED');
        });
        
        it('should execute banking tool via local-tools service', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: { balance: 5000 }
                }
            });
            
            const result = await agentCore.executeTool(
                sessionId,
                'agentcore_balance',
                {},
                'tool-use-1'
            );
            
            expect(result.success).toBe(true);
            expect(result.result.balance).toBe(5000);
        });
        
        it('should execute knowledge base tool via ToolsClient', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockToolsClient.executeTool.mockResolvedValue({
                success: true,
                result: { answer: 'Policy answer' }
            });
            
            const result = await agentCore.executeTool(
                sessionId,
                'search_knowledge_base',
                { query: 'What is the refund policy?' },
                'tool-use-1'
            );
            
            expect(result.success).toBe(true);
            expect(result.result.answer).toBe('Policy answer');
        });
    });
    
    describe('Error Handling', () => {
        it('should handle session not found', async () => {
            const result = await agentCore.executeTool(
                'non-existent-session',
                'some_tool',
                {},
                'tool-use-1'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Session not found');
        });
        
        it('should handle banking tool execution error', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockedAxios.post.mockRejectedValue(new Error('Network error'));
            
            const result = await agentCore.executeTool(
                sessionId,
                'agentcore_balance',
                {},
                'tool-use-1'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
        
        it('should handle ToolsClient execution error', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockToolsClient.executeTool.mockResolvedValue({
                success: false,
                error: 'Tool not found'
            });
            
            const result = await agentCore.executeTool(
                sessionId,
                'unknown_tool',
                {},
                'tool-use-1'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Tool not found');
        });
        
        it('should handle unexpected errors gracefully', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockToolsClient.executeTool.mockRejectedValue(new Error('Unexpected error'));
            
            const result = await agentCore.executeTool(
                sessionId,
                'some_tool',
                {},
                'tool-use-1'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });
    
    describe('Tool Routing', () => {
        it('should route handoff tools correctly', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            const result = await agentCore.executeTool(
                sessionId,
                'transfer_to_idv',
                { reason: 'User needs verification' },
                'tool-use-1'
            );
            
            expect(result.success).toBe(true);
            expect(result.result.toolName).toBe('transfer_to_idv');
        });
        
        it('should route banking tools to local-tools service', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockedAxios.post.mockResolvedValue({
                data: { result: { transactions: [] } }
            });
            
            await agentCore.executeTool(
                sessionId,
                'get_account_transactions',
                {},
                'tool-use-1'
            );
            
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://local-tools:9000/tools/execute',
                expect.objectContaining({
                    tool: 'get_account_transactions'
                })
            );
        });
        
        it('should route knowledge base tools to ToolsClient', async () => {
            const sessionId = 'session-123';
            agentCore.initializeSession(sessionId);
            
            mockToolsClient.executeTool.mockResolvedValue({
                success: true,
                result: {}
            });
            
            await agentCore.executeTool(
                sessionId,
                'search_knowledge_base',
                { query: 'test' },
                'tool-use-1'
            );
            
            expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
                'search_knowledge_base',
                { query: 'test' }
            );
        });
    });
});
