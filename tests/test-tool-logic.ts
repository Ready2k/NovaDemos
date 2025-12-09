import * as crypto from 'crypto';
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: 'backend/.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust this path if your folder structure is different!
const TOOLS_DIR = path.join(__dirname, '../tools');

// --- HELPER: MOCK SEARCH ---
function performMockSearch(query: string): string {
    console.log(`\n[System] ⚙️  ACTION: Executing Mock Search for: "${query}"`);
    const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
    return `The current time in London, UK is: ${now}`;
}

async function runTest() {
    console.log('------------------------------------------------');
    console.log('[Test] 1. Loading Tool Configuration...');

    // 1. Explicitly check if file exists
    const toolPath = path.join(TOOLS_DIR, 'time_tool.json');
    if (!fs.existsSync(toolPath)) {
        console.error(`[FATAL] Could not find file at: ${toolPath}`);
        return;
    }

    const toolContent = fs.readFileSync(toolPath, 'utf-8');
    const toolDef = JSON.parse(toolContent);

    // 2. Validate content
    if (!toolDef.agentPrompt) {
        console.error(`[FATAL] 'agentPrompt' is missing in time_tool.json`);
        return;
    }

    console.log(`[Test] ✅ Tool Loaded: "${toolDef.name}"`);
    console.log(`[Test] 📝 Injected Prompt (First 50 chars): "${toolDef.agentPrompt.substring(0, 50)}..."`);

    // 3. Prepare Client
    const client = new BedrockAgentCoreClient({ region: process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1' });
    const sessionId = crypto.randomUUID();
    let RUNTIME_ARN = process.env.AGENT_CORE_RUNTIME_ARN || "";
    if (RUNTIME_ARN.includes('/runtime-endpoint/')) {
        RUNTIME_ARN = RUNTIME_ARN.split('/runtime-endpoint/')[0];
    }

    // --- MAIN LOOP ---
    // We maintain our own "History" string because we are manually driving the agent
    let currentPrompt = toolDef.agentPrompt;

    for (let turn = 1; turn <= 3; turn++) {
        console.log(`\n[Test] --- Turn ${turn} ---`);

        // 4. Construct Payload
        // NOTE: If using standard Bedrock Agent Runtime, the key is usually 'inputText'.
        // If using AgentCore custom wrapper, it might be 'prompt'. 
        // We will try the 'prompt' format you used initially as it seemed to trigger the model best.
        const payloadObj = {
            prompt: currentPrompt
        };

        const input = {
            agentRuntimeArn: RUNTIME_ARN,
            qualifier: 'DEFAULT',
            runtimeSessionId: sessionId,
            payload: new TextEncoder().encode(JSON.stringify(payloadObj)),
            contentType: "application/json",
            accept: "application/json"
        };

        try {
            const command = new InvokeAgentRuntimeCommand(input);
            const response = await client.send(command);

            if (response.response) {
                const textResponse = await response.response.transformToString();

                // Debug raw output to solve the "Blank Response" mystery
                // console.log("[DEBUG] Raw:", textResponse); 

                const parsed = JSON.parse(textResponse);

                // Extract text (checking multiple common locations)
                const agentText = parsed.text ||
                    parsed?.result?.content?.[0]?.text ||
                    parsed?.output?.message?.content?.[0]?.text ||
                    "";

                if (!agentText) {
                    console.log("[Error] Agent returned empty text. Dumping raw response:");
                    console.log(textResponse);
                    break;
                }

                console.log(`[Agent]: ${agentText}`);

                // 5. CHECK FOR TAGS
                const searchMatch = agentText.match(/<search>(.*?)<\/search>/);

                if (searchMatch) {
                    const query = searchMatch[1];
                    const searchResult = performMockSearch(query);

                    // CRITICAL: We update the prompt for the next turn!
                    // We feed the previous answer + the tool result back into the prompt
                    currentPrompt = `
                        [PREVIOUS HISTORY]
                        Assistant: ${agentText}
                        
                        [SYSTEM TOOL OUTPUT]
                        The tool returned: "${searchResult}"
                        
                        [INSTRUCTION]
                        Using the tool output above, provide the final answer to the user.
                    `;
                } else {
                    console.log("\n[SUCCESS] Final Answer Received!");
                    break;
                }
            }
        } catch (e) {
            console.error('[Test] Exception:', e);
            break;
        }
    }
}

runTest();