const aws4 = require('aws4');
require('dotenv').config({ path: 'backend/.env' });

const CONFIG = {
    awsAccessKey: process.env.NOVA_AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
    gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
};

async function listTools() {
    console.log('Listing tools from AgentCore Gateway...');

    if (!CONFIG.awsAccessKey || !CONFIG.awsSecretKey) {
        console.error('❌ Missing AWS credentials');
        return;
    }

    const payload = {
        jsonrpc: "2.0",
        id: `list-tools-${Date.now()}`,
        method: "tools/list",
        params: {}
    };

    try {
        const url = new URL(CONFIG.gatewayUrl);
        const body = JSON.stringify(payload);

        const request = {
            host: url.hostname,
            method: 'POST',
            path: url.pathname,
            service: 'bedrock-agentcore',
            region: CONFIG.awsRegion,
            headers: { 'Content-Type': 'application/json' },
            body: body
        };

        const signedRequest = aws4.sign(request, {
            accessKeyId: CONFIG.awsAccessKey,
            secretAccessKey: CONFIG.awsSecretKey
        });

        const response = await fetch(CONFIG.gatewayUrl, {
            method: 'POST',
            headers: signedRequest.headers,
            body: body
        });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${await response.text()}`);
            return;
        }

        const data = await response.json();
        console.log('Result:', JSON.stringify(data, null, 2));

        if (data.result && data.result.tools) {
            console.log('\nAvailable Tools:');
            data.result.tools.forEach(t => console.log(`- ${t.name}`));
        } else {
            console.log('No tools found in result.');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

listTools();
