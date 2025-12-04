import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });

const region = process.env.AWS_REGION!;
const agentId = process.env.AGENT_ID!;
const agentAliasId = process.env.AGENT_ALIAS_ID!;

const client = new BedrockAgentRuntimeClient({ region });

async function invokeAgent(prompt: string, sessionId: string) {
  const command = new InvokeAgentCommand({
    agentId,
    agentAliasId,
    sessionId,
    inputText: prompt,
  });

  const response = await client.send(command);

  if (!response.completion) {
    throw new Error("Completion is undefined");
  }

  let completion = "";
  const decoder = new TextDecoder("utf-8");

  for await (const event of response.completion) {
    // Each event has a "chunk" with bytes – we just accumulate text
    const chunk = event.chunk;
    if (!chunk?.bytes) continue;
    completion += decoder.decode(chunk.bytes);
  }

  return completion;
}

(async () => {
  const sessionId = "test-session-001";
  const result = await invokeAgent(
    "Hi, I'm testing the genericBankDemo agent. What can you help with?",
    sessionId
  );
  console.log("Agent reply:\n", result);
})();
