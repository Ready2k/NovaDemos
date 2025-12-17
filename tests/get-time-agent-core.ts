import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import * as dotenv from 'dotenv';

// Load environment variables from backend/.env file
dotenv.config({ path: 'backend/.env' });

const REGION = process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1';
const CONFIG_ARN = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/BankingCoreRuntime_http_v1-abc123456";
let RUNTIME_ARN = process.env.AGENT_CORE_RUNTIME_ARN || CONFIG_ARN;

// Strip /runtime-endpoint/... suffix if present
if (RUNTIME_ARN.includes('/runtime-endpoint/')) {
    RUNTIME_ARN = RUNTIME_ARN.split('/runtime-endpoint/')[0];
    console.log(`[Test] Sanitized ARN: ${RUNTIME_ARN}`);
}

async function runTest() {
    console.log('[Test] initializing BedrockAgentCoreClient...');
    console.log(`[Test] Region: ${REGION}`);
    console.log(`[Test] Runtime ARN: ${RUNTIME_ARN}`);

    const client = new BedrockAgentCoreClient({
        region: REGION
    });

    const sessionId = `test-session-time-${Date.now()}`;
    const runtimeSessionId = `agent-core-runtime-${sessionId}`; // Ensure length > 33

    console.log(`[Test] Session ID: ${sessionId}`);
    console.log(`[Test] Runtime Session ID: ${runtimeSessionId}`);

    // Try 'prompt' format with injected context (RAG-style)
    // Since the Agent doesn't have a time tool, we provide the data.
    // Updated to match server.ts: Request Python script execution

    // 1. Define your location context variables
    const userLocation = "London, England, United Kingdom";
    const userTimezone = "Europe/London"; // Handles GMT vs BST automatically

    // 2. Inject these variables into the prompt using Template Literals (``)
    // We explicitly tell Python to use 'zoneinfo' with your timezone.
    const agentPayload = {
        prompt: `Write and execute a Python script to get the current UTC time. 
                 Then, using the 'zoneinfo' library, convert it to the '${userTimezone}' timezone. 
                 Display the result as the current time for ${userLocation}. 
                 Only output the formatted time string, nothing else.`
    };

    console.log(`[Test] Constructed Prompt: ${agentPayload.prompt}`);


    try {
        const input = {
            agentRuntimeArn: RUNTIME_ARN,
            qualifier: 'DEFAULT',
            runtimeSessionId: runtimeSessionId,
            payload: new TextEncoder().encode(JSON.stringify(agentPayload)),
            contentType: "application/json",
            accept: "application/json"
        };

        const command = new InvokeAgentRuntimeCommand(input);

        console.log('[Test] Sending command to AWS AgentCore (Qualifier: DEFAULT)...');
        console.log(`[Test] Payload: ${JSON.stringify(agentPayload, null, 2)}`);

        const response = await client.send(command);

        console.log('[Test] Response received!');
        console.log('[Test] Metadata:', response.$metadata);

        if (response.response) {
            // response.response is a stream/blob depending on SDK version, verify transformation
            const textResponse = await response.response.transformToString();
            console.log('[Test] Response Body:', textResponse);

            try {
                const json = JSON.parse(textResponse);
                console.log('[Test] Parsed JSON:', JSON.stringify(json, null, 2));
            } catch (e) {
                console.log('[Test] Response is not JSON.');
            }

        } else {
            // Check if the payload is directly on the object if types are weird
            console.log('[Test] Full Response Object Keys:', Object.keys(response));
        }

    } catch (err: any) {
        console.error('[Test] Error invoking AgentCore:', err);
        if (err.name) console.error('[Test] Error Name:', err.name);
        if (err.message) console.error('[Test] Error Message:', err.message);
        if (err.$metadata) console.error('[Test] Error Metadata:', err.$metadata);
    }
}

runTest();
