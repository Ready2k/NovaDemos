
import { CompiledStateGraph } from "@langchain/langgraph";
import { GraphState, WorkflowDefinition, WorkflowNode } from "./graph-types";
import { WorkflowConverter } from "./graph-converter";
import { BaseMessage } from "@langchain/core/messages";

export class GraphExecutor {
    private graph: CompiledStateGraph<GraphState, Partial<GraphState>, string>;
    private workflowId: string;
    private workflowDefinition: WorkflowDefinition;
    private currentState: Partial<GraphState>;

    constructor(workflowDefinition: WorkflowDefinition) {
        this.workflowId = workflowDefinition.testConfig?.personaId || "unknown";
        this.workflowDefinition = workflowDefinition;
        const builder = WorkflowConverter.convert(workflowDefinition);
        this.graph = builder.compile();
        
        // Initialize state with start node
        const startNode = workflowDefinition.nodes.find(n => n.type === 'start');
        this.currentState = {
            messages: [],
            context: {},
            currentWorkflowId: this.workflowId,
            currentNodeId: startNode?.id || 'unknown'
        };
    }

    /**
     * Executes the graph with the given input state.
     * @param initialState The starting state
     * @param config Optional config
     */
    public async invoke(initialState: Partial<GraphState>, config?: any) {
        return await this.graph.invoke(initialState, config);
    }

    /**
     * Streams the execution of the graph.
     * @param initialState 
     */
    public async stream(initialState: Partial<GraphState>) {
        const stream = await this.graph.stream(initialState);
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }
        return events;
    }

    /**
     * Update the current workflow state based on a node transition.
     * This is called when [STEP: node_id] is parsed from Nova Sonic.
     * 
     * @param nodeId The ID of the node we're transitioning to
     * @param context Optional context to merge into state
     * @returns Updated state and transition info
     */
    public updateState(nodeId: string, context?: Record<string, any>): {
        success: boolean;
        previousNode: string;
        currentNode: string;
        nodeInfo: WorkflowNode | undefined;
        validTransition: boolean;
        error?: string;
    } {
        const previousNode = this.currentState.currentNodeId || 'unknown';
        
        // Find the node in workflow definition
        const node = this.workflowDefinition.nodes.find(n => n.id === nodeId);
        
        if (!node) {
            return {
                success: false,
                previousNode,
                currentNode: previousNode,
                nodeInfo: undefined,
                validTransition: false,
                error: `Node '${nodeId}' not found in workflow`
            };
        }

        // Validate transition (check if edge exists from previous to current)
        const validTransition = this.isValidTransition(previousNode, nodeId);
        
        // Update state
        this.currentState = {
            ...this.currentState,
            currentNodeId: nodeId,
            context: {
                ...this.currentState.context,
                ...context
            }
        };

        return {
            success: true,
            previousNode,
            currentNode: nodeId,
            nodeInfo: node,
            validTransition,
            error: validTransition ? undefined : `No edge found from '${previousNode}' to '${nodeId}'`
        };
    }

    /**
     * Check if a transition from one node to another is valid
     */
    private isValidTransition(fromNodeId: string, toNodeId: string): boolean {
        // Start node can transition to anything
        if (fromNodeId === 'unknown' || fromNodeId === 'start') {
            return true;
        }

        // Check if edge exists
        return this.workflowDefinition.edges.some(
            edge => edge.from === fromNodeId && edge.to === toNodeId
        );
    }

    /**
     * Get the current workflow state
     */
    public getCurrentState(): Partial<GraphState> {
        return { ...this.currentState };
    }

    /**
     * Get the current node information
     */
    public getCurrentNode(): WorkflowNode | undefined {
        return this.workflowDefinition.nodes.find(
            n => n.id === this.currentState.currentNodeId
        );
    }

    /**
     * Get possible next nodes from current position
     */
    public getNextNodes(): WorkflowNode[] {
        const currentNodeId = this.currentState.currentNodeId;
        const nextNodeIds = this.workflowDefinition.edges
            .filter(edge => edge.from === currentNodeId)
            .map(edge => edge.to);
        
        return this.workflowDefinition.nodes.filter(
            node => nextNodeIds.includes(node.id)
        );
    }

    /**
     * Reset state to start node
     */
    public resetState(): void {
        const startNode = this.workflowDefinition.nodes.find(n => n.type === 'start');
        this.currentState = {
            messages: [],
            context: {},
            currentWorkflowId: this.workflowId,
            currentNodeId: startNode?.id || 'unknown'
        };
    }

    public getGraph() {
        return this.graph;
    }

    public getWorkflowId(): string {
        return this.workflowId;
    }

    public getWorkflowDefinition(): WorkflowDefinition {
        return this.workflowDefinition;
    }
}
