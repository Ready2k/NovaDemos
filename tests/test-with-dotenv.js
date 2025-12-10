#!/usr/bin/env node

require('dotenv').config({ path: '../backend/.env' });

console.log('Dotenv loaded, testing gateway...');

async function testGateway() {
    const gatewayUrl = "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp";
    
    const payload = {
        jsonrpc: "2.0",
        id: "test-123",
        method: "tools/call",
        params: {
            name: "get_Balance",
            arguments: {
                accountId: "1234567890",
                sortCode: "10-20-30"
            }
        }
    };

    console.log('Making request...');
    
    try {
        const response = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const text = await response.text();
            console.log('Response body:', text);
        } else {
            const data = await response.json();
            console.log('Response data:', JSON.stringify(data, null, 2));
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testGateway();