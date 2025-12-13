import * as fs from 'fs';
import * as path from 'path';

export interface ToolDefinition {
    name: string;
    description: string;
    input_schema?: any; // Native format
    inputSchema?: any;  // Bedrock format
    parameters?: any;   // Alternative format
    instruction?: string;
    agentPrompt?: string;
    gatewayTarget?: string; // New: Target function name in AgentCore Gateway
}

export class ToolManager {
    private toolsDir: string;

    constructor(toolsDir: string) {
        this.toolsDir = toolsDir;
    }

    /**
     * List all available tools with full definitions
     */
    listTools(): ToolDefinition[] {
        try {
            if (!fs.existsSync(this.toolsDir)) {
                return [];
            }

            const files = fs.readdirSync(this.toolsDir);
            return files
                .filter(f => f.endsWith('.json'))
                .map(f => {
                    try {
                        const content = fs.readFileSync(path.join(this.toolsDir, f), 'utf-8');
                        return JSON.parse(content);
                    } catch (e) {
                        console.error(`[ToolManager] Failed to load tool ${f}:`, e);
                        return null;
                    }
                })
                .filter(t => t !== null) as ToolDefinition[];
        } catch (err) {
            console.error('[ToolManager] Failed to list tools:', err);
            return [];
        }
    }

    /**
     * Get a specific tool by name
     */
    getTool(name: string): ToolDefinition | null {
        const tools = this.listTools();
        return tools.find(t => t.name === name) || null;
    }

    /**
     * Save a tool definition (create or update)
     */
    saveTool(tool: ToolDefinition): boolean {
        try {
            // Sanitize filename based on tool name
            const filename = `${tool.name}.json`;
            const filePath = path.join(this.toolsDir, filename);

            fs.writeFileSync(filePath, JSON.stringify(tool, null, 2));
            console.log(`[ToolManager] Saved tool: ${tool.name}`);
            return true;
        } catch (err) {
            console.error(`[ToolManager] Failed to save tool ${tool.name}:`, err);
            return false;
        }
    }

    /**
     * Delete a tool by name
     */
    deleteTool(name: string): boolean {
        try {
            const filename = `${name}.json`;
            const filePath = path.join(this.toolsDir, filename);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[ToolManager] Deleted tool: ${name}`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`[ToolManager] Failed to delete tool ${name}:`, err);
            return false;
        }
    }
}
