export interface WorkflowNode {
    id: string;
    label: string;
    type: 'start' | 'end' | 'process' | 'decision' | 'tool' | 'workflow';
    toolName?: string;
    workflowId?: string;
    outcome?: string;
}

export interface WorkflowEdge {
    from: string;
    to: string;
    label?: string;
}

export interface WorkflowDefinition {
    id: string;
    name?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    testPersona?: string;
}
