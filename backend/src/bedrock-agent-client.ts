import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import * as dotenv from 'dotenv';

dotenv.config();

// Global client removed in favor of per-request client with dynamic credentials

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
    credentials?: {
        accessKeyId?: string;
        secretAccessKey?: string;
        sessionToken?: string;
        region?: string;
    }
): Promise<AgentResponse> {
    const targetAgentId = agentIdOverride || agentId;
    const targetAgentAliasId = agentAliasIdOverride || agentAliasId;

    if (!targetAgentId || !targetAgentAliasId) {
        throw new Error("AGENT_ID or AGENT_ALIAS_ID not set (and no override provided)");
    }

    // Build Client Config Dynamically
    const clientConfig: any = {
        region: credentials?.region || process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1',
    };

    if (credentials?.accessKeyId && credentials?.secretAccessKey) {
        clientConfig.credentials = {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {})
        };
    } else if (process.env.NOVA_AWS_ACCESS_KEY_ID && process.env.NOVA_AWS_SECRET_ACCESS_KEY) {
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

    // Initialize client for this request
    const client = new BedrockAgentRuntimeClient(clientConfig);

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

            // Filler word handling removed - Nova 2 Sonic handles filler natively
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
