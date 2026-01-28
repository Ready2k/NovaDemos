import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

const PORT = parseInt(process.env.PORT || '9000');
const TOOLS_DIR = process.env.TOOLS_DIR || '/app/tools';

const app = express();
app.use(express.json());

// Tool registry
const tools = new Map<string, any>();

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

// Built-in tool implementations
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
