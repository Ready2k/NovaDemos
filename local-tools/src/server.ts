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

const app = express();
app.use(express.json());

// Tool registry
const tools = new Map<string, any>();

// Check if AgentCore credentials are available
const hasAgentCoreCredentials = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
if (hasAgentCoreCredentials) {
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
    
    // Create JSON-RPC 2.0 payload
    const payload = {
        jsonrpc: "2.0",
        id: `tool-call-${Date.now()}`,
        method: "tools/call",
        params: {
            name: actualToolName,
            arguments: input
        }
    };
    
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

// Tool execution logic
async function executeTool(toolName: string, input: any): Promise<any> {
    console.log(`[LocalTools] Executing tool: ${toolName}`, input);
    
    // Banking tools - MUST use AgentCore (no fallback)
    if (toolName === 'perform_idv_check' || toolName === 'agentcore_balance' || toolName === 'get_account_transactions') {
        // Get tool definition to find gatewayTarget
        const toolDef = tools.get(toolName);
        const gatewayTarget = toolDef?.gatewayTarget;
        
        if (!hasAgentCoreCredentials) {
            throw new Error(`AgentCore credentials not configured. Cannot execute ${toolName}. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.`);
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
