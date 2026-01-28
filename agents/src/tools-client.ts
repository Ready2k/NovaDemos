import axios from 'axios';

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: any;
}

export interface ToolExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
}

export class ToolsClient {
    private localToolsUrl: string;
    private agentCoreUrl?: string;

    constructor(localToolsUrl: string, agentCoreUrl?: string) {
        this.localToolsUrl = localToolsUrl;
        this.agentCoreUrl = agentCoreUrl;
    }

    /**
     * Discover available tools from local MCP server
     */
    async discoverLocalTools(): Promise<ToolDefinition[]> {
        try {
            const response = await axios.get(`${this.localToolsUrl}/tools/list`);
            return response.data.tools || [];
        } catch (error: any) {
            console.error('[ToolsClient] Failed to discover local tools:', error.message);
            return [];
        }
    }

    /**
     * Execute a tool (local or AgentCore)
     */
    async executeTool(toolName: string, input: any): Promise<ToolExecutionResult> {
        try {
            // Try local tools first
            const localTools = await this.discoverLocalTools();
            const isLocalTool = localTools.some(t => t.name === toolName);

            if (isLocalTool) {
                return await this.executeLocalTool(toolName, input);
            }

            // Fall back to AgentCore if available
            if (this.agentCoreUrl) {
                return await this.executeAgentCoreTool(toolName, input);
            }

            return {
                success: false,
                error: `Tool ${toolName} not found in local tools or AgentCore`
            };
        } catch (error: any) {
            console.error(`[ToolsClient] Tool execution error:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute tool via local MCP server
     */
    private async executeLocalTool(toolName: string, input: any): Promise<ToolExecutionResult> {
        try {
            const response = await axios.post(`${this.localToolsUrl}/tools/execute`, {
                tool: toolName,
                input
            });

            return {
                success: true,
                result: response.data.result
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.error || error.message
            };
        }
    }

    /**
     * Execute tool via AgentCore Gateway
     */
    private async executeAgentCoreTool(toolName: string, input: any): Promise<ToolExecutionResult> {
        try {
            // TODO: Implement AgentCore Gateway tool execution
            // This would call the existing AgentCore Gateway API
            console.log(`[ToolsClient] AgentCore tool execution not yet implemented: ${toolName}`);
            return {
                success: false,
                error: 'AgentCore integration not yet implemented'
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}
