#!/usr/bin/env node

/**
 * AgentCore Gateway - Time Tool Tester
 * This script performs a direct "Unit Test" on your AWS Lambda via the AgentCore Gateway.
 * It uses the same credentials as the main environment and calls the gateway directly.
 * Based on the same pattern as test-gateway-transactions.js
 */

console.log('🕐 Starting AgentCore Gateway Time Tool Tester...');

// Load environment variables from backend/.env
require('dotenv').config({ path: '../backend/.env' });

// AWS signing library
const aws4 = require('aws4');

const CONFIG = {
    awsAccessKey: process.env.NOVA_AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
    gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
    toolName: "get-Time___get_current_time",  // Actual tool name from AgentCore
    toolArgs: {
        timezone: "UTC"
    }
};

async function testGateway() {
    console.log('\n🕐 AgentCore Gateway Time Tool Tester');
    console.log('====================================');
    
    // Validate credentials
    if (!CONFIG.awsAccessKey || !CONFIG.awsSecretKey) {
        console.error('❌ Missing AWS credentials in environment');
        return;
    }
    
    console.log('\n🔍 Step 1: Listing available tools...');
    await listAvailableTools();
    
    console.log('\n🕐 Step 2: Testing time tool...');
    const payload = {
        jsonrpc: "2.0",
        id: `test-${Date.now()}`,
        method: "tools/call",
        params: {
            name: CONFIG.toolName,
            arguments: CONFIG.toolArgs
        }
    };
    await testWithIAMAuth(payload);
}

async function listAvailableTools() {
    const payload = {
        jsonrpc: "2.0",
        id: `list-tools-${Date.now()}`,
        method: "tools/list",
        params: {}
    };

    try {
        const url = new URL(CONFIG.gatewayUrl);
        const body = JSON.stringify(payload);
        
        // Create AWS request object for signing
        const request = {
            host: url.hostname,
            method: 'POST',
            path: url.pathname,
            service: 'bedrock-agentcore',
            region: CONFIG.awsRegion,
            headers: {
                'Content-Type': 'application/json'
            },
            body: body
        };

        // Sign the request with AWS credentials
        const signedRequest = aws4.sign(request, {
            accessKeyId: CONFIG.awsAccessKey,
            secretAccessKey: CONFIG.awsSecretKey
        });

        console.log('   → Making signed request to list tools...');
        
        const response = await fetch(CONFIG.gatewayUrl, {
            method: 'POST',
            headers: signedRequest.headers,
            body: body
        });

        console.log(`   → Response status: ${response.status}`);
        
        const text = await response.text();
        
        if (response.status === 200) {
            try {
                const data = JSON.parse(text);
                if (data.result && data.result.tools) {
                    console.log('\n📋 Available Tools:');
                    data.result.tools.forEach((tool, index) => {
                        console.log(`   ${index + 1}. ${tool.name} - ${tool.description || 'No description'}`);
                        if (tool.name === CONFIG.toolName) {
                            console.log(`   ✅ Target time tool found: ${tool.name}`);
                        }
                    });
                    
                    // Check if time tool exists
                    const hasTimeTool = data.result.tools.some(tool => tool.name === CONFIG.toolName);
                    if (!hasTimeTool) {
                        console.log(`   ❌ Time tool "${CONFIG.toolName}" not found yet`);
                        console.log('   💡 Make sure your Lambda is connected to the "get-Time" target in AgentCore');
                    }
                } else {
                    console.log('   No tools found in response');
                }
            } catch (e) {
                console.log('   Could not parse JSON response');
            }
        }
        
    } catch (error) {
        console.error('   ❌ Error listing tools:', error.message);
    }
}

async function testWithIAMAuth(payload) {
    try {
        const url = new URL(CONFIG.gatewayUrl);
        const body = JSON.stringify(payload);
        
        // Create AWS request object
        const request = {
            host: url.hostname,
            method: 'POST',
            path: url.pathname,
            service: 'bedrock-agentcore',
            region: CONFIG.awsRegion,
            headers: {
                'Content-Type': 'application/json'
            },
            body: body
        };

        // Sign the request with AWS credentials
        const signedRequest = aws4.sign(request, {
            accessKeyId: CONFIG.awsAccessKey,
            secretAccessKey: CONFIG.awsSecretKey
        });

        console.log('   → Making signed request...');
        console.log(`   → Tool: ${CONFIG.toolName}`);
        console.log(`   → Parameters: ${JSON.stringify(CONFIG.toolArgs)}`);
        
        const response = await fetch(CONFIG.gatewayUrl, {
            method: 'POST',
            headers: signedRequest.headers,
            body: body
        });

        console.log(`   → Response status: ${response.status}`);
        
        const text = await response.text();
        console.log(`   → Response: ${text}`);
        
        if (response.status === 200) {
            console.log('   ✅ SUCCESS: Authenticated request worked!');
            
            try {
                const data = JSON.parse(text);
                if (data.result) {
                    console.log('\n🕐 Time Tool Result:');
                    console.log('   ', JSON.stringify(data.result, null, 4));
                    
                    // Try to parse the inner response if it's JSON
                    if (data.result.content && data.result.content[0] && data.result.content[0].text) {
                        try {
                            const innerResponse = JSON.parse(data.result.content[0].text);
                            if (innerResponse.body) {
                                console.log('\n🕐 Current Time:');
                                console.log('   ', innerResponse.body);
                            }
                        } catch (e) {
                            // Inner response might not be JSON, show as text
                            console.log('\n🕐 Current Time:');
                            console.log('   ', data.result.content[0].text);
                        }
                    }
                } else if (data.error) {
                    console.log('\n❌ Tool Error:');
                    console.log('   ', data.error.message);
                    if (data.error.message.includes('Unknown tool')) {
                        console.log('\n💡 Next Steps:');
                        console.log('   1. Deploy lambda-time-agentcore.py as AWS Lambda function');
                        console.log('   2. Add it to your AgentCore Gateway configuration');
                        console.log('   3. Run this test again');
                    }
                }
            } catch (e) {
                console.log('   Could not parse response as JSON');
            }
        } else {
            console.log('   ⚠️  Request failed');
        }
        
    } catch (error) {
        console.error('   ❌ Error:', error.message);
    }
}

// Run the test
testGateway();