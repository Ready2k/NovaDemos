/**
 * Text Mode Integration Test
 * 
 * Tests complete text interaction flow including:
 * - Session initialization
 * - Text input/output
 * - Tool execution
 * - Handoffs
 * 
 * Validates: Requirement 13.6 - Testing Support
 */

import { UnifiedRuntime, UnifiedRuntimeConfig } from '../../src/agent-runtime-unified';
import { MockWebSocket } from '../fixtures/mock-websocket';
import { simpleWorkflow, toolWorkflow, handoffWorkflow } from '../fixtures/test-workflows';
import { basicPersona, bankingPersona, triagePersona } from '../fixtures/test-personas';
import * as fs from 'fs';
import * as path from 'path';

describe('Text Mode Integration Tests', () => {
    let runtime: UnifiedRuntime;
    let testWorkflowPath: string;
    let testPersonaPath: string;
    let testPromptsPath: string;

    // Helper function to send messages via WebSocket
    const sendMessage = (ws: MockWebSocket, message: any) => {
        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
        ws.receiveMessage(messageStr);
    };

    // Helper function to initialize a session
    const initializeSession = async (ws: MockWebSocket, sessionId: string, memory?: any) => {
        sendMessage(ws, {
            type: 'session_init',
            sessionId,
            memory: memory || {}
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
    };

    beforeAll(() => {
        // Create temporary test directories
        const testDir = path.join(__dirname, '../temp-text');
        testWorkflowPath = path.join(testDir, 'workflows');
        testPersonaPath = path.join(testDir, 'personas');
        testPromptsPath = path.join(testDir, 'prompts');

        // Create directories
        [testDir, testWorkflowPath, testPersonaPath, testPromptsPath].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Write test workflows
        fs.writeFileSync(
            path.join(testWorkflowPath, 'test-simple.json'),
            JSON.stringify(simpleWorkflow, null, 2)
        );
        fs.writeFileSync(
            path.join(testWorkflowPath, 'test-tool.json'),
            JSON.stringify(toolWorkflow, null, 2)
        );
        fs.writeFileSync(
            path.join(testWorkflowPath, 'test-handoff.json'),
            JSON.stringify(handoffWorkflow, null, 2)
        );

        // Write test personas
        fs.writeFileSync(
            path.join(testPersonaPath, 'test-basic.json'),
            JSON.stringify(basicPersona, null, 2)
        );
        fs.writeFileSync(
            path.join(testPersonaPath, 'test-banking.json'),
            JSON.stringify(bankingPersona, null, 2)
        );
        fs.writeFileSync(
            path.join(testPersonaPath, 'test-triage.json'),
            JSON.stringify(triagePersona, null, 2)
        );

        // Write test prompts
        fs.writeFileSync(
            path.join(testPromptsPath, 'test-basic.txt'),
            'You are a helpful test assistant.'
        );
        fs.writeFileSync(
            path.join(testPromptsPath, 'test-banking.txt'),
            'You are a banking assistant that helps with account operations.'
        );
        fs.writeFileSync(
            path.join(testPromptsPath, 'test-triage.txt'),
            'You are a triage assistant that routes users to specialists.'
        );
    });

    afterAll(() => {
        // Clean up temporary test files
        const testDir = path.join(__dirname, '../temp-text');
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    afterEach(async () => {
        // Stop runtime after each test
        if (runtime) {
            await runtime.stop();
        }
    });

    describe('Session Initialization', () => {
        it('should initialize text session successfully', async () => {
            const config: UnifiedRuntimeConfig = {
                mode: 'text',
                agentId: 'test-text-agent',
                agentPort: 8101,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            expect(runtime.getMode()).toBe('text');
            expect(runtime.getActiveSessionCount()).toBe(0);

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            await initializeSession(ws, 'test-text-session-1');

            expect(runtime.getActiveSessionCount()).toBe(1);

            const connectedMessages = ws.findMessagesByType('connected');
            expect(connectedMessages.length).toBeGreaterThan(0);
        });

        it('should handle session initialization with memory', async () => {
            const config: UnifiedRuntimeConfig = {
                mode: 'text',
                agentId: 'test-text-agent-memory',
                agentPort: 8102,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            await initializeSession(ws, 'test-text-session-2', {
                verified: true,
                userName: 'Jane Smith',
                account: '87654321',
                sortCode: '654321',
                userIntent: 'check balance'
            });

            expect(runtime.getActiveSessionCount()).toBe(1);

            const connectedMessages = ws.findMessagesByType('connected');
            expect(connectedMessages.length).toBeGreaterThan(0);
        });
    });

    describe('Text Input/Output', () => {
        it('should handle text input and generate response', async () => {
            const config: UnifiedRuntimeConfig = {
                mode: 'text',
                agentId: 'test-text-agent-io',
                agentPort: 8104,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            await initializeSession(ws, 'test-text-session-4');

            // Send text input
            sendMessage(ws, {
                type: 'user_input',
                text: 'Hello, how are you?'
            });

            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verify transcript echo was sent (user message)
            const transcriptMessages = ws.findMessagesByType('transcript');
            const userTranscripts = transcriptMessages.filter(m => m.role === 'user');
            expect(userTranscripts.length).toBeGreaterThan(0);
            expect(userTranscripts[0].text).toBe('Hello, how are you?');

            // Verify no errors occurred
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 10000);
    });

    describe('Session Cleanup', () => {
        it('should clean up session on disconnect', async () => {
            const config: UnifiedRuntimeConfig = {
                mode: 'text',
                agentId: 'test-text-agent-cleanup',
                agentPort: 8110,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            await initializeSession(ws, 'test-text-session-10');

            expect(runtime.getActiveSessionCount()).toBe(1);

            // Trigger close event
            ws.close();
            ws.triggerEvent('close', {});

            await new Promise(resolve => setTimeout(resolve, 500));

            expect(runtime.getActiveSessionCount()).toBe(0);
        });

        it('should handle multiple sessions independently', async () => {
            const config: UnifiedRuntimeConfig = {
                mode: 'text',
                agentId: 'test-text-agent-multi-session',
                agentPort: 8111,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            // Create first session
            const ws1 = new MockWebSocket();
            runtime.handleConnection(ws1);
            await initializeSession(ws1, 'test-text-session-11a');

            // Create second session
            const ws2 = new MockWebSocket();
            runtime.handleConnection(ws2);
            await initializeSession(ws2, 'test-text-session-11b');

            expect(runtime.getActiveSessionCount()).toBe(2);

            // Disconnect first session
            ws1.close();
            ws1.triggerEvent('close', {});
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(runtime.getActiveSessionCount()).toBe(1);

            // Disconnect second session
            ws2.close();
            ws2.triggerEvent('close', {});
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(runtime.getActiveSessionCount()).toBe(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid JSON messages gracefully', async () => {
            const config: UnifiedRuntimeConfig = {
                mode: 'text',
                agentId: 'test-text-agent-invalid-json',
                agentPort: 8112,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Send invalid JSON
            ws.receiveMessage('{ invalid json }');

            await new Promise(resolve => setTimeout(resolve, 500));

            // Should send error message
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBeGreaterThan(0);
        });

        it('should handle missing workflow file', async () => {
            const config: UnifiedRuntimeConfig = {
                mode: 'text',
                agentId: 'test-text-agent-missing-workflow',
                agentPort: 8113,
                workflowFile: path.join(testWorkflowPath, 'non-existent.json'),
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);

            // Should throw error on start
            await expect(runtime.start()).rejects.toThrow('Workflow file not found');
        });
    });
});
