
import { BaseMessage } from "@langchain/core/messages";

/**
 * The State interface for our LangGraph execution.
 * This extends the basic message history to include our specific context.
 */
export interface GraphState {
    messages: BaseMessage[];
    /**
     * Context variables accessible to all nodes.
     * Can include user details, session info, etc.
     */
    context: Record<string, any>;
    /**
     * The ID of the current active workflow (e.g. 'banking-master')
     */
    currentWorkflowId: string;
    /**
     * The ID of the current active node within the workflow
     */
    currentNodeId: string;
    /**
     * Outcome of the last decision or tool execution
     */
    lastOutcome?: string;
}

/**
 * JSON Workflow Schema Definitions
 */

export type NodeType = 'start' | 'end' | 'decision' | 'tool' | 'workflow' | 'message';

export interface WorkflowNode {
    id: string;
    label: string;
    type: NodeType;
    // Specific properties
    workflowId?: string; // For 'workflow' type
    toolName?: string;   // For 'tool' type
    outcome?: string;    // For 'end' type
    message?: string;    // For 'message' type
}

export interface WorkflowEdge {
    from: string;
    to: string;
    label?: string; // Condition for decision nodes
}

export interface WorkflowTestConfig {
    personaId?: string;
    successCriteria?: string;
    testInstructions?: string;
    disconnectAction?: string;
    saveReport?: boolean;
    maxTurns?: number;
}

export interface WorkflowDefinition {
    id?: string;
    name?: string;
    personaId?: string;  // Link to persona configuration
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    testConfig?: WorkflowTestConfig;
    voiceId?: string;
    metadata?: {
        persona?: string;
        language?: string;
        description?: string;
        [key: string]: any;
    };
}
