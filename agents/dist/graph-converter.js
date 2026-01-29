"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowConverter = void 0;
const langgraph_1 = require("@langchain/langgraph");
const runnables_1 = require("@langchain/core/runnables");
/**
 * Converts a JSON Workflow Definition into a LangGraph StateGraph.
 */
class WorkflowConverter {
    static convert(workflow) {
        const graph = new langgraph_1.StateGraph({
            channels: {
                messages: {
                    reducer: (a, b) => a.concat(b),
                    default: () => [],
                },
                context: {
                    reducer: (a, b) => ({ ...a, ...b }),
                    default: () => ({}),
                },
                currentWorkflowId: {
                    reducer: (a, b) => b ?? a, // Last write wins
                    default: () => "unknown",
                },
                currentNodeId: {
                    reducer: (a, b) => b ?? a,
                    default: () => "start",
                },
                lastOutcome: {
                    reducer: (a, b) => b ?? a,
                    default: () => undefined,
                }
            }
        });
        // 1. Add Nodes
        workflow.nodes.forEach(node => {
            if (node.type === 'start') {
                // specific start logic if needed, or just a pass-through
                graph.addNode(node.id, WorkflowConverter.createNodeRunnable(node, workflow));
            }
            else if (node.type === 'end') {
                // End nodes might just update state to indicate finish
                graph.addNode(node.id, WorkflowConverter.createNodeRunnable(node, workflow));
            }
            else {
                graph.addNode(node.id, WorkflowConverter.createNodeRunnable(node, workflow));
            }
        });
        // 2. Add Edges
        const startNode = workflow.nodes.find(n => n.type === 'start');
        if (startNode) {
            graph.setEntryPoint(startNode.id);
        }
        workflow.nodes.forEach(node => {
            const outgoingEdges = workflow.edges.filter(e => e.from === node.id);
            if (outgoingEdges.length === 0) {
                if (node.type !== 'end') {
                    // If not explicitly marked as end types but has no edges, end graph
                    graph.addEdge(node.id, langgraph_1.END);
                }
                else {
                    graph.addEdge(node.id, langgraph_1.END);
                }
                return;
            }
            // If decision node, use conditional edges
            if (node.type === 'decision') {
                const routeMap = {};
                outgoingEdges.forEach(edge => {
                    const condition = edge.label || "default";
                    routeMap[condition] = edge.to;
                });
                graph.addConditionalEdges(node.id, (state) => {
                    // The logic to determine the next path based on state.lastOutcome
                    // In a real agent, 'decision' nodes would run an LLM to output an intent/outcome
                    // which matches one of the edge labels.
                    return state.lastOutcome || "default";
                }, routeMap);
            }
            else {
                // Standard single edge
                // If multiple unconditional edges exist, that's invalid in this simplified model 
                // (except for parallel branches which we aren't handling yet)
                if (outgoingEdges.length === 1) {
                    graph.addEdge(node.id, outgoingEdges[0].to);
                }
            }
        });
        return graph;
    }
    /**
     * Creates a RunnableLambda for a general node.
     * This acts as the runtime logic for that node.
     */
    static createNodeRunnable(node, workflow) {
        return runnables_1.RunnableLambda.from(async (state) => {
            console.log(`[Graph] Executing Node: ${node.id} (${node.type})`);
            // Default State Update
            const updates = {
                currentNodeId: node.id
            };
            // Node Specific Logic
            if (node.type === 'workflow') {
                console.log(`[Graph] Needs to sub-call workflow: ${node.workflowId}`);
                // In future, this would invoke a sub-graph
                // SIMULATION: Determine happy path outcome
                // Look for the node that follows this one
                // This is tricky because the NEXT node is a decision node, but WE need to provide the outcome for THAT decision node to consume?
                // No, usually the decision node looks at lastOutcome.
                // So we need to set lastOutcome to something that the NEXT decision node accepts.
                // Find edges FROM the node that follows us.
                // This assumes linear flow: Context -> Decision -> ...
                const myOutgoingEdges = workflow.edges.filter(e => e.from === node.id);
                if (myOutgoingEdges.length > 0) {
                    const nextNodeId = myOutgoingEdges[0].to;
                    const nextNode = workflow.nodes.find(n => n.id === nextNodeId);
                    if (nextNode && nextNode.type === 'decision') {
                        const decisionEdges = workflow.edges.filter(e => e.from === nextNodeId);
                        if (decisionEdges.length > 0) {
                            // Pick the first edge label as the "Happy Path" outcome
                            // Typically "Yes", "Success" are defined first or we just pick one.
                            const simulatedOutcome = decisionEdges.find(e => e.label?.toLowerCase().includes('yes') || e.label?.toLowerCase().includes('proceed'))?.label || decisionEdges[0].label;
                            console.log(`[Graph] Simulating outcome: "${simulatedOutcome}" for next decision.`);
                            updates.lastOutcome = simulatedOutcome;
                        }
                    }
                }
            }
            else if (node.type === 'tool') {
                console.log(`[Graph] Needs to call tool: ${node.toolName}`);
                // Agent would call tool here
            }
            else if (node.type === 'end') {
                console.log(`[Graph] Workflow Reached End: ${node.outcome}`);
                updates.lastOutcome = node.outcome;
                // Check if this is a handoff outcome
                if (node.outcome && typeof node.outcome === 'string' && node.outcome.includes('HANDOFF')) {
                    // Extract target agent from outcome
                    // Patterns: "VULNERABILITY_HANDOFF", "ACCOUNT_FROZEN_HANDOFF", etc.
                    // Map these to actual agent IDs
                    const outcomeUpper = node.outcome.toUpperCase();
                    let targetAgent;
                    if (outcomeUpper.includes('VULNERABILITY') || outcomeUpper.includes('SPECIALIST')) {
                        targetAgent = 'banking'; // Vulnerable customers go to banking specialists
                    }
                    else if (outcomeUpper.includes('FROZEN') || outcomeUpper.includes('SECURITY')) {
                        targetAgent = 'disputes'; // Frozen accounts go to disputes/security
                    }
                    else if (outcomeUpper.includes('MORTGAGE') || outcomeUpper.includes('LOAN')) {
                        targetAgent = 'mortgage';
                    }
                    else if (outcomeUpper.includes('IDV') || outcomeUpper.includes('IDENTITY')) {
                        targetAgent = 'idv';
                    }
                    else if (outcomeUpper.includes('BANKING')) {
                        targetAgent = 'banking';
                    }
                    else if (outcomeUpper.includes('DISPUTE')) {
                        targetAgent = 'disputes';
                    }
                    if (targetAgent) {
                        console.log(`[Graph] Handoff detected: ${node.outcome} → ${targetAgent}`);
                        updates.handoff = targetAgent;
                    }
                }
            }
            // We return the state update
            return updates;
        });
    }
}
exports.WorkflowConverter = WorkflowConverter;
