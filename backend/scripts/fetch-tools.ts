
import * as fs from 'fs';
import * as path from 'path';
import { AgentCoreGatewayClient } from '../src/agentcore-gateway-client';
import dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
    const gateway = new AgentCoreGatewayClient();
    console.log('Fetching tools from AgentCore Gateway...');

    try {
        const tools = await gateway.listTools();
        console.log(`Found ${tools.length} tools.`);

        const toolsDir = path.join(__dirname, '../../tools');
        if (!fs.existsSync(toolsDir)) {
            fs.mkdirSync(toolsDir, { recursive: true });
        }

        for (const tool of tools) {
            // Transform to our local JSON format
            // The gateway returns tools in Bedrock format usually, or generic JSON-RPC format
            console.log(`Processing tool: ${tool.name}`);

            // Map legacy names to friendly names if needed
            // But for now, let's just save them as is or use the mapping from the client
            const friendlyName = mapToFriendlyName(tool.name);

            const toolDef = {
                name: friendlyName,
                originalName: tool.name, // Keep track of gateway target
                description: tool.description,
                inputSchema: tool.inputSchema?.json ? JSON.parse(tool.inputSchema.json) : tool.inputSchema,
                gatewayTarget: tool.name // Critical for execution
            };

            const filePath = path.join(toolsDir, `${friendlyName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(toolDef, null, 2));
            console.log(`Saved ${friendlyName}.json`);
        }

    } catch (e) {
        console.error('Failed to fetch tools', e);
    }
}

function mapToFriendlyName(gatewayName: string): string {
    const reverseMapping: { [key: string]: string } = {
        'get-Balance___get_Balance': 'agentcore_balance',
        'get-TransactionalHistory___get_TransactionHistory': 'get_account_transactions',
        'get-Time___get_current_time': 'get_server_time',
        'perform-idv-check___perform_idv_check': 'perform_idv_check',
        'lookup-merchant-alias___lookup_merchant_alias': 'lookup_merchant_alias',
        'create-dispute-case___create_dispute_case': 'create_dispute_case',
        'Update-Dispute-case___update_dispute_case': 'update_dispute_case',
        'manage-recent-interactions___manage_recent_interactions': 'manage_recent_interactions'
    };
    return reverseMapping[gatewayName] || gatewayName;
}

main();
