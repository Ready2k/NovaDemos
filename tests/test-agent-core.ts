import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import * as dotenv from 'dotenv';

// Load environment variables from backend/.env file
dotenv.config({ path: 'backend/.env' });

const REGION = process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1';
const CONFIG_ARN = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/BankingCoreRuntime_http_v1-abc123456";
let RUNTIME_ARN = process.env.AGENT_CORE_RUNTIME_ARN || CONFIG_ARN;
// Strip /runtime-endpoint/... suffix if present (User note: qualifier 'DEFAULT' replaces this suffix)
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

    const sessionId = `test-session-${Date.now()}`;
    const runtimeSessionId = `agent-core-runtime-${sessionId}`; // Ensure length > 33

    console.log(`[Test] Session ID: ${sessionId}`);
    console.log(`[Test] Runtime Session ID: ${runtimeSessionId}`);

    // User Example suggests sending a prompt payload is the standard way for AgentCore.
    // However, we want to test the specific tool "payments_agent".
    // 1. Try Tool Payload first (as we did).
    // 2. Wrap it if needed.
    // The user's code: payload: JSON.stringify({ prompt: userPrompt })

    // Let's create a test that sends a prompt that SHOULD trigger functionality.
    // Or we keep our direct invocation payload but send it to the DEFAULT qualifier as requested.

    const toolPayload = {
        customerId: "CUST-123456",
        intent: "check_balance"
    };

    // 1. Revert to Tool Payload to verify Permission Fix
    // We know this payload reached the app logic before (causing AccessDenied).
    // Now that permissions are fixed, let's see if this payload works.

    // const promptPayload = {
    //     prompt: "check balance for customer CUST-123456"
    // };

    try {
        const input = {
            agentRuntimeArn: RUNTIME_ARN,

            // CRITICAL FIX from User: "Must be 'DEFAULT' (uppercase)"
            qualifier: 'DEFAULT',

            runtimeSessionId: runtimeSessionId,
            payload: new TextEncoder().encode(JSON.stringify(toolPayload)),

            contentType: "application/json",
            accept: "application/json"
        };

        const command = new InvokeAgentRuntimeCommand(input);

        console.log('[Test] Sending command to AWS AgentCore (Qualifier: DEFAULT)...');
        console.log(`[Test] Payload: ${JSON.stringify(toolPayload)}`);

        const response = await client.send(command);

        console.log('[Test] Response received!');
        console.log('[Test] Metadata:', response.$metadata);

        if (response.response) {
            const textResponse = await response.response.transformToString();
            console.log('[Test] Response Body:', textResponse);

            try {
                const json = JSON.parse(textResponse);
                console.log('[Test] Parsed JSON:', JSON.stringify(json, null, 2));
            } catch (e) {
                console.log('[Test] Response is not JSON.');
            }

        } else {
            console.log('[Test] Response body is empty.');
        }

    } catch (err: any) {
        console.error('[Test] Error invoking AgentCore:', err);
        if (err.name) console.error('[Test] Error Name:', err.name);
        if (err.message) console.error('[Test] Error Message:', err.message);
        if (err.$metadata) console.error('[Test] Error Metadata:', err.$metadata);
    }
}

runTest();
