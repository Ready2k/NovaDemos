
import * as fs from 'fs';
import * as path from 'path';
import { GraphExecutor } from './graph/executor';
import { WorkflowDefinition } from './graph/types';

// Load a workflow file
const workflowPath = path.join(__dirname, 'workflow-banking-master.json');
console.log(`Loading workflow from: ${workflowPath}`);

const workflowData = JSON.parse(fs.readFileSync(workflowPath, 'utf-8')) as WorkflowDefinition;

async function runTest() {
    console.log("Initializing Graph Executor...");
    const executor = new GraphExecutor(workflowData);

    console.log("Starting execution...");
    const initialState = {
        context: { userId: "test-user" },
        messages: []
    };

    // Stream Execution
    const stream = await executor.stream(initialState);

    console.log("--- Execution Stream ---");
    for (const event of stream) {
        console.log("Event:", JSON.stringify(event, null, 2));
    }
    console.log("--- End of Stream ---");
}

runTest().catch(err => console.error("Test Failed:", err));
