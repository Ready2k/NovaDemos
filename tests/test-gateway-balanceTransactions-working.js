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
    toolName: "get_Balance",
    toolArgs: {
        accountId: "1234567890",
        sortCode: "10-20-30"
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
    
    const payload = {
        jsonrpc: "2.0",
        id: `test-${Date.now()}`,
        method: "tools/call",
        params: {
            name: CONFIG.toolName,
            arguments: CONFIG.toolArgs
        }
    };

    console.log('\n🔍 Step 1: Testing without authentication...');
    await testWithoutAuth(payload);
    
    console.log('\n🔐 Step 2: Testing with IAM authentication...');
    await testWithIAMAuth(payload);
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