
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1';

// Initialize Bedrock Runtime
const client = new BedrockRuntimeClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.NOVA_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
        sessionToken: process.env.NOVA_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN
    }
});

// Model ID for Simulation (Fast & Cheap)
const MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

export class SimulationService {

    constructor() { }

    async generateResponse(history: { role: string, content: string }[], persona: string): Promise<string> {
        try {
            console.log(`[Simulation] Generating response for persona: "${persona.substring(0, 50)}..."`);

            // Construct Prompt
            const systemPrompt = `You are playing the role of a user testing a voice assistant system.
Your goal is to interact with the AI agent naturally to verify if it handles your request correctly.

YOUR PERSONA:
${persona}

INSTRUCTIONS:
1. Stay strictly in character based on the persona above.
2. Respond naturally, as if speaking. Keep responses concise (1-3 sentences).
3. Do not be overly helpful, but answer questions if the agent asks them.
4. If the agent makes a mistake, point it out naturally.
5. Do NOT include any prefixes like "User:" or "Response:". Just output the spoken text.
`;

            // Format history for Claude 3 (user/assistant turns)
            // Note: Claude 3 requires alternating user/assistant starting with user.
            // Our history might start with assistant. We need to handle that.

            const messages: any[] = [];

            // If strictly needed, we can inject a "system start" user message or ensure order.
            // But here we are the "User" (the LLM is playing the User).
            // So the "Assistant" history messages are actually messages from the "User" (the Agent) in this context?
            // No, the "Agent" is the interlocutor. The LLM is the "User".
            // So Agent (Voice Assistant) = User Role in Claude's context?
            // To avoid confusion:
            // Real Agent -> "User" in Prompt (Input)
            // Simulated User -> "Assistant" in Prompt (Output) -> No, that's optimizing for completion.

            // Let's stick to standard Chat structure:
            // Role "user" = The entity prompting the model. That's US (the code).
            // But we want the Model to play the "User".
            // So the Agent's messages are "User" (Input to Model).
            // The Model's output is "Assistant" (Response from Model, which becomes User Input in real app).

            history.forEach(msg => {
                const role = msg.role === 'assistant' ? 'user' : 'assistant'; // Invert roles for the simulator
                // Only add if content exists
                if (msg.content) {
                    messages.push({
                        role: role,
                        content: msg.content
                    });
                }
            });

            // Ensure starts with user (Agent's message)
            if (messages.length === 0 || messages[0].role !== 'user') {
                // If history is empty or starts with us (Simulated User), we need a start.
                // Usually simulation starts after Agent says "Hello".
                // If simulator starts the convo, we instruct it to start.
                if (messages.length === 0) {
                    messages.unshift({ role: 'user', content: "(The agent is listening. Start the conversation.)" });
                }
            }

            // Combine consecutive messages of same role (Claude doesn't like repeats)
            const collapsedMessages = [];
            let lastRole = null;
            for (const msg of messages) {
                if (msg.role === lastRole) {
                    collapsedMessages[collapsedMessages.length - 1].content += "\n" + msg.content;
                } else {
                    collapsedMessages.push(msg);
                    lastRole = msg.role;
                }
            }

            const payload = {
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 300,
                system: systemPrompt,
                messages: collapsedMessages,
                temperature: 0.7
            };

            const command = new InvokeModelCommand({
                modelId: MODEL_ID,
                contentType: "application/json",
                accept: "application/json",
                body: JSON.stringify(payload)
            });

            const response = await client.send(command);
            const decoded = new TextDecoder().decode(response.body);
            const body = JSON.parse(decoded);

            const text = body.content[0]?.text || "";
            return text.trim();

        } catch (error) {
            console.error("[Simulation] Error generating response:", error);
            return "I'm not sure how to respond to that."; // Fallback
        }
    }
}
