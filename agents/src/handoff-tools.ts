/**
 * Handoff Tools - Tools that agents can call to transfer conversations to other agents
 */

export interface HandoffTool {
    toolSpec: {
        name: string;
        description: string;
        inputSchema: {
            json: string;
        };
    };
}

/**
 * Generate handoff tools for agent-to-agent transfers
 */
export function generateHandoffTools(): HandoffTool[] {
    return [
        {
            toolSpec: {
                name: 'transfer_to_banking',
                description: 'Transfer the conversation to the Banking Specialist agent. Use this when the user needs help with: account balance, transactions, payments, transfers, or general banking services.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            reason: {
                                type: 'string',
                                description: 'Brief reason for the transfer (e.g., "User needs balance check")'
                            },
                            context: {
                                type: 'string',
                                description: 'Any relevant context to pass to the banking agent'
                            }
                        },
                        required: ['reason']
                    })
                }
            }
        },
        {
            toolSpec: {
                name: 'transfer_to_idv',
                description: 'Transfer the conversation to the Identity Verification agent. Use this when the user needs identity verification or security checks before accessing sensitive information.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            reason: {
                                type: 'string',
                                description: 'Brief reason for the transfer (e.g., "User needs identity verification")'
                            },
                            context: {
                                type: 'string',
                                description: 'Any relevant context to pass to the IDV agent'
                            }
                        },
                        required: ['reason']
                    })
                }
            }
        },
        {
            toolSpec: {
                name: 'transfer_to_mortgage',
                description: 'Transfer the conversation to the Mortgage Specialist agent. Use this when the user needs help with: mortgage applications, mortgage rates, home loans, or mortgage-related queries.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            reason: {
                                type: 'string',
                                description: 'Brief reason for the transfer (e.g., "User wants mortgage information")'
                            },
                            context: {
                                type: 'string',
                                description: 'Any relevant context to pass to the mortgage agent'
                            }
                        },
                        required: ['reason']
                    })
                }
            }
        },
        {
            toolSpec: {
                name: 'transfer_to_disputes',
                description: 'Transfer the conversation to the Disputes Specialist agent. Use this when the user needs to: raise a dispute, challenge a transaction, report unauthorized charges, or manage existing disputes.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            reason: {
                                type: 'string',
                                description: 'Brief reason for the transfer (e.g., "User wants to dispute a transaction")'
                            },
                            context: {
                                type: 'string',
                                description: 'Any relevant context to pass to the disputes agent'
                            }
                        },
                        required: ['reason']
                    })
                }
            }
        },
        {
            toolSpec: {
                name: 'transfer_to_investigation',
                description: 'Transfer the conversation to the Investigation agent. Use this when the user reports: unrecognized transactions, potential fraud, suspicious activity, or needs fraud investigation.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            reason: {
                                type: 'string',
                                description: 'Brief reason for the transfer (e.g., "User reports unrecognized transaction")'
                            },
                            context: {
                                type: 'string',
                                description: 'Any relevant context to pass to the investigation agent'
                            }
                        },
                        required: ['reason']
                    })
                }
            }
        },
        {
            toolSpec: {
                name: 'return_to_triage',
                description: 'Return the conversation to the Triage agent after completing your task. Use this when you have finished helping the user and they may need assistance with something else.',
                inputSchema: {
                    json: JSON.stringify({
                        type: 'object',
                        properties: {
                            taskCompleted: {
                                type: 'string',
                                description: 'What task was completed (e.g., "balance_check", "identity_verification")'
                            },
                            summary: {
                                type: 'string',
                                description: 'Brief summary of what was done (e.g., "Verified user identity and provided balance")'
                            }
                        },
                        required: ['taskCompleted', 'summary']
                    })
                }
            }
        }
    ];
}

/**
 * Check if a tool name is a handoff tool
 */
export function isHandoffTool(toolName: string): boolean {
    return toolName.startsWith('transfer_to_') || toolName === 'return_to_triage';
}

/**
 * Extract target agent ID from handoff tool name
 * e.g., "transfer_to_banking" -> "banking"
 * e.g., "return_to_triage" -> "triage"
 */
export function getTargetAgentFromTool(toolName: string): string | null {
    if (toolName === 'return_to_triage') {
        return 'triage';
    }
    
    if (!toolName.startsWith('transfer_to_')) {
        return null;
    }
    
    const parts = toolName.split('transfer_to_');
    if (parts.length !== 2) {
        return null;
    }
    
    return parts[1];
}

/**
 * Map agent names to persona IDs
 */
export function getPersonaIdForAgent(agentName: string): string {
    const mapping: Record<string, string> = {
        'banking': 'persona-SimpleBanking',
        'idv': 'idv',
        'mortgage': 'persona-mortgage',
        'disputes': 'persona-BankingDisputes',
        'investigation': 'investigation'
    };
    
    return mapping[agentName] || agentName;
}
