import * as fs from 'fs';
import * as path from 'path';

/**
 * Phantom Action Watcher
 * 
 * Detects when the LLM promises to perform an action (e.g., "I'll check your balance")
 * but fails to actually call the corresponding tool in the same turn.
 * 
 * Provides auto-correction by generating reprompts to force tool execution.
 */

export interface ActionPattern {
    name: string;
    pattern: RegExp;
    expectedTool: string;
    reprompt: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface PhantomDetection {
    detected: boolean;
    actionName?: string;
    expectedTool?: string;
    reprompt?: string;
    confidence?: string;
    assistantText: string;
    toolsCalled: string[];
}

export interface PhantomLogEntry {
    timestamp: string;
    sessionId: string;
    actionName: string;
    expectedTool: string;
    assistantText: string;
    toolsCalled: string[];
    confidence: string;
    correctionAttempted: boolean;
    correctionSuccessful?: boolean;
    repromptUsed?: string;
}

/**
 * Action patterns for detecting phantom actions
 * Start with high-confidence patterns only
 */
export const ACTION_PATTERNS: ActionPattern[] = [
    {
        name: 'balance_check',
        pattern: /\b(let me check|i'll check|i'm checking|checking)\s+(your\s+)?(balance|account\s+balance)/i,
        expectedTool: 'agentcore_balance',
        reprompt: 'SYSTEM OVERRIDE: You said you would check the balance but did not call agentcore_balance. You MUST call the tool NOW with the verified account details.',
        confidence: 'high'
    },
    {
        name: 'dispute_creation',
        pattern: /\b(creating|i'll create|let me create|raising|i'll raise|we can proceed with creating|i'm creating)\s+(a\s+|your\s+)?(dispute|case|dispute case)/i,
        expectedTool: 'create_dispute_case',
        reprompt: 'SYSTEM OVERRIDE: You said you would create a dispute but did not call create_dispute_case. You MUST execute the tool NOW with all the dispute details you have collected.',
        confidence: 'high'
    },
    {
        name: 'transaction_lookup',
        pattern: /\b(let me look up|i'll check|looking up|let me pull up|i'm looking up|checking)\s+(your\s+)?(transactions|recent\s+transactions|transaction\s+history)/i,
        expectedTool: 'get_account_transactions',
        reprompt: 'SYSTEM OVERRIDE: You said you would check transactions but did not call get_account_transactions. Call it NOW with the account details.',
        confidence: 'high'
    },
    {
        name: 'idv_verification',
        pattern: /\b(verifying|let me verify|i'll verify|checking those details|i'm verifying)\s+(your\s+)?(account|identity|details)/i,
        expectedTool: 'perform_idv_check',
        reprompt: 'SYSTEM OVERRIDE: You said you would verify the account but did not call perform_idv_check. Execute it NOW with the account number and sort code.',
        confidence: 'high'
    },
    {
        name: 'merchant_lookup',
        pattern: /\b(let me look up|i'll check|looking up|checking)\s+(the\s+)?(merchant|merchant\s+alias)/i,
        expectedTool: 'lookup_merchant_alias',
        reprompt: 'SYSTEM OVERRIDE: You said you would look up the merchant but did not call lookup_merchant_alias. Call it NOW.',
        confidence: 'high'
    },
    {
        name: 'branch_lookup',
        pattern: /\b(let me find|i'll find|looking up|finding|searching for)\s+(a\s+|the\s+)?(branch|branches|nearest\s+branch)/i,
        expectedTool: 'uk_branch_lookup',
        reprompt: 'SYSTEM OVERRIDE: You said you would find branches but did not call uk_branch_lookup. Execute it NOW with the location provided.',
        confidence: 'high'
    }
];

/**
 * Detect if assistant's response contains a phantom action
 * 
 * @param assistantText - The text from the assistant's response
 * @param toolsCalled - Array of tool names that were called in this turn
 * @returns PhantomDetection object
 */
export function detectPhantomAction(
    assistantText: string,
    toolsCalled: string[]
): PhantomDetection {
    // Check each action pattern
    for (const pattern of ACTION_PATTERNS) {
        // Check if the assistant's text matches the action promise pattern
        if (pattern.pattern.test(assistantText)) {
            // Check if the expected tool was actually called
            if (!toolsCalled.includes(pattern.expectedTool)) {
                // PHANTOM ACTION DETECTED!
                return {
                    detected: true,
                    actionName: pattern.name,
                    expectedTool: pattern.expectedTool,
                    reprompt: pattern.reprompt,
                    confidence: pattern.confidence,
                    assistantText: assistantText,
                    toolsCalled: toolsCalled
                };
            }
        }
    }

    // No phantom action detected
    return {
        detected: false,
        assistantText: assistantText,
        toolsCalled: toolsCalled
    };
}

/**
 * Log a phantom action detection to the dedicated log file
 * 
 * @param detection - The phantom detection result
 * @param sessionId - The current session ID
 * @param correctionAttempted - Whether auto-correction was attempted
 * @param correctionSuccessful - Whether the correction was successful (optional)
 */
export function logPhantomAction(
    detection: PhantomDetection,
    sessionId: string,
    correctionAttempted: boolean,
    correctionSuccessful?: boolean
): void {
    if (!detection.detected) {
        return; // Nothing to log
    }

    const logEntry: PhantomLogEntry = {
        timestamp: new Date().toISOString(),
        sessionId: sessionId,
        actionName: detection.actionName!,
        expectedTool: detection.expectedTool!,
        assistantText: detection.assistantText,
        toolsCalled: detection.toolsCalled,
        confidence: detection.confidence!,
        correctionAttempted: correctionAttempted,
        correctionSuccessful: correctionSuccessful,
        repromptUsed: correctionAttempted ? detection.reprompt : undefined
    };

    // Ensure logs directory exists
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    // Append to phantom-actions.jsonl (JSON Lines format)
    const logFile = path.join(logsDir, 'phantom-actions.jsonl');
    const logLine = JSON.stringify(logEntry) + '\n';

    try {
        fs.appendFileSync(logFile, logLine, 'utf8');
        console.log(`[PhantomWatcher] Logged phantom action: ${detection.actionName} (correction: ${correctionAttempted})`);
    } catch (error) {
        console.error('[PhantomWatcher] Failed to write log:', error);
    }
}

/**
 * Get statistics from the phantom action log
 * Useful for monitoring and analysis
 */
export function getPhantomActionStats(): {
    totalDetections: number;
    correctionsAttempted: number;
    correctionsSuccessful: number;
    byAction: Record<string, number>;
} {
    const logFile = path.join(__dirname, '../../logs/phantom-actions.jsonl');

    if (!fs.existsSync(logFile)) {
        return {
            totalDetections: 0,
            correctionsAttempted: 0,
            correctionsSuccessful: 0,
            byAction: {}
        };
    }

    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(line => line.trim());
    const entries: PhantomLogEntry[] = lines.map(line => JSON.parse(line));

    const stats = {
        totalDetections: entries.length,
        correctionsAttempted: entries.filter(e => e.correctionAttempted).length,
        correctionsSuccessful: entries.filter(e => e.correctionSuccessful === true).length,
        byAction: {} as Record<string, number>
    };

    // Count by action type
    for (const entry of entries) {
        stats.byAction[entry.actionName] = (stats.byAction[entry.actionName] || 0) + 1;
    }

    return stats;
}
