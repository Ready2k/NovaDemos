#!/usr/bin/env node

console.log('🚀 Starting AgentCore Gateway Balance Tool Tester...');

// Load environment variables from backend/.env
require('dotenv').config({ path: '../backend/.env' });

// AWS signing library
const aws4 = require('aws4');

const CONFIG = {
    awsAccessKey: process.env.NOVA_AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
    gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
    toolName: "get-Balance___get_Balance",
    toolArgs: {
        accountId: "1234567890",
        sortCode: "112233"
    }
};

async function testGateway() {
    console.log('\n🏦 AgentCore Gateway Balance Tool Tester');
    console.log('======================================');
    
    // Validate credentials
    if (!CONFIG.awsAccessKey || !CONFIG.awsSecretKey) {
        console.error('❌ Missing AWS credentials in environment');
        return;
    }
    
    console.log('\n🔍 Step 1: Listing available tools...');
    await listAvailableTools();
    
    console.log('\n🔐 Step 2: Testing tool call with authentication...');
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
        console.log(`   → Response: ${text}`);
        
        if (response.status === 200) {
            try {
                const data = JSON.parse(text);
                if (data.result && data.result.tools) {
                    console.log('\n📋 Available Tools:');
                    data.result.tools.forEach((tool, index) => {
                        console.log(`   ${index + 1}. ${tool.name} - ${tool.description || 'No description'}`);
                    });
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

async function testWithoutAuth(payload) {
    try {
        const response = await fetch(CONFIG.gatewayUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`   Response status: ${response.status}`);
        
        const text = await response.text();
        console.log(`   Response: ${text.substring(0, 200)}...`);
        
        if (response.status === 401) {
            console.log('   ✅ Expected: Authentication required');
        }
        
    } catch (error) {
        console.error('   ❌ Error:', error.message);
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
        
        const response = await fetch(CONFIG.gatewayUrl, {
            method: 'POST',
            headers: signedRequest.headers,
            body: body
        });

        console.log(`   Response status: ${response.status}`);
        
        const text = await response.text();
        console.log(`   Response: ${text}`);
        
        if (response.status === 200) {
            console.log('   ✅ SUCCESS: Authenticated request worked!');
            
            try {
                const data = JSON.parse(text);
                if (data.result) {
                    console.log('   📋 Tool Result:');
                    console.log('   ', JSON.stringify(data.result, null, 4));
                }
            } catch (e) {
                // Response might not be JSON
            }
        } else {
            console.log('   ⚠️  Authentication may still need adjustment');
        }
        
    } catch (error) {
        console.error('   ❌ Error:', error.message);
    }
}

// Run the test
testGateway();