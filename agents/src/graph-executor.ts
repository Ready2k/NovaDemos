
import { CompiledStateGraph } from "@langchain/langgraph";
import { GraphState, WorkflowDefinition } from "./graph-types";
import { WorkflowConverter } from "./graph-converter";
import { BaseMessage } from "@langchain/core/messages";

export class GraphExecutor {
    private graph: CompiledStateGraph<GraphState, Partial<GraphState>, string>;
    private workflowId: string;

    constructor(workflowDefinition: WorkflowDefinition) {
        this.workflowId = workflowDefinition.testConfig?.personaId || "unknown";
        const builder = WorkflowConverter.convert(workflowDefinition);
        this.graph = builder.compile();
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

    public getGraph() {
        return this.graph;
    }
}
