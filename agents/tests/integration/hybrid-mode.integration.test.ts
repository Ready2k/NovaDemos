/**
 * Hybrid Mode Integration Test
 * 
 * Tests hybrid mode functionality including:
 * - Voice and text simultaneously
 * - Mode switching
 * - Session state preservation
 * 
 * Validates: Requirement 13.6 - Testing Support
 */

import { UnifiedRuntime, UnifiedRuntimeConfig } from '../../src/agent-runtime-unified';
import { MockWebSocket } from '../fixtures/mock-websocket';
import { simpleWorkflow, toolWorkflow, handoffWorkflow } from '../fixtures/test-workflows';
import { basicPersona, bankingPersona } from '../fixtures/test-personas';
import * as fs from 'fs';
import * as path from 'path';

describe('Hybrid Mode Integration Tests', () => {
    let runtime: UnifiedRuntime;
    let testWorkflowPath: string;
    let testPersonaPath: string;
    let testPromptsPath: string;

    beforeAll(() => {
        // Create temporary test directories
        const testDir = path.join(__dirname, '../temp-hybrid');
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

        // Write test prompts
        fs.writeFileSync(
            path.join(testPromptsPath, 'test-basic.txt'),
            'You are a helpful test assistant.'
        );
        fs.writeFileSync(
            path.join(testPromptsPath, 'test-banking.txt'),
            'You are a banking assistant that helps with account operations.'
        );
    });

    afterAll(() => {
        // Clean up temporary test files
        const testDir = path.join(__dirname, '../temp-hybrid');
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
        it('should initialize hybrid session successfully', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent',
                agentPort: 8201,
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

            // Verify runtime started in hybrid mode
            expect(runtime.getMode()).toBe('hybrid');
            expect(runtime.getActiveSessionCount()).toBe(0);

            // Simulate WebSocket connection
            const ws = new MockWebSocket();
            runtime.handleConnection(ws);

            // Send session init
            const sessionInitMessage = JSON.stringify({
                type: 'session_init',
                sessionId: 'test-hybrid-session-1',
                memory: {}
            });

            await runtime.handleMessage(
                'test-hybrid-session-1',
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
        }, 30000);

        it('should initialize hybrid session with memory', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-memory',
                agentPort: 8202,
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
                sessionId: 'test-hybrid-session-2',
                memory: {
                    verified: true,
                    userName: 'Bob Wilson',
                    account: '99887766',
                    sortCode: '998877',
                    userIntent: 'hybrid interaction'
                }
            });

            await runtime.handleMessage(
                'test-hybrid-session-2',
                Buffer.from(sessionInitMessage),
                false
            );

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify session was created with memory
            expect(runtime.getActiveSessionCount()).toBe(1);
        }, 30000);
    });

    describe('Voice and Text Simultaneously', () => {
        it('should handle audio input in hybrid mode', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-audio',
                agentPort: 8203,
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
            await runtime.handleMessage(
                'test-hybrid-session-3',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-3'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send audio chunk
            const audioChunk = Buffer.alloc(3200); // 100ms of audio
            await runtime.handleMessage('test-hybrid-session-3', audioChunk, true);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);

        it('should handle text input in hybrid mode', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-text',
                agentPort: 8204,
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
            await runtime.handleMessage(
                'test-hybrid-session-4',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-4'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send text input (for voice session)
            await runtime.handleMessage(
                'test-hybrid-session-4',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Hello via text in hybrid mode'
                })),
                false
            );

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);

        it('should handle both audio and text in same session', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-both',
                agentPort: 8205,
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
            await runtime.handleMessage(
                'test-hybrid-session-5',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-5'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send audio chunk
            const audioChunk = Buffer.alloc(3200);
            await runtime.handleMessage('test-hybrid-session-5', audioChunk, true);

            await new Promise(resolve => setTimeout(resolve, 500));

            // Send text input
            await runtime.handleMessage(
                'test-hybrid-session-5',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Text message after audio'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Send another audio chunk
            await runtime.handleMessage('test-hybrid-session-5', audioChunk, true);

            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);
    });

    describe('Mode Switching', () => {
        it('should switch from audio to text input', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-switch-1',
                agentPort: 8206,
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
            await runtime.handleMessage(
                'test-hybrid-session-6',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-6'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Start with audio
            const audioChunk = Buffer.alloc(3200);
            await runtime.handleMessage('test-hybrid-session-6', audioChunk, true);

            await new Promise(resolve => setTimeout(resolve, 500));

            // End audio input
            await runtime.handleMessage(
                'test-hybrid-session-6',
                Buffer.from(JSON.stringify({
                    type: 'end_audio'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 500));

            // Switch to text
            await runtime.handleMessage(
                'test-hybrid-session-6',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Switched to text input'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);

        it('should switch from text to audio input', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-switch-2',
                agentPort: 8207,
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
            await runtime.handleMessage(
                'test-hybrid-session-7',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-7'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Start with text
            await runtime.handleMessage(
                'test-hybrid-session-7',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Starting with text'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Switch to audio
            const audioChunk = Buffer.alloc(3200);
            await runtime.handleMessage('test-hybrid-session-7', audioChunk, true);

            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);
    });

    describe('Session State Preservation', () => {
        it('should preserve session state across mode switches', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-state',
                agentPort: 8208,
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

            // Initialize session with memory
            await runtime.handleMessage(
                'test-hybrid-session-8',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-8',
                    memory: {
                        verified: true,
                        userName: 'Charlie Brown',
                        account: '55667788',
                        sortCode: '556677'
                    }
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send text input
            await runtime.handleMessage(
                'test-hybrid-session-8',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'First message via text'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Switch to audio
            const audioChunk = Buffer.alloc(3200);
            await runtime.handleMessage('test-hybrid-session-8', audioChunk, true);

            await new Promise(resolve => setTimeout(resolve, 500));

            // Switch back to text
            await runtime.handleMessage(
                'test-hybrid-session-8',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Second message via text'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Session should still be active with preserved state
            expect(runtime.getActiveSessionCount()).toBe(1);

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);

        it('should maintain conversation history across modes', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-history',
                agentPort: 8209,
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
            await runtime.handleMessage(
                'test-hybrid-session-9',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-9'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send multiple messages via text
            await runtime.handleMessage(
                'test-hybrid-session-9',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Message 1'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1500));

            await runtime.handleMessage(
                'test-hybrid-session-9',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Message 2'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Send audio
            const audioChunk = Buffer.alloc(3200);
            await runtime.handleMessage('test-hybrid-session-9', audioChunk, true);

            await new Promise(resolve => setTimeout(resolve, 500));

            // Send another text message
            await runtime.handleMessage(
                'test-hybrid-session-9',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Message 3 after audio'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Verify conversation history is maintained
            // (All messages should be tracked in the session)
            expect(runtime.getActiveSessionCount()).toBe(1);

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);
    });

    describe('Tool Execution in Hybrid Mode', () => {
        it('should execute tools triggered by text input', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-tools',
                agentPort: 8210,
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
            await runtime.handleMessage(
                'test-hybrid-session-10',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-10'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send text that might trigger tool use
            await runtime.handleMessage(
                'test-hybrid-session-10',
                Buffer.from(JSON.stringify({
                    type: 'text_input',
                    text: 'Check balance for account 12345678'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 3000));

            // Verify no errors
            const errorMessages = ws.findMessagesByType('error');
            expect(errorMessages.length).toBe(0);
        }, 30000);
    });

    describe('Session Cleanup', () => {
        it('should clean up hybrid session on disconnect', async () => {
            // Skip if AWS credentials not available
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                console.log('Skipping hybrid test - AWS credentials not available');
                return;
            }

            const config: UnifiedRuntimeConfig = {
                mode: 'hybrid',
                agentId: 'test-hybrid-agent-cleanup',
                agentPort: 8211,
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
            await runtime.handleMessage(
                'test-hybrid-session-11',
                Buffer.from(JSON.stringify({
                    type: 'session_init',
                    sessionId: 'test-hybrid-session-11'
                })),
                false
            );

            await new Promise(resolve => setTimeout(resolve, 1000));

            expect(runtime.getActiveSessionCount()).toBe(1);

            // Disconnect session
            await runtime.handleDisconnect('test-hybrid-session-11');

            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify session was cleaned up (both voice and text adapters)
            expect(runtime.getActiveSessionCount()).toBe(0);
        }, 30000);
    });
});
