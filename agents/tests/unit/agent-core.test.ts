/**
 * Unit tests for Agent Core
 */

import { AgentCore, AgentCoreConfig, SessionContext } from '../../src/agent-core';
import { GraphExecutor } from '../../src/graph-executor';
import { WorkflowDefinition } from '../../src/graph-types';
import { ToolsClient } from '../../src/tools-client';
import { DecisionEvaluator } from '../../src/decision-evaluator';
import { PersonaConfig } from '../../src/persona-types';

// Mock workflow definition
const mockWorkflow: WorkflowDefinition = {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: [
        { id: 'start', type: 'start', label: 'Start' },
        { id: 'greeting', type: 'message', label: 'Greeting', message: 'Hello!' }
    ],
    edges: [
        { from: 'start', to: 'greeting', label: 'begin' }
    ],
    testConfig: {
        personaId: 'test-persona'
    }
};

// Mock persona config
const mockPersona: PersonaConfig = {
    id: 'test-persona',
    name: 'Test Persona',
    description: 'Test persona for unit tests',
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

describe('AgentCore', () => {
    let agentCore: AgentCore;
    let mockToolsClient: ToolsClient;
    let mockDecisionEvaluator: DecisionEvaluator;
    let mockGraphExecutor: GraphExecutor;

    beforeEach(() => {
        // Create mock dependencies
        mockToolsClient = new ToolsClient('http://localhost:9000');
        mockDecisionEvaluator = new DecisionEvaluator('us-east-1');
        mockGraphExecutor = new GraphExecutor(mockWorkflow);

        // Create agent core config
        const config: AgentCoreConfig = {
            agentId: 'test-agent',
            workflowDef: mockWorkflow,
            personaConfig: mockPersona,
            toolsClient: mockToolsClient,
            decisionEvaluator: mockDecisionEvaluator,
            graphExecutor: mockGraphExecutor,
            localToolsUrl: 'http://localhost:9000'
        };

        agentCore = new AgentCore(config);
    });

    describe('Session Management', () => {
        it('should initialize a new session', () => {
            const sessionId = 'test-session-1';
            const session = agentCore.initializeSession(sessionId);

            expect(session).toBeDefined();
            expect(session.sessionId).toBe(sessionId);
            expect(session.messages).toEqual([]);
            expect(session.currentNode).toBe('start');
        });

        it('should initialize session with memory', () => {
            const sessionId = 'test-session-2';
            const memory = {
                verified: true,
                userName: 'John Doe',
                account: '12345678',
                sortCode: '123456'
            };

            const session = agentCore.initializeSession(sessionId, memory);

            expect(session.verifiedUser).toBeDefined();
            expect(session.verifiedUser?.customer_name).toBe('John Doe');
            expect(session.verifiedUser?.account).toBe('12345678');
            expect(session.verifiedUser?.sortCode).toBe('123456');
            expect(session.verifiedUser?.auth_status).toBe('VERIFIED');
        });

        it('should initialize session with user intent', () => {
            const sessionId = 'test-session-3';
            const memory = {
                userIntent: 'Check my balance'
            };

            const session = agentCore.initializeSession(sessionId, memory);

            expect(session.userIntent).toBe('Check my balance');
        });

        it('should get an existing session', () => {
            const sessionId = 'test-session-4';
            agentCore.initializeSession(sessionId);

            const session = agentCore.getSession(sessionId);

            expect(session).toBeDefined();
            expect(session?.sessionId).toBe(sessionId);
        });

        it('should return undefined for non-existent session', () => {
            const session = agentCore.getSession('non-existent');

            expect(session).toBeUndefined();
        });

        it('should end session and clean up', () => {
            const sessionId = 'test-session-5';
            agentCore.initializeSession(sessionId);

            agentCore.endSession(sessionId);

            const session = agentCore.getSession(sessionId);
            expect(session).toBeUndefined();
        });
    });

    describe('Session Memory', () => {
        it('should update session memory', () => {
            const sessionId = 'test-session-6';
            agentCore.initializeSession(sessionId);

            const memory = {
                verified: true,
                userName: 'Jane Smith',
                account: '87654321',
                sortCode: '654321'
            };

            agentCore.updateSessionMemory(sessionId, memory);

            const session = agentCore.getSession(sessionId);
            expect(session?.verifiedUser?.customer_name).toBe('Jane Smith');
        });

        it('should get session memory', () => {
            const sessionId = 'test-session-7';
            const initialMemory = {
                verified: true,
                userName: 'Bob Johnson',
                account: '11111111',
                sortCode: '111111',
                userIntent: 'Get transactions'
            };

            agentCore.initializeSession(sessionId, initialMemory);

            const memory = agentCore.getSessionMemory(sessionId);

            expect(memory.verified).toBe(true);
            expect(memory.userName).toBe('Bob Johnson');
            expect(memory.account).toBe('11111111');
            expect(memory.sortCode).toBe('111111');
            expect(memory.userIntent).toBe('Get transactions');
        });

        it('should return empty object for non-existent session memory', () => {
            const memory = agentCore.getSessionMemory('non-existent');

            expect(memory).toEqual({});
        });
    });

    describe('System Prompt Generation', () => {
        it('should generate system prompt without context', () => {
            const sessionId = 'test-session-8';
            agentCore.initializeSession(sessionId);

            const prompt = agentCore.getSystemPrompt(sessionId);

            expect(prompt).toBeDefined();
            expect(prompt.length).toBeGreaterThan(0);
        });

        it('should inject verified user context into system prompt', () => {
            const sessionId = 'test-session-9';
            const memory = {
                verified: true,
                userName: 'Alice Brown',
                account: '22222222',
                sortCode: '222222'
            };

            agentCore.initializeSession(sessionId, memory);

            const prompt = agentCore.getSystemPrompt(sessionId);

            expect(prompt).toContain('CURRENT SESSION CONTEXT');
            expect(prompt).toContain('Alice Brown');
            expect(prompt).toContain('22222222');
            expect(prompt).toContain('VERIFIED');
        });

        it('should inject user intent into system prompt', () => {
            const sessionId = 'test-session-10';
            const memory = {
                userIntent: 'Check my balance'
            };

            agentCore.initializeSession(sessionId, memory);

            const prompt = agentCore.getSystemPrompt(sessionId);

            expect(prompt).toContain('CURRENT SESSION CONTEXT');
            expect(prompt).toContain('Check my balance');
        });
    });

    describe('Workflow State Management', () => {
        it('should update workflow state', () => {
            const sessionId = 'test-session-11';
            agentCore.initializeSession(sessionId);

            const update = agentCore.updateWorkflowState(sessionId, 'greeting');

            expect(update.currentNode).toBe('greeting');
            expect(update.previousNode).toBe('start');
        });
    });

    describe('Configuration Access', () => {
        it('should get persona config', () => {
            const persona = agentCore.getPersonaConfig();

            expect(persona).toBeDefined();
            expect(persona?.id).toBe('test-persona');
            expect(persona?.name).toBe('Test Persona');
        });

        it('should get workflow definition', () => {
            const workflow = agentCore.getWorkflowDefinition();

            expect(workflow).toBeDefined();
            expect(workflow?.id).toBe('test-workflow');
            expect(workflow?.name).toBe('Test Workflow');
        });

        it('should get all tools', () => {
            const tools = agentCore.getAllTools();

            expect(tools).toBeDefined();
            expect(Array.isArray(tools)).toBe(true);
            expect(tools.length).toBeGreaterThan(0);
        });
    });

    describe('Message Processing', () => {
        it('should process user message', async () => {
            const sessionId = 'test-session-12';
            agentCore.initializeSession(sessionId);

            const response = await agentCore.processUserMessage(sessionId, 'Hello');

            expect(response).toBeDefined();
            expect(response.type).toBe('text');

            const session = agentCore.getSession(sessionId);
            expect(session?.messages.length).toBe(1);
            expect(session?.messages[0].role).toBe('user');
            expect(session?.messages[0].content).toBe('Hello');
        });

        it('should return error for non-existent session', async () => {
            const response = await agentCore.processUserMessage('non-existent', 'Hello');

            expect(response.type).toBe('error');
            expect(response.error).toBe('Session not found');
        });
    });

    describe('Handoff Management', () => {
        it('should create handoff request', () => {
            const sessionId = 'test-session-13';
            agentCore.initializeSession(sessionId);

            const handoff = agentCore.requestHandoff(sessionId, 'banking', {
                reason: 'User needs banking services'
            });

            expect(handoff).toBeDefined();
            expect(handoff.context.fromAgent).toBe('test-agent');
            expect(handoff.context.targetAgent).toBe('banking');
            expect(handoff.context.reason).toBe('User needs banking services');
        });

        it('should include verified user in handoff', () => {
            const sessionId = 'test-session-14';
            const memory = {
                verified: true,
                userName: 'Charlie Davis',
                account: '33333333',
                sortCode: '333333'
            };

            agentCore.initializeSession(sessionId, memory);

            const handoff = agentCore.requestHandoff(sessionId, 'banking', {
                reason: 'User needs banking services'
            });

            expect(handoff.context.verified).toBe(true);
            expect(handoff.context.userName).toBe('Charlie Davis');
            expect(handoff.context.account).toBe('33333333');
            expect(handoff.context.sortCode).toBe('333333');
        });

        it('should handle return handoff', () => {
            const sessionId = 'test-session-15';
            agentCore.initializeSession(sessionId);

            const handoff = agentCore.requestHandoff(sessionId, 'triage', {
                isReturn: true,
                taskCompleted: 'balance_check',
                summary: 'Balance checked successfully'
            });

            expect(handoff.context.isReturn).toBe(true);
            expect(handoff.context.taskCompleted).toBe('balance_check');
            expect(handoff.context.summary).toBe('Balance checked successfully');
        });

        it('should include user intent in handoff context', () => {
            const sessionId = 'test-session-16';
            const memory = {
                userIntent: 'Check my account balance'
            };

            agentCore.initializeSession(sessionId, memory);

            const handoff = agentCore.requestHandoff(sessionId, 'banking', {
                reason: 'User needs banking services'
            });

            expect(handoff.context.userIntent).toBe('Check my account balance');
        });

        it('should include full LangGraph state in handoff', () => {
            const sessionId = 'test-session-17';
            agentCore.initializeSession(sessionId);

            const handoff = agentCore.requestHandoff(sessionId, 'banking', {
                reason: 'User needs banking services'
            });

            expect(handoff.graphState).toBeDefined();
            expect(handoff.graphState.sessionId).toBe(sessionId);
            expect(handoff.graphState.currentNode).toBeDefined();
        });

        it('should extract last user message for handoff context', () => {
            const sessionId = 'test-session-18';
            agentCore.initializeSession(sessionId);
            
            // Add a user message
            agentCore.processUserMessage(sessionId, 'I need to check my balance');

            const handoff = agentCore.requestHandoff(sessionId, 'banking', {
                reason: 'User needs banking services'
            });

            expect(handoff.context.lastUserMessage).toBe('I need to check my balance');
        });
    });

    describe('Handoff Tool Execution', () => {
        it('should detect and execute transfer_to_banking handoff tool', async () => {
            const sessionId = 'test-session-19';
            agentCore.initializeSession(sessionId);

            const result = await agentCore.executeTool(
                sessionId,
                'transfer_to_banking',
                { reason: 'User needs balance check' },
                'tool-use-1'
            );

            expect(result.success).toBe(true);
            expect(result.result.handoffRequest).toBeDefined();
            expect(result.result.handoffRequest.targetAgentId).toBe('persona-SimpleBanking');
            expect(result.result.handoffRequest.context.reason).toBe('User needs balance check');
        });

        it('should detect and execute return_to_triage handoff tool', async () => {
            const sessionId = 'test-session-20';
            agentCore.initializeSession(sessionId);

            const result = await agentCore.executeTool(
                sessionId,
                'return_to_triage',
                { 
                    taskCompleted: 'balance_check',
                    summary: 'Successfully checked balance'
                },
                'tool-use-2'
            );

            expect(result.success).toBe(true);
            expect(result.result.handoffRequest).toBeDefined();
            expect(result.result.handoffRequest.context.isReturn).toBe(true);
            expect(result.result.handoffRequest.context.taskCompleted).toBe('balance_check');
            expect(result.result.handoffRequest.context.summary).toBe('Successfully checked balance');
        });

        it('should include verified user in handoff tool execution', async () => {
            const sessionId = 'test-session-21';
            const memory = {
                verified: true,
                userName: 'David Wilson',
                account: '44444444',
                sortCode: '444444'
            };

            agentCore.initializeSession(sessionId, memory);

            const result = await agentCore.executeTool(
                sessionId,
                'transfer_to_banking',
                { reason: 'User needs banking services' },
                'tool-use-3'
            );

            expect(result.success).toBe(true);
            expect(result.result.handoffRequest.context.verified).toBe(true);
            expect(result.result.handoffRequest.context.userName).toBe('David Wilson');
            expect(result.result.handoffRequest.context.account).toBe('44444444');
        });

        it('should handle handoff tool with missing reason', async () => {
            const sessionId = 'test-session-22';
            const memory = {
                userIntent: 'Check my transactions'
            };

            agentCore.initializeSession(sessionId, memory);

            const result = await agentCore.executeTool(
                sessionId,
                'transfer_to_banking',
                {},
                'tool-use-4'
            );

            expect(result.success).toBe(true);
            // Should use userIntent as fallback reason
            expect(result.result.handoffRequest.context.reason).toBe('Check my transactions');
        });

        it('should validate handoff tool input', async () => {
            const sessionId = 'test-session-23';
            agentCore.initializeSession(sessionId);

            const result = await agentCore.executeTool(
                sessionId,
                'return_to_triage',
                { reason: 'Invalid - missing required fields' },
                'tool-use-5'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('taskCompleted');
        });
    });
});
