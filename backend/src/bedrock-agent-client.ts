import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import * as dotenv from 'dotenv';

dotenv.config();

// Build credentials config
const clientConfig: any = {
    region: process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1',
};

if (process.env.NOVA_AWS_ACCESS_KEY_ID && process.env.NOVA_AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
        accessKeyId: process.env.NOVA_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
    };
} else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
}

const client = new BedrockAgentRuntimeClient(clientConfig);

const agentId = process.env.AGENT_ID!;
const agentAliasId = process.env.AGENT_ALIAS_ID!;

export interface AgentResponse {
    completion: string;
    trace: any[];
}

export async function callBankAgent(
    userText: string,
    sessionId: string,
    agentIdOverride?: string,
    agentAliasIdOverride?: string,
    onFillerWord?: (filler: string) => void
): Promise<AgentResponse> {
    const targetAgentId = agentIdOverride || agentId;
    const targetAgentAliasId = agentAliasIdOverride || agentAliasId;

    if (!targetAgentId || !targetAgentAliasId) {
        throw new Error("AGENT_ID or AGENT_ALIAS_ID not set (and no override provided)");
    }

    const command = new InvokeAgentCommand({
        agentId: targetAgentId,
        agentAliasId: targetAgentAliasId,
        sessionId,
        inputText: userText,
        enableTrace: true
    });

    const response = await client.send(command);
    if (!response.completion) throw new Error("Agent completion undefined");

    const decoder = new TextDecoder("utf-8");
    let completion = "";

    const traces: any[] = [];

    for await (const event of response.completion) {
        if (event.chunk?.bytes) {
            completion += decoder.decode(event.chunk.bytes);
        } else if (event.trace) {
            traces.push(event.trace);

            // Heuristic Trigger for Filler Words
            // Type assertion used because AWS SDK types might be incomplete/strict regarding TracePart union
            if (onFillerWord) {
                const tracePart = event.trace as any;
                // Log top-level keys to confirm
                // console.log('[Bedrock Agent] Trace Part Keys:', Object.keys(tracePart));

                // Based on logs, the structure is event.trace.trace.orchestrationTrace
                const innerTrace = tracePart.trace;

                if (innerTrace && innerTrace.orchestrationTrace) {
                    const orchTrace = innerTrace.orchestrationTrace;
                    console.log('[Bedrock Agent] Orchestration Found:', Object.keys(orchTrace));

                    if (orchTrace.invocationInput) {
                        onFillerWord("hmmm..."); // Tool call start
                    } else if (orchTrace.observation) {
                        onFillerWord("uh-huh..."); // Tool call return
                    }
                }
            }
        } else if (event.accessDeniedException) {
            console.error("[Bedrock Agent] Access Denied:", event.accessDeniedException);
            throw new Error(`Access Denied: ${event.accessDeniedException.message}`);
        } else if (event.throttlingException) {
            console.error("[Bedrock Agent] Throttling:", event.throttlingException);
            throw new Error(`Throttling: ${event.throttlingException.message}`);
        } else if (event.validationException) {
            console.error("[Bedrock Agent] Validation Exception:", event.validationException);
            throw new Error(`Validation Exception: ${event.validationException.message}`);
        } else if (event.internalServerException) {
            console.error("[Bedrock Agent] Internal Server Error:", event.internalServerException);
            throw new Error(`Internal Server Error: ${event.internalServerException.message}`);
        } else {
            // Handle other potential events like returnControl (not implemented yet)
            console.warn("[Bedrock Agent] Received unhandled event:", Object.keys(event));
        }
    }

    return {
        completion: completion.trim(),
        trace: traces
    };
}
