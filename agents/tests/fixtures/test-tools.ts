/**
 * Test Tool Definitions
 * 
 * This module provides test tool definitions for integration testing.
 * These tools are simplified versions for testing tool execution.
 * 
 * Validates: Requirement 13.5 - Testing Support
 */

/**
 * Test balance check tool
 */
export const balanceCheckTool = {
    name: 'test_check_balance',
    description: 'Check account balance for testing',
    inputSchema: {
        type: 'object',
        properties: {
            accountId: {
                description: 'The account ID',
                type: 'string'
            },
            sortCode: {
                description: 'The sort code',
                type: 'string'
            }
        },
        required: ['accountId', 'sortCode']
    }
};

/**
 * Test IDV check tool
 */
export const idvCheckTool = {
    name: 'test_perform_idv',
    description: 'Perform identity verification for testing',
    inputSchema: {
        type: 'object',
        properties: {
            accountNumber: {
                description: 'The account number',
                type: 'string'
            },
            sortCode: {
                description: 'The sort code',
                type: 'string'
            }
        },
        required: ['accountNumber', 'sortCode']
    }
};

/**
 * Test handoff tool - transfer to banking
 */
export const transferToBankingTool = {
    name: 'transfer_to_banking',
    description: 'Transfer to banking agent for testing',
    inputSchema: {
        type: 'object',
        properties: {
            reason: {
                description: 'Reason for transfer',
                type: 'string'
            }
        }
    }
};

/**
 * Test handoff tool - return to triage
 */
export const returnToTriageTool = {
    name: 'return_to_triage',
    description: 'Return to triage agent for testing',
    inputSchema: {
        type: 'object',
        properties: {
            taskCompleted: {
                description: 'Task completion status',
                type: 'string'
            },
            summary: {
                description: 'Summary of completed task',
                type: 'string'
            }
        },
        required: ['taskCompleted', 'summary']
    }
};

/**
 * Test knowledge base search tool
 */
export const knowledgeBaseSearchTool = {
    name: 'test_search_kb',
    description: 'Search knowledge base for testing',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                description: 'Search query',
                type: 'string'
            }
        },
        required: ['query']
    }
};

/**
 * Test generic tool with no required parameters
 */
export const genericTool = {
    name: 'test_generic_tool',
    description: 'Generic tool for testing',
    inputSchema: {
        type: 'object',
        properties: {
            action: {
                description: 'Action to perform',
                type: 'string'
            }
        }
    }
};

/**
 * Get all test tools
 */
export const allTestTools = {
    balanceCheck: balanceCheckTool,
    idvCheck: idvCheckTool,
    transferToBanking: transferToBankingTool,
    returnToTriage: returnToTriageTool,
    knowledgeBaseSearch: knowledgeBaseSearchTool,
    generic: genericTool
};

/**
 * Get a test tool by name
 */
export function getTestTool(name: string): any | undefined {
    return Object.values(allTestTools).find(t => t.name === name);
}

/**
 * Get all test tool names
 */
export function getAllTestToolNames(): string[] {
    return Object.values(allTestTools).map(t => t.name);
}

/**
 * Convert test tools to Nova Sonic format
 */
export function convertToNovaFormat(tools: any[]): any[] {
    return tools.map(tool => ({
        toolSpec: {
            name: tool.name,
            description: tool.description,
            inputSchema: {
                json: tool.inputSchema
            }
        }
    }));
}
