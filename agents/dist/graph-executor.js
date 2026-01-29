"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphExecutor = void 0;
const graph_converter_1 = require("./graph-converter");
class GraphExecutor {
    constructor(workflowDefinition) {
        this.workflowId = workflowDefinition.testConfig?.personaId || "unknown";
        this.workflowDefinition = workflowDefinition;
        const builder = graph_converter_1.WorkflowConverter.convert(workflowDefinition);
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
    async invoke(initialState, config) {
        return await this.graph.invoke(initialState, config);
    }
    /**
     * Streams the execution of the graph.
     * @param initialState
     */
    async stream(initialState) {
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
    updateState(nodeId, context) {
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
    isValidTransition(fromNodeId, toNodeId) {
        // Start node can transition to anything
        if (fromNodeId === 'unknown' || fromNodeId === 'start') {
            return true;
        }
        // Check if edge exists
        return this.workflowDefinition.edges.some(edge => edge.from === fromNodeId && edge.to === toNodeId);
    }
    /**
     * Get the current workflow state
     */
    getCurrentState() {
        return { ...this.currentState };
    }
    /**
     * Get the current node information
     */
    getCurrentNode() {
        return this.workflowDefinition.nodes.find(n => n.id === this.currentState.currentNodeId);
    }
    /**
     * Get possible next nodes from current position
     */
    getNextNodes() {
        const currentNodeId = this.currentState.currentNodeId;
        const nextNodeIds = this.workflowDefinition.edges
            .filter(edge => edge.from === currentNodeId)
            .map(edge => edge.to);
        return this.workflowDefinition.nodes.filter(node => nextNodeIds.includes(node.id));
    }
    /**
     * Reset state to start node
     */
    resetState() {
        const startNode = this.workflowDefinition.nodes.find(n => n.type === 'start');
        this.currentState = {
            messages: [],
            context: {},
            currentWorkflowId: this.workflowId,
            currentNodeId: startNode?.id || 'unknown'
        };
    }
    getGraph() {
        return this.graph;
    }
    getWorkflowId() {
        return this.workflowId;
    }
    getWorkflowDefinition() {
        return this.workflowDefinition;
    }
}
exports.GraphExecutor = GraphExecutor;
