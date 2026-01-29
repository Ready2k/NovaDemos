/**
 * Banking Tools - Load from AgentCore tool definitions
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BankingTool {
    toolSpec: {
        name: string;
        description: string;
        inputSchema: {
            json: string;
        };
    };
    gatewayTarget?: string;
}

// Determine if running in Docker or locally
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const TOOLS_DIR = path.join(BASE_DIR, 'backend/tools');

/**
 * Load a tool definition from JSON file
 */
function loadToolFromFile(filename: string): BankingTool | null {
    try {
        const filePath = path.join(TOOLS_DIR, filename);
        if (!fs.existsSync(filePath)) {
            console.warn(`[BankingTools] Tool file not found: ${filePath}`);
            return null;
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const toolDef = JSON.parse(content);
        
        // Transform to Bedrock Tool Spec format
        const schema = toolDef.input_schema || toolDef.inputSchema || toolDef.parameters;
        
        let finalDescription = toolDef.description || "";
        if (toolDef.instruction) {
            finalDescription += `\n\n[INSTRUCTION]: ${toolDef.instruction}`;
        }
        
        return {
            toolSpec: {
                name: toolDef.name,
                description: finalDescription,
                inputSchema: {
                    json: JSON.stringify(schema || {
                        type: "object",
                        properties: {},
                        required: []
                    })
                }
            },
            gatewayTarget: toolDef.gatewayTarget
        };
    } catch (error) {
        console.error(`[BankingTools] Failed to load tool ${filename}:`, error);
        return null;
    }
}

/**
 * Generate banking tools for financial operations
 * These are loaded from AgentCore tool definitions
 */
export function generateBankingTools(): BankingTool[] {
    const tools: BankingTool[] = [];
    
    // Load IDV check tool
    const idvTool = loadToolFromFile('perform_idv_check.json');
    if (idvTool) {
        tools.push(idvTool);
        console.log('[BankingTools] Loaded perform_idv_check from AgentCore');
    }
    
    // Load balance tool
    const balanceTool = loadToolFromFile('agentcore_balance.json');
    if (balanceTool) {
        tools.push(balanceTool);
        console.log('[BankingTools] Loaded agentcore_balance from AgentCore');
    }
    
    // Load transactions tool
    const transactionsTool = loadToolFromFile('agentcore_transactions.json');
    if (transactionsTool) {
        tools.push(transactionsTool);
        console.log('[BankingTools] Loaded get_account_transactions from AgentCore');
    }
    
    console.log(`[BankingTools] Loaded ${tools.length} banking tools from AgentCore definitions`);
    return tools;
}

/**
 * Check if a tool name is a banking tool
 */
export function isBankingTool(toolName: string): boolean {
    return ['perform_idv_check', 'agentcore_balance', 'get_account_transactions'].includes(toolName);
}

/**
 * Banking tools are executed via AgentCore - this function should NOT be called
 * AgentCore handles the actual execution
 */
export async function executeBankingTool(toolName: string, input: any): Promise<any> {
    console.error(`[BankingTools] ERROR: executeBankingTool should not be called for ${toolName}`);
    console.error(`[BankingTools] Banking tools are executed via AgentCore, not locally`);
    throw new Error(`Banking tool ${toolName} should be executed via AgentCore, not locally`);
}
