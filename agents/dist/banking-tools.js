"use strict";
/**
 * Banking Tools - Load from AgentCore tool definitions
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBankingTools = generateBankingTools;
exports.isBankingTool = isBankingTool;
exports.executeBankingTool = executeBankingTool;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Determine if running in Docker or locally
const isDocker = fs.existsSync('/app');
const BASE_DIR = isDocker ? '/app' : path.join(__dirname, '../..');
const TOOLS_DIR = path.join(BASE_DIR, 'backend/tools');
/**
 * Load a tool definition from JSON file
 */
function loadToolFromFile(filename) {
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
    }
    catch (error) {
        console.error(`[BankingTools] Failed to load tool ${filename}:`, error);
        return null;
    }
}
/**
 * Generate banking tools for financial operations
 * These are loaded from AgentCore tool definitions
 */
function generateBankingTools() {
    const tools = [];
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
    // Load branch lookup tool
    const branchTool = loadToolFromFile('uk_branch_lookup.json');
    if (branchTool) {
        tools.push(branchTool);
        console.log('[BankingTools] Loaded uk_branch_lookup from AgentCore');
    }
    console.log(`[BankingTools] Loaded ${tools.length} banking tools from AgentCore definitions`);
    return tools;
}
/**
 * Check if a tool name is a banking tool
 */
function isBankingTool(toolName) {
    const bankingTools = [
        'perform_idv_check',
        'agentcore_balance',
        'get_account_transactions',
        'uk_branch_lookup',
        'create_dispute_case',
        'update_dispute_case',
        'lookup_merchant_alias',
        'manage_recent_interactions'
    ];
    return bankingTools.includes(toolName);
}
/**
 * Banking tools are executed via AgentCore - this function should NOT be called
 * AgentCore handles the actual execution
 */
async function executeBankingTool(toolName, input) {
    console.error(`[BankingTools] ERROR: executeBankingTool should not be called for ${toolName}`);
    console.error(`[BankingTools] Banking tools are executed via AgentCore, not locally`);
    throw new Error(`Banking tool ${toolName} should be executed via AgentCore, not locally`);
}
