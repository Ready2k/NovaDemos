/**
 * Test Workflow Definitions
 * 
 * This module provides test workflow definitions for integration testing.
 * These workflows are simplified versions for testing agent behavior.
 * 
 * Validates: Requirement 13.4 - Testing Support
 */

import { WorkflowDefinition } from '../../src/graph-types';

/**
 * Simple linear workflow for basic testing
 * Tests: Start -> Message -> End flow
 */
export const simpleWorkflow: WorkflowDefinition = {
    id: 'test-simple',
    name: 'Simple Test Workflow',
    metadata: {
        description: 'A simple linear workflow for basic testing'
    },
    nodes: [
        {
            id: 'start',
            label: 'Start',
            type: 'start'
        },
        {
            id: 'process',
            label: 'Process user request',
            type: 'message',
            message: 'Processing your request'
        },
        {
            id: 'end',
            label: 'End',
            type: 'end',
            outcome: 'SUCCESS'
        }
    ],
    edges: [
        {
            from: 'start',
            to: 'process'
        },
        {
            from: 'process',
            to: 'end'
        }
    ]
};

/**
 * Decision-based workflow for testing branching logic
 * Tests: Start -> Decision -> Branch A or B -> End
 */
export const decisionWorkflow: WorkflowDefinition = {
    id: 'test-decision',
    name: 'Decision Test Workflow',
    metadata: {
        description: 'A workflow with decision branching for testing'
    },
    nodes: [
        {
            id: 'start',
            label: 'Start',
            type: 'start'
        },
        {
            id: 'check_verified',
            label: 'Check if user is verified',
            type: 'decision'
        },
        {
            id: 'verified_path',
            label: 'Handle verified user',
            type: 'message',
            message: 'User is verified'
        },
        {
            id: 'unverified_path',
            label: 'Request verification',
            type: 'message',
            message: 'Please verify your identity'
        },
        {
            id: 'end_verified',
            label: 'End - Verified',
            type: 'end',
            outcome: 'VERIFIED'
        },
        {
            id: 'end_unverified',
            label: 'End - Needs Verification',
            type: 'end',
            outcome: 'NEEDS_VERIFICATION'
        }
    ],
    edges: [
        {
            from: 'start',
            to: 'check_verified'
        },
        {
            from: 'check_verified',
            to: 'verified_path',
            label: 'Yes'
        },
        {
            from: 'check_verified',
            to: 'unverified_path',
            label: 'No'
        },
        {
            from: 'verified_path',
            to: 'end_verified'
        },
        {
            from: 'unverified_path',
            to: 'end_unverified'
        }
    ]
};

/**
 * Tool-based workflow for testing tool execution
 * Tests: Start -> Tool Call -> Message Result -> End
 */
export const toolWorkflow: WorkflowDefinition = {
    id: 'test-tool',
    name: 'Tool Test Workflow',
    metadata: {
        description: 'A workflow that uses tools for testing'
    },
    nodes: [
        {
            id: 'start',
            label: 'Start',
            type: 'start'
        },
        {
            id: 'call_tool',
            label: 'Call balance check tool',
            type: 'tool',
            toolName: 'test_check_balance'
        },
        {
            id: 'process_result',
            label: 'Process tool result',
            type: 'message',
            message: 'Tool result processed'
        },
        {
            id: 'end',
            label: 'End',
            type: 'end',
            outcome: 'TOOL_COMPLETE'
        }
    ],
    edges: [
        {
            from: 'start',
            to: 'call_tool'
        },
        {
            from: 'call_tool',
            to: 'process_result'
        },
        {
            from: 'process_result',
            to: 'end'
        }
    ]
};

/**
 * Handoff workflow for testing agent handoffs
 * Tests: Start -> Decision -> Handoff or Continue -> End
 */
export const handoffWorkflow: WorkflowDefinition = {
    id: 'test-handoff',
    name: 'Handoff Test Workflow',
    metadata: {
        description: 'A workflow that tests handoff functionality'
    },
    nodes: [
        {
            id: 'start',
            label: 'Start',
            type: 'start'
        },
        {
            id: 'check_specialist_needed',
            label: 'Check if specialist needed',
            type: 'decision'
        },
        {
            id: 'handoff_to_specialist',
            label: 'Transfer to specialist agent',
            type: 'tool',
            toolName: 'transfer_to_banking'
        },
        {
            id: 'handle_locally',
            label: 'Handle request locally',
            type: 'message',
            message: 'Handling your request'
        },
        {
            id: 'end_handoff',
            label: 'End - Handoff',
            type: 'end',
            outcome: 'HANDOFF'
        },
        {
            id: 'end_local',
            label: 'End - Local',
            type: 'end',
            outcome: 'LOCAL_COMPLETE'
        }
    ],
    edges: [
        {
            from: 'start',
            to: 'check_specialist_needed'
        },
        {
            from: 'check_specialist_needed',
            to: 'handoff_to_specialist',
            label: 'Yes'
        },
        {
            from: 'check_specialist_needed',
            to: 'handle_locally',
            label: 'No'
        },
        {
            from: 'handoff_to_specialist',
            to: 'end_handoff'
        },
        {
            from: 'handle_locally',
            to: 'end_local'
        }
    ]
};

/**
 * Complex workflow for integration testing
 * Tests: Multiple decisions, tool calls, and handoffs
 */
export const complexWorkflow: WorkflowDefinition = {
    id: 'test-complex',
    name: 'Complex Test Workflow',
    metadata: {
        description: 'A complex workflow for comprehensive testing'
    },
    nodes: [
        {
            id: 'start',
            label: 'Start',
            type: 'start'
        },
        {
            id: 'check_verified',
            label: 'Check if user is verified',
            type: 'decision'
        },
        {
            id: 'perform_idv',
            label: 'Perform identity verification',
            type: 'tool',
            toolName: 'test_perform_idv'
        },
        {
            id: 'check_idv_result',
            label: 'Check IDV result',
            type: 'decision'
        },
        {
            id: 'check_balance',
            label: 'Check account balance',
            type: 'tool',
            toolName: 'test_check_balance'
        },
        {
            id: 'check_balance_status',
            label: 'Check balance status',
            type: 'decision'
        },
        {
            id: 'handle_low_balance',
            label: 'Handle low balance scenario',
            type: 'message',
            message: 'Your balance is low'
        },
        {
            id: 'handle_normal_balance',
            label: 'Handle normal balance scenario',
            type: 'message',
            message: 'Your balance is healthy'
        },
        {
            id: 'end_success',
            label: 'End - Success',
            type: 'end',
            outcome: 'SUCCESS'
        },
        {
            id: 'end_failed_idv',
            label: 'End - Failed IDV',
            type: 'end',
            outcome: 'FAILED_IDV'
        }
    ],
    edges: [
        {
            from: 'start',
            to: 'check_verified'
        },
        {
            from: 'check_verified',
            to: 'check_balance',
            label: 'Yes'
        },
        {
            from: 'check_verified',
            to: 'perform_idv',
            label: 'No'
        },
        {
            from: 'perform_idv',
            to: 'check_idv_result'
        },
        {
            from: 'check_idv_result',
            to: 'check_balance',
            label: 'Success'
        },
        {
            from: 'check_idv_result',
            to: 'end_failed_idv',
            label: 'Failed'
        },
        {
            from: 'check_balance',
            to: 'check_balance_status'
        },
        {
            from: 'check_balance_status',
            to: 'handle_low_balance',
            label: 'Low'
        },
        {
            from: 'check_balance_status',
            to: 'handle_normal_balance',
            label: 'Normal'
        },
        {
            from: 'handle_low_balance',
            to: 'end_success'
        },
        {
            from: 'handle_normal_balance',
            to: 'end_success'
        }
    ]
};

/**
 * Empty workflow for testing edge cases
 */
export const emptyWorkflow: WorkflowDefinition = {
    id: 'test-empty',
    name: 'Empty Test Workflow',
    metadata: {
        description: 'An empty workflow for edge case testing'
    },
    nodes: [],
    edges: []
};

/**
 * Get all test workflows
 */
export const allTestWorkflows = {
    simple: simpleWorkflow,
    decision: decisionWorkflow,
    tool: toolWorkflow,
    handoff: handoffWorkflow,
    complex: complexWorkflow,
    empty: emptyWorkflow
};

/**
 * Get a test workflow by ID
 */
export function getTestWorkflow(id: string): WorkflowDefinition | undefined {
    return Object.values(allTestWorkflows).find(w => w.id === id);
}
