const aws4 = require('aws4');

interface AgentCoreGatewayConfig {
    gatewayUrl: string;
    awsRegion: string;
    awsAccessKey: string;
    awsSecretKey: string;
}



interface ToolCallResponse {
    isError: boolean;
    content: Array<{
        type: string;
        text: string;
    }>;
}

export class AgentCoreGatewayClient {
    private config: AgentCoreGatewayConfig;

    constructor() {
        this.config = {
            gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
            awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
            awsAccessKey: process.env.NOVA_AWS_ACCESS_KEY_ID!,
            awsSecretKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY!
        };

        if (!this.config.awsAccessKey || !this.config.awsSecretKey) {
            throw new Error('AgentCore Gateway requires NOVA_AWS_ACCESS_KEY_ID and NOVA_AWS_SECRET_ACCESS_KEY');
        }
    }

    async callTool(toolName: string, args: any): Promise<string> {
        console.log(`[AgentCoreGateway] Calling tool: ${toolName} with args:`, args);

        // Map our tool names to AgentCore Gateway tool names
        const toolMapping: { [key: string]: string } = {
            'agentcore_balance': 'get-Balance___get_Balance',
            'get_account_transactions': 'get-TransactionalHistory___get_TransactionHistory',
            'agentcore_transactions': 'get-TransactionalHistory___get_TransactionHistory',
            'get_server_time': 'get-Time___get_current_time'
        };

        const actualToolName = toolMapping[toolName] || toolName;
        console.log(`[AgentCoreGateway] Mapped tool name: ${actualToolName}`);

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

            const data: any = await response.json();
            console.log(`[AgentCoreGateway] Raw response:`, JSON.stringify(data, null, 2));

            // Check for JSON-RPC errors
            if (data.error) {
                console.error(`[AgentCoreGateway] Tool execution error:`, data.error);
                throw new Error(`Tool Execution Error: ${data.error.message}`);
            }

            // Handle new AgentCore response format with body.responseBody
            if (data.body && data.body.responseBody) {
                console.log(`[AgentCoreGateway] Found responseBody:`, data.body.responseBody);

                // The responseBody contains a string with Java object notation
                // Extract the JSON part from the text field
                const responseBodyStr = data.body.responseBody;
                console.log(`[AgentCoreGateway] Raw responseBody string:`, responseBodyStr);

                // Look for the JSON content in the text field using regex
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
                            } else if (innerResponse.accountId && innerResponse.balance !== undefined) {
                                return `The balance for account ${innerResponse.accountId} is ${innerResponse.currency || '$'}${innerResponse.balance}.`;
                            } else {
                                return JSON.stringify(innerResponse);
                            }
                        }

                        return JSON.stringify(innerResponse);
                    } catch (parseError) {
                        console.error(`[AgentCoreGateway] Failed to parse extracted JSON:`, parseError);
                    }
                }

                // Fallback: return the raw responseBody
                console.log(`[AgentCoreGateway] Using raw responseBody as fallback:`, responseBodyStr);
                return responseBodyStr;
            }

            // Extract the result from the MCP response (fallback for old format)
            const result = data.result as ToolCallResponse;

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
                        } else if (innerResponse.accountId && innerResponse.balance !== undefined) {
                            return `The balance for account ${innerResponse.accountId} is ${innerResponse.currency || '$'}${innerResponse.balance}.`;
                        } else {
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

                } catch (e) {
                    // If not JSON, return as-is
                    console.log(`[AgentCoreGateway] Tool result (raw): ${innerText}`);
                    return innerText;
                }
            }

            throw new Error('No valid result found in gateway response');

        } catch (error: any) {
            console.error(`[AgentCoreGateway] Error calling tool ${toolName}:`, error);
            throw new Error(`AgentCore Gateway error: ${error.message}`);
        }
    }

    async listTools(): Promise<any[]> {
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

            const data: any = await response.json();
            return data.result?.tools || [];

        } catch (error: any) {
            console.error(`[AgentCoreGateway] Error listing tools:`, error);
            return [];
        }
    }
}