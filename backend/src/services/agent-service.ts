
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { AgentCoreGatewayClient } from '../agentcore-gateway-client';
import { ClientSession } from '../types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// --- AWS Bedrock AgentCore Client ---
const REGION = process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1';

// Knowledge Base Storage
const KB_FILE = path.join(__dirname, '../../knowledge_bases.json');

export class AgentService {
    private agentCoreClient: BedrockAgentCoreClient;
    private bedrockAgentRuntimeClient: BedrockAgentRuntimeClient;
    private agentCoreGatewayClient: AgentCoreGatewayClient | null = null;

    constructor() {
        // Build credentials config for AgentCore client
        let agentCoreConfig: any = {
            region: REGION
        };

        // Add explicit credentials if NOVA_ prefixed env vars are set
        if (process.env.NOVA_AWS_ACCESS_KEY_ID && process.env.NOVA_AWS_SECRET_ACCESS_KEY) {
            agentCoreConfig.credentials = {
                accessKeyId: process.env.NOVA_AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
                ...(process.env.NOVA_AWS_SESSION_TOKEN && { sessionToken: process.env.NOVA_AWS_SESSION_TOKEN })
            };
        } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            agentCoreConfig.credentials = {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN })
            };
        }

        this.agentCoreClient = new BedrockAgentCoreClient(agentCoreConfig);
        this.bedrockAgentRuntimeClient = new BedrockAgentRuntimeClient(agentCoreConfig);

        try {
            this.agentCoreGatewayClient = new AgentCoreGatewayClient();
            console.log('[AgentService] AgentCore Gateway Client initialized successfully');
        } catch (error) {
            console.warn('[AgentService] AgentCore Gateway Client initialization failed:', error);
        }
    }

    /**
     * Helper to call AWS AgentCore Runtime
     * NOW SUPPORTS: Multi-Turn Loop (The "Orchestrator" Pattern)
     */
    async callAgentCore(session: ClientSession, qualifier: string, initialPayload: any) {
        try {
            console.log(`[AgentService] Invoking agent for session ${session.sessionId} with qualifier: '${qualifier}'`);
            const cleanQualifier = qualifier.trim();

            // Use session-specific Agent Core Runtime ARN if available, otherwise fall back to environment variable
            let runtimeArn = session.sonicClient?.config?.agentCoreRuntimeArn || process.env.AGENT_CORE_RUNTIME_ARN;
            if (!runtimeArn) return { status: "error", message: "Missing AGENT_CORE_RUNTIME_ARN" };
            if (runtimeArn && runtimeArn.includes('/runtime-endpoint/')) runtimeArn = runtimeArn.split('/runtime-endpoint/')[0];

            // --- MORTGAGE TOOL HANDLERS (MOCK) ---
            if (cleanQualifier === 'check_credit_score') {
                console.log(`[Tool] Executing check_credit_score with payload:`, initialPayload);
                // Deterministic mock based on name length to allow testing both paths
                const params = typeof initialPayload === 'string' ? JSON.parse(initialPayload) : initialPayload;
                const name = params.name || "Unknown";
                // If name has "Fail", give low score
                let score = 750;
                if (name.toLowerCase().includes('fail') || name.toLowerCase().includes('reject')) {
                    score = 450;
                } else {
                    score = 800 + Math.floor(Math.random() * 100);
                }
                return {
                    status: "success",
                    data: JSON.stringify({
                        score: score,
                        rating: score > 700 ? "Excellent" : "Poor",
                        status: score > 600 ? "PASS" : "FAIL"
                    })
                };
            }

            if (cleanQualifier === 'value_property') {
                console.log(`[Tool] Executing value_property with payload:`, initialPayload);
                const params = typeof initialPayload === 'string' ? JSON.parse(initialPayload) : initialPayload;
                const estimated = Number(params.estimated_value) || 300000;
                // Valuate at +/- 5% of estimate
                const variance = 0.95 + (Math.random() * 0.1);
                const valuation = Math.round(estimated * variance);
                return {
                    status: "success",
                    data: JSON.stringify({
                        valuation: valuation,
                        confidence: "High",
                        source: "Hometrack Mock"
                    })
                };
            }

            if (cleanQualifier === 'search_knowledge_base') {
                console.log(`[Tool] Executing search_knowledge_base with payload:`, initialPayload);
                const params = typeof initialPayload === 'string' ? JSON.parse(initialPayload) : initialPayload;
                const query = params.query;

                let kbId = "KCDO7ZUFA1"; // Default from task
                let modelArn = "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0";

                try {
                    if (fs.existsSync(KB_FILE)) {
                        const kbs = JSON.parse(fs.readFileSync(KB_FILE, 'utf-8'));
                        if (kbs.length > 0) {
                            kbId = kbs[0].id; // Use the first one
                            if (kbs[0].modelArn) modelArn = kbs[0].modelArn;
                        }
                    }
                } catch (e) {
                    console.warn("[Tool] Failed to load KB config, using default", e);
                }

                try {
                    const command = new RetrieveAndGenerateCommand({
                        input: { text: query },
                        retrieveAndGenerateConfiguration: {
                            type: 'KNOWLEDGE_BASE',
                            knowledgeBaseConfiguration: {
                                knowledgeBaseId: kbId,
                                modelArn: modelArn
                            }
                        }
                    });

                    const response = await this.bedrockAgentRuntimeClient.send(command);
                    console.log("[Tool] Knowledge Base Response Metadata:", JSON.stringify(response.citations || "No citations", null, 2));

                    const resultText = response.output?.text || "No information found in the knowledge base.";

                    return {
                        status: "success",
                        data: resultText
                    };
                } catch (error: any) {
                    console.error("[Tool] Knowledge Base search failed:", error);
                    return {
                        status: "error",
                        data: `Failed to search knowledge base: ${error.message}`
                    };
                }
            }

            if (cleanQualifier === 'calculate_max_loan') {
                console.log(`[Tool] Executing calculate_max_loan with payload:`, initialPayload);
                const params = typeof initialPayload === 'string' ? JSON.parse(initialPayload) : initialPayload;
                const income = Number(params.total_annual_income) || 0;
                const multiplier = 4.5;
                const maxLoan = income * multiplier;
                return {
                    status: "success",
                    data: JSON.stringify({
                        max_loan_amount: maxLoan,
                        multiplier_used: multiplier,
                        risk_factor: "Standard"
                    })
                };
            }

            if (cleanQualifier === 'get_mortgage_rates') {
                console.log(`[Tool] Executing get_mortgage_rates with payload:`, initialPayload);
                return {
                    status: "success",
                    data: JSON.stringify({
                        products: [
                            { name: "2 Year Fixed", rate: "4.5%", fee: "£999", monthly_payment: "Calculated at application" },
                            { name: "5 Year Fixed", rate: "4.1%", fee: "£0", monthly_payment: "Calculated at application" },
                            { name: "Tracker", rate: "Base + 0.5%", fee: "£499" }
                        ]
                    })
                };
            }
            // --------------------------------------

            // Session ID Logic
            let rSessionId = session.sessionId;
            if (!rSessionId || rSessionId.length < 33) rSessionId = crypto.randomUUID();

            // ORCHESTRATOR LOOP
            let currentPrompt = initialPayload.prompt || JSON.stringify(initialPayload);
            let finalResult = "";

            // Loop limit to prevent infinite recursion
            for (let turn = 1; turn <= 5; turn++) {

                console.log(`[AgentService] --- Turn ${turn} ---`);

                const payloadObj = { prompt: currentPrompt };

                const command = new InvokeAgentRuntimeCommand({
                    agentRuntimeArn: runtimeArn,
                    qualifier: 'DEFAULT',
                    mcpSessionId: rSessionId,
                    runtimeSessionId: rSessionId,
                    contentType: "application/json",
                    accept: "application/json",
                    payload: Buffer.from(JSON.stringify(payloadObj))
                });

                const response = await this.agentCoreClient.send(command);
                const textResponse = await response.response?.transformToString();

                // Parse response (AgentCore returns JSON wrapper)
                let agentText = "";
                try {
                    if (textResponse) {
                        const parsed = JSON.parse(textResponse);
                        // Try multiple fields
                        agentText = parsed.text ||
                            parsed?.result?.content?.[0]?.text ||
                            parsed?.output?.message?.content?.[0]?.text ||
                            "";
                    }
                } catch (e) {
                    agentText = textResponse || ""; // Fallback to raw
                }

                if (!agentText) {
                    console.log("[AgentService] Empty response from agent.");
                    break;
                }

                console.log(`[AgentService] Output: ${agentText.substring(0, 100)}...`);

                // CHECK FOR TAGS (<search>) - use 's' flag to match newlines
                const searchMatch = agentText.match(/<search>(.*?)<\/search>/s);

                // BANKING TOOL FIX: Skip orchestrator loop for banking tools
                const isBankingTool = ['agentcore_balance', 'agentcore_transactions', 'perform_idv_check',
                    'create_dispute_case', 'lookup_merchant_alias', 'manage_recent_interactions',
                    'update_dispute_case'].includes(qualifier);

                if (searchMatch && !isBankingTool) {
                    const query = searchMatch[1];

                    // Execute actual tool logic based on query
                    let toolResult = "";
                    if (query.toLowerCase().includes('time') || query.toLowerCase().includes('current')) {
                        const now = new Date();
                        const timeString = now.toLocaleString('en-GB', {
                            timeZone: 'Europe/London',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                        toolResult = `The current time in London, UK is: ${timeString}`;
                    } else {
                        toolResult = `Information retrieved for: ${query}`;
                    }

                    // Update Prompt for Next Turn (Re-Inject History)
                    currentPrompt = `
                        [PREVIOUS HISTORY]
                        Assistant: ${agentText}
                        
                        [SYSTEM TOOL OUTPUT]
                        The tool returned: "${toolResult}"
                        
                        [INSTRUCTION]
                        Using the tool output above, provide the final answer to the user.
                    `;
                } else {
                    // No tool called -> This is the final answer
                    finalResult = agentText;
                    break;
                }
            }

            return {
                status: "success",
                data: finalResult
            };

        } catch (e: any) {
            console.error('[AgentService] Invocation failed:', e);
            return {
                status: "error",
                message: e.message
            };
        }
    }
}
