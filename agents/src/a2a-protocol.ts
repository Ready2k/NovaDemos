/**
 * A2A Communication Protocol Definitions
 */

export interface HandoffRequest {
    type: 'handoff_request';
    sessionId: string;
    targetAgentId: string; // e.g., 'banking', 'mortgage'
    context: {
        lastInput: string;
        extractedEntities: Record<string, any>;
        history: any[];
        [key: string]: any;
    };
    reason: string;
}

export interface HandoffResponse {
    type: 'handoff_response';
    success: boolean;
    error?: string;
    sessionId: string;
}
