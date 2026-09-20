#!/usr/bin/env node

/**
 * AgentCore Runtime Configuration Checker
 * Verifies credentials are present and the gateway endpoint is reachable.
 */

console.log('🔧 AgentCore Runtime Configuration Checker');
console.log('==========================================\n');

// Load non-credential vars from backend/.env (region, runtime ARN, etc.)
// Credentials come from shell env vars set by start-dev.sh
require('dotenv').config({ path: '../backend/.env' });

const aws4 = require('aws4');

const CONFIG = {
    awsAccessKey: process.env.AWS_ACCESS_KEY_ID || process.env.NOVA_AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.NOVA_AWS_SECRET_ACCESS_KEY,
    awsSessionToken: process.env.AWS_SESSION_TOKEN || process.env.NOVA_AWS_SESSION_TOKEN,
    awsRegion: process.env.NOVA_AWS_REGION || process.env.AWS_REGION || 'us-east-1',
    runtimeArn: process.env.AGENT_CORE_RUNTIME_ARN,
    gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
};

function analyzeCurrentSetup() {
    console.log('📋 CURRENT AGENTCORE SETUP');
    console.log('==========================');

    console.log(`🌍 AWS Region:    ${CONFIG.awsRegion}`);
    console.log(`🔗 Gateway URL:   ${CONFIG.gatewayUrl}`);

    if (CONFIG.runtimeArn) {
        console.log(`🏃 Runtime ARN:   ${CONFIG.runtimeArn}`);
        const runtimeMatch = CONFIG.runtimeArn.match(/runtime\/([^/]+)/);
        if (runtimeMatch) {
            console.log(`📝 Runtime ID:    ${runtimeMatch[1]}`);
        }
    } else {
        console.log('⚠️  Runtime ARN:   Not set in backend/.env');
    }

    const hasKey = !!CONFIG.awsAccessKey;
    const hasSecret = !!CONFIG.awsSecretKey;
    const hasToken = !!CONFIG.awsSessionToken;
    const credSource = hasToken ? 'STS assumed-role (start-dev.sh)' : hasKey ? 'static IAM' : 'none';
    console.log(`🔑 Credentials:   ${credSource}`);
    console.log(`   AWS_ACCESS_KEY_ID:     ${hasKey ? '✅ set' : '❌ missing'}`);
    console.log(`   AWS_SECRET_ACCESS_KEY: ${hasSecret ? '✅ set' : '❌ missing'}`);
    console.log(`   AWS_SESSION_TOKEN:     ${hasToken ? '✅ set' : '⚠️  not set (ok for static IAM)'}`);
    console.log('');
}

async function testGatewayConnectivity() {
    console.log('🌐 GATEWAY CONNECTIVITY TEST');
    console.log('============================');

    if (!CONFIG.awsAccessKey || !CONFIG.awsSecretKey) {
        console.error('❌ Cannot test — AWS credentials not set.');
        console.error('   Run ./start-dev.sh to assume the VoiceS2S-Bedrock role first.');
        return false;
    }

    const payload = {
        jsonrpc: "2.0",
        id: `runtime-check-${Date.now()}`,
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
            body
        };

        const creds = {
            accessKeyId: CONFIG.awsAccessKey,
            secretAccessKey: CONFIG.awsSecretKey
        };
        if (CONFIG.awsSessionToken) creds.sessionToken = CONFIG.awsSessionToken;

        const signedRequest = aws4.sign(request, creds);

        console.log('📡 Sending tools/list request to gateway...');
        const response = await fetch(CONFIG.gatewayUrl, {
            method: 'POST',
            headers: signedRequest.headers,
            body
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`❌ HTTP ${response.status}: ${text}`);
            return false;
        }

        const data = await response.json();
        const toolCount = data?.result?.tools?.length ?? 0;

        console.log(`✅ Gateway reachable — ${toolCount} tool(s) available`);

        if (toolCount > 0) {
            console.log('\n   Tools registered on this runtime:');
            data.result.tools.forEach(t => console.log(`   • ${t.name}`));
        } else {
            console.log('⚠️  No tools returned — runtime may be empty or misconfigured');
        }

        return true;
    } catch (err) {
        console.error(`❌ Connection failed: ${err.message}`);
        return false;
    }
}

async function main() {
    analyzeCurrentSetup();
    const ok = await testGatewayConnectivity();

    console.log('\n' + (ok ? '✅ Runtime check PASSED' : '❌ Runtime check FAILED'));

    if (!ok) {
        console.log('\n💡 If credentials are missing, run:');
        console.log('   cd .. && ./start-dev.sh');
    }
}

main().catch(err => {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
});
