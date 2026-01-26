// Tool and workflow types

export interface Tool {
    name: string;
    description: string;
    enabled: boolean;
    inputSchema?: any;
}

export interface Workflow {
    id: string;
    name: string;
    description?: string;
    linked: boolean;
}

export interface WorkflowStep {
    id: string;
    name: string;
    description?: string;
    requirements: WorkflowRequirement[];
    status: 'pending' | 'active' | 'completed' | 'failed';
}

export interface WorkflowRequirement {
    id: string;
    description: string;
    status: 'pending' | 'satisfied' | 'failed';
}

export interface KeyMoment {
    id: string;
    type: 'connected' | 'disconnected' | 'tool' | 'error' | 'workflow';
    title: string;
    details?: string;
    timestamp: string;
}
