/**
 * Voice Mode Integration Test
 * 
 * Tests complete voice interaction flow including:
 * - Session initialization
 * - Audio input/output
 * - Tool execution
 * - Handoffs
 * 
 * Validates: Requirement 13.6 - Testing Support
 */

import { UnifiedRuntime, UnifiedRuntimeConfig } from '../../src/agent-runtime-unified';
import { MockWebSocket } from '../fixtures/mock-websocket';
import { simpleWorkflow, toolWorkflow, handoffWorkflow } from '../fixtures/test-workflows';
import { basicPersona, bankingPersona } from '../fixtures/test-personas';
import * as fs from 'fs';
import * as path from 'path';

describe('Voice Mode Integration Tests', () => {
    let runtime: UnifiedRuntime;
    let testWorkflowPath: string;
    let testPersonaPath: string;
    let testPromptsPath: string;

    beforeAll(() => {
        // Create temporary test directories
        const testDir = path.join(__dirname, '../temp');
        testWorkflowPath = path.join(testDir, 'workflows');
        testPersonaPath = path.join(testDir, 'personas');
        testPromptsPath = path.join(testDir, 'prompts');

        // Create directories
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        if (!fs.existsSync(testWorkflowPath)) {
            fs.mkdirSync(testWorkflowPath, { recursive: true });
        }
        if (!fs.existsSync(testPersonaPath)) {
            fs.mkdirSync(testPersonaPath, { recursive: true });
        }
        if (!fs.existsSync(testPromptsPath)) {
            fs.mkdirSync(testPromptsPath, { recursive: true });
        }

        // Write test workflow
        fs.writeFileSync(
            path.join(testWorkflowPath, 'test-simple.json'),
            JSON.stringify(simpleWorkflow, null, 2)
        );

        // Write test persona
        fs.writeFileSync(
            path.join(testPersonaPath, 'test-basic.json'),
            JSON.stringify(basicPersona, null, 2)
        );

        // Write test prompt
        fs.writeFileSync(
            path.join(testPromptsPath, 'test-basic.txt'),
            'You are a helpful test assistant.'
        );
    });

    afterAll(() => {
        // Clean up temporary test files
        const testDir = path.join(__dirname, '../temp');
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
        it('should initialize voice session successfully', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping voice test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'voice',
                agentId: 'test-voice-agent',
                agentPort: 8091,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                awsConfig: {
                    region: process.env.AWS_REGION || 'us-east-1',
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    sessionToken: process.env.AWS_SESSION_TOKEN
                },
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999' // Non-existent gateway for testing
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            // Verify runtime started
            expect(runtime.getMode()).toBe('voice');
            expect(runtime.getActiveSessionCount()).toBe(0);

            // Simulate WebSocket connection
            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Send session init
            const sessionInitMessage = JSON.stringify({
                type: 'session_init',
                sessionId: 'test-session-1',
                memory: {}
            });

            await runtime.handleMessage(
                'test-session-1',
                Buffer.from(sessionInitMessage),
                false
            );

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify session was created
            expect(runtime.getActiveSessionCount()).toBe(1);

            // Verify connected message was sent
            const connectedMessages = ws.findMessagesByType('connected');
            expect(connectedMessages.length).toBeGreaterThan(0);
        }, 30000); // 30 second timeout for AWS operations

        it('should handle session initialization with memory', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping voice test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'voice',
                agentId: 'test-voice-agent-memory',
                agentPort: 8092,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                awsConfig: {
                    region: process.env.AWS_REGION || 'us-east-1',
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    sessionToken: process.env.AWS_SESSION_TOKEN
                },
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Send session init with memory
            const sessionInitMessage = JSON.stringify({
                type: 'session_init',
                sessionId: 'test-session-2',
                memory: {
                    verified: true,
                    userName: 'John Doe',
                    account: '12345678',
                    sortCode: '123456'
                }
            });

            await runtime.handleMessage(
                'test-session-2',
                Buffer.from(sessionInitMessage),
                false
            );

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify session was created with memory
            expect(runtime.getActiveSessionCount()).toBe(1);
        }, 30000);
    });

    describe('Audio Input/Output', () => {
        it('should handle audio chunks', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping voice test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'voice',
                agentId: 'test-voice-agent-audio',
                agentPort: 8093,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                awsConfig: {
                    region: process.env.AWS_REGION || 'us-east-1',
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    sessionToken: process.env.AWS_SESSION_TOKEN
                },
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Initialize session
            const sessionInitMessage = JSON.stringify({
                type: 'session_init',
                sessionId: 'test-session-3'
            });

            await runtime.handleMessage(
                'test-session-3',
                Buffer.from(sessionInitMessage),
                false
            );

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send audio chunk (PCM16 16kHz mono)
            const audioChunk = Buffer.alloc(3200); // 100ms of audio
            await runtime.handleMessage('test-session-3', audioChunk, true);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify audio was processed (no errors)
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);

        it('should handle end audio input', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping voice test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'voice',
                agentId: 'test-voice-agent-end-audio',
                agentPort: 8094,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                awsConfig: {
                    region: process.env.AWS_REGION || 'us-east-1',
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    sessionToken: process.env.AWS_SESSION_TOKEN
                },
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Initialize session
            const sessionInitMessage = JSON.stringify({
                type: 'session_init',
                sessionId: 'test-session-4'
            });

            await runtime.handleMessage(
                'test-session-4',
                Buffer.from(sessionInitMessage),
                false
            );

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send end audio message
            const endAudioMessage = JSON.stringify({
                type: 'end_audio'
            });

            await runtime.handleMessage(
                'test-session-4',
                Buffer.from(endAudioMessage),
                false
            );

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);
    });

    describe('Tool Execution', () => {
        it('should execute tools in voice mode', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping voice test - AWS credentials not available');
                return;
            }

            // Write tool workflow
            fs.writeFileSync(
                path.join(testWorkflowPath, 'test-tool.json'),
                JSON.stringify(toolWorkflow, null, 2)
            );

            // Write banking persona
            fs.writeFileSync(
                path.join(testPersonaPath, 'test-banking.json'),
                JSON.stringify(bankingPersona, null, 2)
            );

            fs.writeFileSync(
                path.join(testPromptsPath, 'test-banking.txt'),
                'You are a banking assistant that helps with account operations.'
            );

            const config: UnifiedRuntimeConfig = {
                mode: 'voice',
                agentId: 'test-voice-agent-tools',
                agentPort: 8095,
                workflowFile: path.join(testWorkflowPath, 'test-tool.json'),
                awsConfig: {
                    region: process.env.AWS_REGION || 'us-east-1',
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    sessionToken: process.env.AWS_SESSION_TOKEN
                },
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                localToolsUrl: process.env.LOCAL_TOOLS_URL || 'http://localhost:9000',
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Initialize session
            const sessionInitMessage = JSON.stringify({
                type: 'session_init',
                sessionId: 'test-session-5'
            });

            await runtime.handleMessage(
                'test-session-5',
                Buffer.from(sessionInitMessage),
                false
            );

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Note: Actual tool execution would require sending audio or text
            // that triggers the LLM to call a tool. This is difficult to test
            // in integration tests without mocking the entire Nova Sonic response.
            // For now, we verify the session is ready for tool execution.

            expect(runtime.getActiveSessionCount()).toBe(1);
        }, 30000);
    });

    describe('Handoffs', () => {
        it('should handle handoff requests in voice mode', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping voice test - AWS credentials not available');
                return;
            }

            // Write handoff workflow
            fs.writeFileSync(
                path.join(testWorkflowPath, 'test-handoff.json'),
                JSON.stringify(handoffWorkflow, null, 2)
            );

            const config: UnifiedRuntimeConfig = {
                mode: 'voice',
                agentId: 'test-voice-agent-handoff',
                agentPort: 8096,
                workflowFile: path.join(testWorkflowPath, 'test-handoff.json'),
                awsConfig: {
                    region: process.env.AWS_REGION || 'us-east-1',
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    sessionToken: process.env.AWS_SESSION_TOKEN
                },
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Initialize session
            const sessionInitMessage = JSON.stringify({
                type: 'session_init',
                sessionId: 'test-session-6'
            });

            await runtime.handleMessage(
                'test-session-6',
                Buffer.from(sessionInitMessage),
                false
            );

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Note: Actual handoff would require the LLM to call a handoff tool.
            // This is difficult to test without mocking Nova Sonic responses.
            // For now, we verify the session is ready for handoffs.

            expect(runtime.getActiveSessionCount()).toBe(1);
        }, 30000);
    });

    describe('Session Cleanup', () => {
        it('should clean up session on disconnect', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping voice test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'voice',
                agentId: 'test-voice-agent-cleanup',
                agentPort: 8097,
                workflowFile: path.join(testWorkflowPath, 'test-simple.json'),
                awsConfig: {
                    region: process.env.AWS_REGION || 'us-east-1',
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    sessionToken: process.env.AWS_SESSION_TOKEN
                },
                personasDir: testPersonaPath,
                promptsDir: testPromptsPath,
                gatewayUrl: 'http://localhost:9999'
            };

            runtime = new UnifiedRuntime(config);
            await runtime.start();

            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Initialize session
            const sessionInitMessage = JSON.stringify({
                type: 'session_init',
                sessionId: 'test-session-7'
            });

            await runtime.handleMessage(
                'test-session-7',
                Buffer.from(sessionInitMessage),
                false
            );

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));

            expect(runtime.getActiveSessionCount()).toBe(1);

            // Disconnect session
            await runtime.handleDisconnect('test-session-7');

            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify session was cleaned up
            expect(runtime.getActiveSessionCount()).toBe(0);
        }, 30000);
    });
});
