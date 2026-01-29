"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentCoreGatewayClient = void 0;
const aws4 = require('aws4');
class AgentCoreGatewayClient {
    constructor() {
        this.config = {
            gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
            awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
            awsAccessKey: process.env.NOVA_AWS_ACCESS_KEY_ID || '',
            awsSecretKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY || ''
        };
        if (!this.config.awsAccessKey || !this.config.awsSecretKey) {
            console.warn('[AgentCoreGateway] WARNING: Missing AWS Credentials. Client is unconfigured.');
        }
        else {
            console.log('[AgentCoreGateway] Client initialized with environment credentials.');
        }
    }
    updateCredentials(accessKey, secretKey, region) {
        this.config.awsAccessKey = accessKey;
        this.config.awsSecretKey = secretKey;
        this.config.awsRegion = region;
        console.log('[AgentCoreGateway] Credentials updated via runtime configuration.');
    }
    async callTool(toolName, args, gatewayTarget) {
        if (!this.config.awsAccessKey || !this.config.awsSecretKey) {
            console.warn('[AgentCoreGateway] Call aborted: Missing AWS Credentials.');
            throw new Error('AWS Credentials not configured. Please configure them in the Settings UI.');
        }
        console.log(`[AgentCoreGateway] Calling tool: ${toolName} with args:`, args);
        let actualToolName = gatewayTarget;
        if (!actualToolName) {
            // Fallback: Map our tool names to AgentCore Gateway tool names (Legacy Support)
            const toolMapping = {
                'agentcore_balance': 'get-Balance___get_Balance',
                'get_account_transactions': 'get-TransactionalHistory___get_TransactionHistory',
                'agentcore_transactions': 'get-TransactionalHistory___get_TransactionHistory',
                'get_server_time': 'get-Time___get_current_time',
                'perform_idv_check': 'perform-idv-check___perform_idv_check',
                'lookup_merchant_alias': 'lookup-merchant-alias___lookup_merchant_alias',
                'create_dispute_case': 'create-dispute-case___create_dispute_case',
                'update_dispute_case': 'Update-Dispute-case___update_dispute_case',
                'manage_recent_interactions': 'manage-recent-interactions___manage_recent_interactions'
            };
            actualToolName = toolMapping[toolName] || toolName;
            console.log(`[AgentCoreGateway] Using legacy mapping for tool name: ${actualToolName}`);
        }
        else {
            console.log(`[AgentCoreGateway] Using provided gateway target: ${actualToolName}`);
        }
        // Create JSON-RPC 2.0 payload
        const payload = {
            jsonrpc: "2.0",
            id: `tool-call-${Date.now()}`,
            method: "tools/call",
            params: {
                name: actualToolName,
                arguments: args
            }
        };
        try {
            const url = new URL(this.config.gatewayUrl);
            const body = JSON.stringify(payload);
            // Create AWS request object for signing
            const request = {
                host: url.hostname,
                method: 'POST',
                path: url.pathname,
                service: 'bedrock-agentcore',
                region: this.config.awsRegion,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: body
            };
            // Sign the request with AWS credentials
            const signedRequest = aws4.sign(request, {
                accessKeyId: this.config.awsAccessKey,
                secretAccessKey: this.config.awsSecretKey
            });
            console.log(`[AgentCoreGateway] Making signed request to gateway...`);
            // Make the signed request using fetch
            const response = await fetch(this.config.gatewayUrl, {
                method: 'POST',
                headers: signedRequest.headers,
                body: body
            });
            console.log(`[AgentCoreGateway] Response status: ${response.status}`);
            if (!response.ok) {
                const text = await response.text();
                console.error(`[AgentCoreGateway] Request failed: ${text}`);
                throw new Error(`Gateway Request Failed (${response.status}): ${text}`);
            }
            const data = await response.json();
            console.log(`[AgentCoreGateway] Raw response:`, JSON.stringify(data, null, 2));
            // Check for JSON-RPC errors
            if (data.error) {
                console.error(`[AgentCoreGateway] Tool execution error:`, data.error);
                throw new Error(`Tool Execution Error: ${data.error.message}`);
            }
            // Handle new AgentCore response format with body.responseBody
            if (data.body && data.body.responseBody) {
                console.log(`[AgentCoreGateway] Found responseBody:`, data.body.responseBody);
                const responseBodyStr = data.body.responseBody;
                console.log(`[AgentCoreGateway] Raw responseBody string:`, responseBodyStr);
                // Special handling for transaction data (which comes as concatenated JSON objects)
                if (toolName === 'get_account_transactions' || actualToolName.includes('TransactionHistory')) {
                    console.log(`[AgentCoreGateway] Processing transaction data...`);
                    // Look for multiple JSON objects in the response
                    const jsonObjectRegex = /\{[^{}]*\}/g;
                    const matches = responseBodyStr.match(jsonObjectRegex);
                    if (matches && matches.length > 0) {
                        console.log(`[AgentCoreGateway] Found ${matches.length} JSON objects in transaction response`);
                        try {
                            const transactions = matches.map((match) => JSON.parse(match));
                            console.log(`[AgentCoreGateway] Parsed transactions:`, transactions);
                            // Format transactions for display
                            if (transactions.length > 0) {
                                const formattedTransactions = transactions.map((t, i) => {
                                    const amount = t.amount || t.transactionAmount || '0.00';
                                    const description = t.description || t.merchant || t.merchantName || 'Transaction';
                                    const date = t.date || t.transactionDate || 'Unknown date';
                                    return `${i + 1}. ${description}: £${amount} on ${date}`;
                                }).join('\n');
                                return `Here are your recent transactions:\n${formattedTransactions}`;
                            }
                        }
                        catch (parseError) {
                            console.error(`[AgentCoreGateway] Failed to parse transaction JSON objects:`, parseError);
                        }
                    }
                }
                // Look for the JSON content in the text field using regex (for other tools)
                const textMatch = responseBodyStr.match(/text=\{([^}]+)\}/);
                if (textMatch) {
                    try {
                        // Extract and parse the JSON content
                        const jsonStr = '{' + textMatch[1] + '}';
                        console.log(`[AgentCoreGateway] Extracted JSON:`, jsonStr);
                        const innerResponse = JSON.parse(jsonStr);
                        console.log(`[AgentCoreGateway] Parsed inner response:`, innerResponse);
                        // Handle new format: direct data object
                        if (innerResponse.accountId || innerResponse.message || innerResponse.transactions) {
                            console.log(`[AgentCoreGateway] Tool result (new format):`, innerResponse);
                            if (innerResponse.message) {
                                return innerResponse.message;
                            }
                            else if (innerResponse.accountId && innerResponse.balance !== undefined) {
                                return `The balance for account ${innerResponse.accountId} is £${innerResponse.balance}.`;
                            }
                            else {
                                return JSON.stringify(innerResponse);
                            }
                        }
                        return JSON.stringify(innerResponse);
                    }
                    catch (parseError) {
                        console.error(`[AgentCoreGateway] Failed to parse extracted JSON:`, parseError);
                    }
                }
                // Fallback: return the raw responseBody
                console.log(`[AgentCoreGateway] Using raw responseBody as fallback:`, responseBodyStr);
                return responseBodyStr;
            }
            // Extract the result from the MCP response (fallback for old format)
            const result = data.result;
            if (result && result.content && result.content.length > 0) {
                // Try to parse the inner response
                const innerText = result.content[0].text;
                try {
                    const innerResponse = JSON.parse(innerText);
                    // Handle new format: direct data object
                    if (innerResponse.accountId || innerResponse.message || innerResponse.transactions) {
                        console.log(`[AgentCoreGateway] Tool result (new format):`, innerResponse);
                        // For balance queries, return the message if available, otherwise format the data
                        if (innerResponse.message) {
                            return innerResponse.message;
                        }
                        else if (innerResponse.accountId && innerResponse.balance !== undefined) {
                            return `The balance for account ${innerResponse.accountId} is £${innerResponse.balance}.`;
                        }
                        else {
                            return JSON.stringify(innerResponse);
                        }
                    }
                    // Handle old format: with body field
                    if (innerResponse.body) {
                        console.log(`[AgentCoreGateway] Tool result (old format): ${innerResponse.body}`);
                        return innerResponse.body;
                    }
                    // If it's a valid JSON but doesn't match expected formats, return as string
                    console.log(`[AgentCoreGateway] Tool result (unknown JSON format):`, innerResponse);
                    return JSON.stringify(innerResponse);
                }
                catch (e) {
                    // If not JSON, return as-is
                    console.log(`[AgentCoreGateway] Tool result (raw): ${innerText}`);
                    return innerText;
                }
            }
            throw new Error('No valid result found in gateway response');
        }
        catch (error) {
            console.error(`[AgentCoreGateway] Error calling tool ${toolName}:`, error);
            throw new Error(`AgentCore Gateway error: ${error.message}`);
        }
    }
    async listTools() {
        if (!this.config.awsAccessKey || !this.config.awsSecretKey) {
            console.warn('[AgentCoreGateway] List tools aborted: Missing AWS Credentials.');
            return []; // Return empty list instead of throwing to prevent startup crashes
        }
        const payload = {
            jsonrpc: "2.0",
            id: `list-tools-${Date.now()}`,
            method: "tools/list",
            params: {}
        };
        try {
            const url = new URL(this.config.gatewayUrl);
            const body = JSON.stringify(payload);
            const request = {
                host: url.hostname,
                method: 'POST',
                path: url.pathname,
                service: 'bedrock-agentcore',
                region: this.config.awsRegion,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: body
            };
            const signedRequest = aws4.sign(request, {
                accessKeyId: this.config.awsAccessKey,
                secretAccessKey: this.config.awsSecretKey
            });
            const response = await fetch(this.config.gatewayUrl, {
                method: 'POST',
                headers: signedRequest.headers,
                body: body
            });
            if (!response.ok) {
                throw new Error(`Failed to list tools: ${response.status}`);
            }
            const data = await response.json();
            return data.result?.tools || [];
        }
        catch (error) {
            console.error(`[AgentCoreGateway] Error listing tools:`, error);
            return [];
        }
    }
}
exports.AgentCoreGatewayClient = AgentCoreGatewayClient;
