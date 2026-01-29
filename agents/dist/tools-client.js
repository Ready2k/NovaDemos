"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolsClient = void 0;
const axios_1 = __importDefault(require("axios"));
class ToolsClient {
    constructor(localToolsUrl, agentCoreUrl) {
        this.localToolsUrl = localToolsUrl;
        this.agentCoreUrl = agentCoreUrl;
    }
    /**
     * Discover available tools from local MCP server
     */
    async discoverLocalTools() {
        try {
            const response = await axios_1.default.get(`${this.localToolsUrl}/tools/list`);
            return response.data.tools || [];
        }
        catch (error) {
            console.error('[ToolsClient] Failed to discover local tools:', error.message);
            return [];
        }
    }
    /**
     * Execute a tool (local or AgentCore)
     */
    async executeTool(toolName, input) {
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
        }
        catch (error) {
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
    async executeLocalTool(toolName, input) {
        try {
            const response = await axios_1.default.post(`${this.localToolsUrl}/tools/execute`, {
                tool: toolName,
                input
            });
            return {
                success: true,
                result: response.data.result
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message
            };
        }
    }
    /**
     * Execute tool via AgentCore Gateway
     */
    async executeAgentCoreTool(toolName, input) {
        try {
            // TODO: Implement AgentCore Gateway tool execution
            // This would call the existing AgentCore Gateway API
            console.log(`[ToolsClient] AgentCore tool execution not yet implemented: ${toolName}`);
            return {
                success: false,
                error: 'AgentCore integration not yet implemented'
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}
exports.ToolsClient = ToolsClient;
