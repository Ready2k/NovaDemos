#!/usr/bin/env node

/**
 * Simple Time Lambda Test
 * 
 * Tests calling a simple time Lambda function via your existing AgentCore Gateway.
 * This is much simpler than browser tools - just another Lambda like your banking tools.
 */

console.log('🕐 Simple Time Lambda Test');
console.log('==========================\n');

// Load environment variables
require('dotenv').config({ path: '../backend/.env' });

// AWS signing library
const aws4 = require('aws4');

const CONFIG = {
    awsAccessKey: process.env.NOVA_AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
    gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
};

async function testTimeLambda() {
    console.log('🎯 SIMPLE APPROACH: Time Lambda via Gateway');
    console.log('===========================================');
    
    console.log('Instead of complex browser tools, we can:');
    console.log('✅ Create a simple Lambda function that returns current time');
    console.log('✅ Add it to your existing AgentCore Gateway (same as banking tools)');
    console.log('✅ Call it via the same gateway you already use');
    console.log('✅ No new permissions or runtime changes needed\n');
    
    // Test the gateway connection first
    console.log('🔍 Step 1: Testing existing gateway connection...');
    
    const payload = {
        jsonrpc: "2.0",
        id: `time-test-${Date.now()}`,
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
            headers: {
                'Content-Type': 'application/json'
            },
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
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        const tools = data.result?.tools || [];
        
        console.log(`   ✅ Gateway connection works! Found ${tools.length} tools:`);
        tools.forEach(tool => {
            console.log(`      • ${tool.name}`);
        });
        
        console.log('\n🔧 Step 2: What you need to do...');
        console.log('==================================');
        
        console.log('1. Create Time Lambda Function:');
        console.log('   • Use the simple-time-lambda.py code I created');
        console.log('   • Deploy it as an AWS Lambda function');
        console.log('   • Name it something like "get-current-time"');
        console.log('');
        
        console.log('2. Add Time Lambda to Your Gateway:');
        console.log('   • Same process as your banking tools');
        console.log('   • Configure it in your AgentCore Gateway');
        console.log('   • It will appear alongside get-Balance and get-TransactionHistory');
        console.log('');
        
        console.log('3. Test the New Tool:');
        console.log('   • Run this test again');
        console.log('   • Should see "get-current-time" in tools list');
        console.log('   • Nova client can ask "What time is it?" and get real-time response');
        console.log('');
        
        console.log('🎯 Expected Result After Setup:');
        console.log('===============================');
        console.log('Your tools list will show:');
        console.log('✅ get-Balance___get_Balance');
        console.log('✅ get-TransactionalHistory___get_TransactionHistory');
        console.log('✅ get-current-time___get_CurrentTime  ← NEW!');
        console.log('');
        
        console.log('💡 Why This Approach is Better:');
        console.log('================================');
        console.log('✅ Uses your existing gateway (no new setup)');
        console.log('✅ Same pattern as banking tools (familiar)');
        console.log('✅ No browser permissions needed');
        console.log('✅ No runtime modifications required');
        console.log('✅ Simple Lambda function (easy to maintain)');
        console.log('✅ Fast and reliable');
        console.log('');
        
        // Try to call a hypothetical time tool (will fail until you create it)
        console.log('🧪 Step 3: Testing hypothetical time tool call...');
        await testTimeToolCall();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

async function testTimeToolCall() {
    // Test calling the time tool (will fail until it exists)
    const payload = {
        jsonrpc: "2.0",
        id: `time-call-${Date.now()}`,
        method: "tools/call",
        params: {
            name: "get-current-time___get_CurrentTime",
            arguments: {}
        }
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
            headers: {
                'Content-Type': 'application/json'
            },
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

        const text = await response.text();
        
        if (response.ok) {
            console.log('   ✅ Time tool call succeeded!');
            console.log('   Response:', text);
        } else {
            console.log('   ❌ Time tool not found yet (expected)');
            console.log('   This will work after you add the time Lambda to your gateway');
        }
        
    } catch (error) {
        console.log('   ❌ Time tool not available yet (expected)');
        console.log('   Create and configure the Lambda, then this will work!');
    }
}

// Main execution
async function main() {
    console.log('Testing the simple Lambda approach for getting current time...\n');
    
    if (!CONFIG.awsAccessKey || !CONFIG.awsSecretKey) {
        console.error('❌ Missing AWS credentials');
        return;
    }
    
    await testTimeLambda();
    
    console.log('\n🚀 NEXT STEPS:');
    console.log('==============');
    console.log('1. Deploy the simple-time-lambda.py as an AWS Lambda function');
    console.log('2. Add it to your AgentCore Gateway configuration');
    console.log('3. Run this test again to verify it works');
    console.log('4. Test with Nova client: "What time is it?"');
    console.log('');
    console.log('This is much simpler than browser tools and uses your existing infrastructure!');
}

main().catch(console.error);