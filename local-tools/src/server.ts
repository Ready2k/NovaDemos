import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const PORT = parseInt(process.env.PORT || '9000');
const TOOLS_DIR = process.env.TOOLS_DIR || '/app/tools';
const AGENTCORE_GATEWAY_URL = process.env.AGENTCORE_GATEWAY_URL || 'https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || process.env.NOVA_AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || process.env.NOVA_AWS_SECRET_ACCESS_KEY;
const USE_MOCK_DATA = process.env.USE_MOCK_DATA === 'true';

const app = express();
app.use(express.json());

// Tool registry
const tools = new Map<string, any>();

// Check if AgentCore credentials are available
const hasAgentCoreCredentials = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
if (USE_MOCK_DATA) {
    console.log('[LocalTools] 🧪 MOCK MODE ENABLED - Using test data instead of AgentCore');
    console.log('[LocalTools] ⚠️  This is for testing only - not for production use');
} else if (hasAgentCoreCredentials) {
    console.log('[LocalTools] ✅ AgentCore credentials available - will use AgentCore Gateway');
    console.log('[LocalTools] ⚠️  NO FALLBACK DATA - AgentCore failures will throw errors');
} else {
    console.error('[LocalTools] ❌ AgentCore credentials NOT available');
    console.error('[LocalTools] ❌ Banking tools (IDV, balance, transactions) will FAIL');
    console.error('[LocalTools] Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables');
}

// Load tools from directory
function loadTools() {
    if (!fs.existsSync(TOOLS_DIR)) {
        console.log(`[LocalTools] Tools directory not found: ${TOOLS_DIR}`);
        return;
    }

    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
        try {
            const toolDef = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf-8'));
            tools.set(toolDef.name, toolDef);
            console.log(`[LocalTools] Loaded tool: ${toolDef.name}`);
        } catch (error) {
            console.error(`[LocalTools] Failed to load tool ${file}:`, error);
        }
    }
}

// Call AgentCore Gateway
async function callAgentCoreGateway(toolName: string, input: any, gatewayTarget?: string): Promise<any> {
    const aws4 = require('aws4');
    
    // Map tool names to gateway targets
    const toolMapping: { [key: string]: string } = {
        'agentcore_balance': 'get-Balance___get_Balance',
        'get_account_transactions': 'get-TransactionalHistory___get_TransactionHistory',
        'perform_idv_check': 'perform-idv-check___perform_idv_check'
    };
    
    const actualToolName = gatewayTarget || toolMapping[toolName] || toolName;
    console.log(`[LocalTools] Calling AgentCore Gateway: ${actualToolName}`);
    console.log(`[LocalTools] Input parameters:`, JSON.stringify(input, null, 2));
    
    // Transform input field names based on tool requirements
    // Balance tool expects 'accountId' but IDV expects 'accountNumber'
    const transformedInput = { ...input };
    if (toolName === 'agentcore_balance' && input.accountNumber && !input.accountId) {
        transformedInput.accountId = input.accountNumber;
        delete transformedInput.accountNumber;
        console.log(`[LocalTools] Transformed accountNumber → accountId for balance tool`);
    }
    
    // Create JSON-RPC 2.0 payload
    const payload = {
        jsonrpc: "2.0",
        id: `tool-call-${Date.now()}`,
        method: "tools/call",
        params: {
            name: actualToolName,
            arguments: transformedInput
        }
    };
    
    console.log(`[LocalTools] Payload:`, JSON.stringify(payload, null, 2));
    
    const url = new URL(AGENTCORE_GATEWAY_URL);
    const body = JSON.stringify(payload);
    
    // Create AWS request object for signing
    const request = {
        host: url.hostname,
        method: 'POST',
        path: url.pathname,
        service: 'bedrock-agentcore',
        region: AWS_REGION,
        headers: {
            'Content-Type': 'application/json'
        },
        body: body
    };
    
    // Sign the request with AWS credentials
    const signedRequest = aws4.sign(request, {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    });
    
    console.log(`[LocalTools] Making signed request to AgentCore Gateway...`);
    console.log(`[LocalTools] Request URL: ${AGENTCORE_GATEWAY_URL}`);
    console.log(`[LocalTools] Request headers:`, Object.keys(signedRequest.headers));
    
    // Make the signed request
    let response;
    try {
        response = await fetch(AGENTCORE_GATEWAY_URL, {
            method: 'POST',
            headers: signedRequest.headers,
            body: body
        });
    } catch (fetchError: any) {
        console.error(`[LocalTools] Fetch error details:`, {
            message: fetchError.message,
            code: fetchError.code,
            cause: fetchError.cause,
            stack: fetchError.stack?.split('\n').slice(0, 3).join('\n')
        });
        throw fetchError;
    }
    
    console.log(`[LocalTools] AgentCore response status: ${response.status}`);
    
    if (!response.ok) {
        const text = await response.text();
        console.error(`[LocalTools] AgentCore request failed: ${text}`);
        throw new Error(`AgentCore Gateway Request Failed (${response.status}): ${text}`);
    }
    
    const data: any = await response.json();
    console.log(`[LocalTools] AgentCore raw response:`, JSON.stringify(data, null, 2));
    
    // Check for JSON-RPC errors
    if (data.error) {
        console.error(`[LocalTools] AgentCore tool execution error:`, data.error);
        throw new Error(`Tool Execution Error: ${data.error.message}`);
    }
    
    // Extract result from response
    if (data.body && data.body.responseBody) {
        console.log(`[LocalTools] Found responseBody:`, data.body.responseBody);
        return data.body.responseBody;
    }
    
    if (data.result) {
        console.log(`[LocalTools] Found result:`, data.result);
        return data.result;
    }
    
    throw new Error('No valid result found in AgentCore response');
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'local-tools',
        toolsCount: tools.size,
        timestamp: Date.now()
    });
});

// List available tools (MCP protocol)
app.get('/tools/list', (req, res) => {
    const toolList = Array.from(tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
    }));

    res.json({
        tools: toolList
    });
});

// Execute a tool (MCP protocol)
app.post('/tools/execute', async (req, res) => {
    try {
        const { tool: toolName, input } = req.body;

        if (!toolName) {
            return res.status(400).json({ error: 'Tool name is required' });
        }

        const tool = tools.get(toolName);
        if (!tool) {
            return res.status(404).json({ error: `Tool not found: ${toolName}` });
        }

        // Execute tool logic
        const result = await executeTool(toolName, input);

        res.json({
            success: true,
            result
        });
    } catch (error: any) {
        console.error('[LocalTools] Tool execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Mock data for testing
function getMockData(toolName: string, input: any): any {
    console.log(`[LocalTools] 🧪 Using mock data for ${toolName}`);
    
    switch (toolName) {
        case 'perform_idv_check':
            // Valid test account
            if (input.accountNumber === '12345678' && input.sortCode === '112233') {
                return {
                    content: [{
                        text: JSON.stringify({
                            auth_status: 'VERIFIED',
                            customer_name: 'Sarah Jones',
                            account: input.accountNumber,
                            sortCode: input.sortCode,
                            account_status: 'OPEN',
                            marker_Vunl: 2
                        })
                    }]
                };
            }
            // Invalid account - any other combination
            return {
                content: [{
                    text: JSON.stringify({
                        auth_status: 'FAILED',
                        message: 'Invalid account credentials. Please check your account number and sort code.',
                        account: input.accountNumber,
                        sortCode: input.sortCode
                    })
                }]
            };
            
        case 'agentcore_balance':
            if (input.accountNumber === '12345678' && input.sortCode === '112233') {
                return {
                    content: [{
                        text: JSON.stringify({
                            balance: 1200.00,
                            currency: 'GBP',
                            account: input.accountNumber,
                            sortCode: input.sortCode,
                            timestamp: new Date().toISOString()
                        })
                    }]
                };
            }
            return {
                content: [{
                    text: JSON.stringify({
                        error: 'Account not found',
                        account: input.accountNumber
                    })
                }]
            };
            
        case 'get_account_transactions':
            if (input.accountNumber === '12345678' && input.sortCode === '112233') {
                return {
                    content: [{
                        text: JSON.stringify({
                            transactions: [
                                // February 2026 transactions
                                {
                                    date: '2026-02-10',
                                    merchant: 'Tesco Superstore',
                                    amount: -45.67,
                                    type: 'debit',
                                    disputed: true,
                                    category: 'groceries'
                                },
                                {
                                    date: '2026-02-09',
                                    merchant: 'Shell Petrol',
                                    amount: -52.30,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'fuel'
                                },
                                {
                                    date: '2026-02-08',
                                    merchant: 'Amazon UK',
                                    amount: -89.99,
                                    type: 'debit',
                                    disputed: true,
                                    category: 'shopping'
                                },
                                // January 2026 transactions
                                {
                                    date: '2026-01-28',
                                    merchant: 'Sainsburys',
                                    amount: -67.45,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'groceries'
                                },
                                {
                                    date: '2026-01-15',
                                    merchant: 'Netflix',
                                    amount: -15.99,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'entertainment'
                                },
                                // December 2025 transactions
                                {
                                    date: '2025-12-20',
                                    merchant: 'John Lewis',
                                    amount: -234.50,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'shopping'
                                },
                                {
                                    date: '2025-12-15',
                                    merchant: 'Marks & Spencer',
                                    amount: -89.99,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'groceries'
                                },
                                // November 2025 transactions (for the test query)
                                {
                                    date: '2025-11-28',
                                    merchant: 'Argos',
                                    amount: -156.99,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'shopping'
                                },
                                {
                                    date: '2025-11-25',
                                    merchant: 'Tesco',
                                    amount: -78.45,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'groceries'
                                },
                                {
                                    date: '2025-11-20',
                                    merchant: 'BP Petrol',
                                    amount: -65.00,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'fuel'
                                },
                                {
                                    date: '2025-11-15',
                                    merchant: 'Boots Pharmacy',
                                    amount: -34.50,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'health'
                                },
                                {
                                    date: '2025-11-10',
                                    merchant: 'Waitrose',
                                    amount: -92.30,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'groceries'
                                },
                                {
                                    date: '2025-11-05',
                                    merchant: 'Costa Coffee',
                                    amount: -12.50,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'dining'
                                },
                                {
                                    date: '2025-11-03',
                                    merchant: 'Zara',
                                    amount: -145.00,
                                    type: 'debit',
                                    disputed: false,
                                    category: 'clothing'
                                }
                            ],
                            account: input.accountNumber,
                            sortCode: input.sortCode,
                            // Calculate November 2025 total spending
                            summary: {
                                november_2025_total: 584.74,
                                november_2025_count: 7,
                                total_transactions: 17
                            }
                        })
                    }]
                };
            }
            return {
                content: [{
                    text: JSON.stringify({
                        transactions: [],
                        account: input.accountNumber
                    })
                }]
            };
            
        default:
            throw new Error(`No mock data available for ${toolName}`);
    }
}

// Tool execution logic
async function executeTool(toolName: string, input: any): Promise<any> {
    console.log(`[LocalTools] Executing tool: ${toolName}`, input);
    
    // Banking tools - Use mock data if enabled, otherwise AgentCore
    if (toolName === 'perform_idv_check' || toolName === 'agentcore_balance' || toolName === 'get_account_transactions') {
        // Get tool definition to find gatewayTarget
        const toolDef = tools.get(toolName);
        const gatewayTarget = toolDef?.gatewayTarget;
        
        // Use mock data if enabled
        if (USE_MOCK_DATA) {
            return getMockData(toolName, input);
        }
        
        if (!hasAgentCoreCredentials) {
            throw new Error(`AgentCore credentials not configured. Cannot execute ${toolName}. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables or enable USE_MOCK_DATA=true.`);
        }
        
        console.log(`[LocalTools] Calling AgentCore Gateway for ${toolName}...`);
        const result = await callAgentCoreGateway(toolName, input, gatewayTarget);
        console.log(`[LocalTools] AgentCore result:`, result);
        
        // Parse the result if it's a string
        if (typeof result === 'string') {
            try {
                return JSON.parse(result);
            } catch {
                // If it's not JSON, wrap it in an object
                return { message: result };
            }
        }
        return result;
    }
    
    // Simple built-in tools
    switch (toolName) {
        case 'calculator':
            return executeCalculator(input);

        case 'string_formatter':
            return executeStringFormatter(input);

        case 'date_formatter':
            return executeDateFormatter(input);

        default:
            throw new Error(`Tool implementation not found: ${toolName}`);
    }
}

// Built-in tool implementations (non-AgentCore tools)
function executeCalculator(input: any): any {
    const { operation, a, b } = input;

    switch (operation) {
        case 'add':
            return { result: a + b };
        case 'subtract':
            return { result: a - b };
        case 'multiply':
            return { result: a * b };
        case 'divide':
            return { result: b !== 0 ? a / b : 'Error: Division by zero' };
        default:
            throw new Error(`Unknown operation: ${operation}`);
    }
}

function executeStringFormatter(input: any): any {
    const { text, format } = input;

    switch (format) {
        case 'uppercase':
            return { result: text.toUpperCase() };
        case 'lowercase':
            return { result: text.toLowerCase() };
        case 'capitalize':
            return { result: text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() };
        default:
            return { result: text };
    }
}

function executeDateFormatter(input: any): any {
    const { timestamp, format } = input;
    const date = timestamp ? new Date(timestamp) : new Date();

    switch (format) {
        case 'iso':
            return { result: date.toISOString() };
        case 'locale':
            return { result: date.toLocaleString() };
        case 'date':
            return { result: date.toLocaleDateString() };
        case 'time':
            return { result: date.toLocaleTimeString() };
        default:
            return { result: date.toString() };
    }
}

// Start server
async function start() {
    loadTools();

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[LocalTools] Server listening on port ${PORT}`);
        console.log(`[LocalTools] Health check: http://localhost:${PORT}/health`);
        console.log(`[LocalTools] Loaded ${tools.size} tools`);
    });
}

start();
