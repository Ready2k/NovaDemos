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
    testPersona?: string; // Legacy field, prefer testConfig.personaId
    testConfig?: TestConfiguration;
}

export interface TestConfiguration {
    id?: string; // For potentially saving multiple test configs in the future
    name?: string; // "My IDV Test"
    personaId?: string; // ID of the persona to use
    successCriteria?: string; // "User successfully verifies ID"
    disconnectAction?: 'always' | 'never' | 'ask'; // What to do after outcome
    saveReport?: boolean; // Whether to show the report at the end
    testInstructions?: string; // Specific instructions for the simulated user
}
