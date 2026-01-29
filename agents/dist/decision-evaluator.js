"use strict";
/**
 * Decision Evaluator
 *
 * Uses LLM to evaluate decision node conditions and determine the correct path.
 * This enables automatic workflow navigation based on context and conversation state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionEvaluator = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
class DecisionEvaluator {
    constructor(region = 'us-east-1', modelId = 'anthropic.claude-3-5-sonnet-20241022-v2:0') {
        this.bedrockClient = new client_bedrock_runtime_1.BedrockRuntimeClient({ region });
        this.modelId = modelId;
    }
    /**
     * Evaluate a decision node and determine which path to take
     *
     * @param node The decision node to evaluate
     * @param edges The possible outgoing edges from this node
     * @param state The current graph state (context, messages, etc.)
     * @returns The chosen path and reasoning
     */
    async evaluateDecision(node, edges, state) {
        try {
            // Build the decision prompt
            const prompt = this.buildDecisionPrompt(node, edges, state);
            console.log(`[DecisionEvaluator] Evaluating decision: ${node.id}`);
            console.log(`[DecisionEvaluator] Available paths: ${edges.map(e => e.label || e.to).join(', ')}`);
            // Call LLM
            const response = await this.callLLM(prompt);
            // Parse response
            const result = this.parseDecisionResponse(response, edges);
            console.log(`[DecisionEvaluator] ✅ Decision made: ${result.chosenPath}`);
            console.log(`[DecisionEvaluator]    Confidence: ${result.confidence}`);
            console.log(`[DecisionEvaluator]    Reasoning: ${result.reasoning}`);
            return result;
        }
        catch (error) {
            console.error(`[DecisionEvaluator] ❌ Error evaluating decision:`, error);
            // Fallback to first path
            const fallbackPath = edges[0]?.label || edges[0]?.to || 'default';
            return {
                success: false,
                chosenPath: fallbackPath,
                confidence: 0,
                reasoning: 'Error occurred, using fallback path',
                error: error.message
            };
        }
    }
    /**
     * Build the prompt for decision evaluation
     */
    buildDecisionPrompt(node, edges, state) {
        let prompt = `You are a workflow decision evaluator. Your job is to analyze the current state and determine which path to take.

DECISION NODE: ${node.id}
INSTRUCTION: ${node.label}

AVAILABLE PATHS:
`;
        edges.forEach((edge, index) => {
            prompt += `${index + 1}. "${edge.label || edge.to}" → goes to ${edge.to}\n`;
        });
        prompt += `\nCURRENT CONTEXT:\n`;
        // Add context variables
        if (state.context && Object.keys(state.context).length > 0) {
            prompt += `Variables:\n`;
            Object.entries(state.context).forEach(([key, value]) => {
                prompt += `  - ${key}: ${JSON.stringify(value)}\n`;
            });
        }
        else {
            prompt += `  (No context variables set)\n`;
        }
        // Add recent messages
        if (state.messages && state.messages.length > 0) {
            prompt += `\nRECENT CONVERSATION:\n`;
            const recentMessages = state.messages.slice(-5); // Last 5 messages
            recentMessages.forEach(msg => {
                const role = msg._getType?.() || 'unknown';
                const content = msg.content || '';
                prompt += `  ${role}: ${content}\n`;
            });
        }
        prompt += `\nTASK:
1. Analyze the instruction: "${node.label}"
2. Review the available paths
3. Based on the context and conversation, determine which path to take
4. Respond with ONLY the exact path label (e.g., "Yes (>5)" or "No (<=5)")

IMPORTANT: Your response must be EXACTLY one of the path labels listed above. Do not add any explanation or additional text.

YOUR DECISION:`;
        return prompt;
    }
    /**
     * Call the LLM to evaluate the decision
     */
    async callLLM(prompt) {
        const command = new client_bedrock_runtime_1.ConverseCommand({
            modelId: this.modelId,
            messages: [
                {
                    role: 'user',
                    content: [{ text: prompt }]
                }
            ],
            inferenceConfig: {
                maxTokens: 100,
                temperature: 0.1, // Low temperature for consistent decisions
                topP: 0.9
            }
        });
        const response = await this.bedrockClient.send(command);
        // Extract text from response
        const outputMessage = response.output?.message;
        if (!outputMessage || !outputMessage.content || outputMessage.content.length === 0) {
            throw new Error('No response from LLM');
        }
        const textContent = outputMessage.content.find(c => 'text' in c);
        if (!textContent || !('text' in textContent) || !textContent.text) {
            throw new Error('No text content in LLM response');
        }
        return textContent.text.trim();
    }
    /**
     * Parse the LLM response and match it to an edge
     */
    parseDecisionResponse(response, edges) {
        // Clean up response
        const cleanResponse = response.trim().replace(/^["']|["']$/g, '');
        console.log(`[DecisionEvaluator] Raw LLM response: "${cleanResponse}"`);
        // Try exact match first
        let matchedEdge = edges.find(e => e.label?.toLowerCase() === cleanResponse.toLowerCase());
        // Try partial match
        if (!matchedEdge) {
            matchedEdge = edges.find(e => e.label && cleanResponse.toLowerCase().includes(e.label.toLowerCase()));
        }
        // Try reverse partial match
        if (!matchedEdge) {
            matchedEdge = edges.find(e => e.label && e.label.toLowerCase().includes(cleanResponse.toLowerCase()));
        }
        // Fallback to first edge
        if (!matchedEdge) {
            console.warn(`[DecisionEvaluator] ⚠️  Could not match response "${cleanResponse}" to any edge, using first edge`);
            matchedEdge = edges[0];
        }
        return {
            success: true,
            chosenPath: matchedEdge.label || matchedEdge.to,
            confidence: matchedEdge === edges[0] && !matchedEdge.label ? 0.5 : 0.9,
            reasoning: `LLM chose: "${cleanResponse}"`
        };
    }
    /**
     * Update credentials (for dynamic AWS config)
     */
    updateCredentials(accessKeyId, secretAccessKey, region) {
        this.bedrockClient = new client_bedrock_runtime_1.BedrockRuntimeClient({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });
    }
}
exports.DecisionEvaluator = DecisionEvaluator;
