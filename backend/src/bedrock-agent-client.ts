import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import * as dotenv from 'dotenv';

dotenv.config();

const client = new BedrockAgentRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

const agentId = process.env.AGENT_ID!;
const agentAliasId = process.env.AGENT_ALIAS_ID!;

export interface AgentResponse {
    completion: string;
    trace: any[];
}

export async function callBankAgent(
    userText: string,
    sessionId: string
): Promise<AgentResponse> {
    if (!agentId || !agentAliasId) {
        throw new Error("AGENT_ID or AGENT_ALIAS_ID not set in environment variables");
    }

    const command = new InvokeAgentCommand({
        agentId,
        agentAliasId,
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
        }
        if (event.trace) {
            traces.push(event.trace);
        }
    }

    return {
        completion: completion.trim(),
        trace: traces
    };
}
