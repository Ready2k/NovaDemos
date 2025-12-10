#!/usr/bin/env node

/**
 * AgentCore Runtime Configuration Checker
 * 
 * This script helps you understand your current runtime setup and 
 * guides you through adding browser tools to your AgentCore Runtime.
 */

console.log('🔧 AgentCore Runtime Configuration Checker');
console.log('==========================================\n');

// Load environment variables
require('dotenv').config({ path: '../backend/.env' });

const CONFIG = {
    awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
    runtimeArn: process.env.AGENT_CORE_RUNTIME_ARN,
    gatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
};

function analyzeCurrentSetup() {
    console.log('📋 CURRENT AGENTCORE SETUP ANALYSIS');
    console.log('===================================');
    
    console.log(`🌍 AWS Region: ${CONFIG.awsRegion}`);
    console.log(`🔗 Gateway URL: ${CONFIG.gatewayUrl}`);
    
    if (CONFIG.runtimeArn) {
        console.log(`🏃 Runtime ARN: ${CONFIG.runtimeArn}`);
        
        // Extract runtime ID from ARN
        const runtimeMatch = CONFIG.runtimeArn.match(/runtime\/([^\/]+)/);
        if (runtimeMatch) {
            const runtimeId = runtimeMatch[1];
            console.log(`📝 Runtime ID: ${runtimeId}`);
            
            if (runtimeId.includes('Banking')) {
                console.log('💰 Runtime Type: Banking-focused (banking tools only)');
            } else {
                console.log('🔧 Runtime Type: Custom configuration');
            }
        }
    } else {
        console.log('⚠️  Runtime ARN: Not configured in .env');
    }
    
    console.log('\n🎯 WHAT YOU NEED TO DO');
    console.log('======================');
    
    console.log('Your current runtime only has banking tools. To add browser capabilities:');
    console.log('');
    console.log('Option 1: Create New Runtime (Recommended)');
    console.log('   • Go to AWS AgentCore Console');
    console.log('   • Create new browser tool instance');
    console.log('   • Create new runtime with banking + browser tools');
    console.log('   • Update your .env with new runtime ARN/gateway URL');
    console.log('');
    console.log('Option 2: Modify Existing Runtime');
    console.log('   • Update current runtime to include browser tool');
    console.log('   • May require runtime reconfiguration');
    console.log('');
    
    console.log('📖 Detailed Steps:');
    console.log('   See: tests/agentcore-runtime-browser-setup.md');
    console.log('');
}

function displayNextSteps() {
    console.log('🚀 IMMEDIATE NEXT STEPS');
    console.log('=======================');
    
    console.log('1. Add IAM Browser Permissions');
    console.log('   → Run: node setup-browser-permissions.js');
    console.log('   → Follow the IAM policy instructions');
    console.log('');
    
    console.log('2. Access AgentCore Console');
    console.log('   → URL: https://us-east-1.console.aws.amazon.com/bedrock-agentcore/');
    console.log('   → Navigate to: Built-in Tools → Browser');
    console.log('');
    
    console.log('3. Create Browser Tool Instance');
    console.log('   → Click "Create Browser"');
    console.log('   → Name: "MyAgentBrowser"');
    console.log('   → Description: "Browser for time queries and web navigation"');
    console.log('');
    
    console.log('4. Create New Runtime or Update Existing');
    console.log('   → Include both banking tools AND browser tool');
    console.log('   → Note the new runtime ARN or gateway URL');
    console.log('');
    
    console.log('5. Update Your Configuration');
    console.log('   → Update backend/.env with new runtime details');
    console.log('   → Test with: node check-agentcore-capabilities.js');
    console.log('');
    
    console.log('6. Verify Browser Functionality');
    console.log('   → Run: node test-browser-time.js');
    console.log('   → Test with Nova client asking for current time');
    console.log('');
}

function displayExpectedResults() {
    console.log('✅ EXPECTED RESULTS AFTER SETUP');
    console.log('===============================');
    
    console.log('When you run check-agentcore-capabilities.js, you should see:');
    console.log('');
    console.log('✅ Web Browser & Navigation (3+ tools):');
    console.log('   • browser_navigate');
    console.log('   • browser_click');
    console.log('   • browser_extract_text');
    console.log('   • (possibly more browser tools)');
    console.log('');
    console.log('✅ API & HTTP Operations (2 tools):');
    console.log('   • get-Balance___get_Balance');
    console.log('   • get-TransactionalHistory___get_TransactionHistory');
    console.log('');
    console.log('🎯 Time Query Test:');
    console.log('   Ask Nova: "What\'s the current time?"');
    console.log('   Expected: Agent uses browser to visit time website and returns accurate time');
    console.log('');
}

// Main execution
console.log('This script analyzes your current AgentCore Runtime setup');
console.log('and guides you through adding browser capabilities.\n');

analyzeCurrentSetup();
displayNextSteps();
displayExpectedResults();

console.log('💡 KEY INSIGHT:');
console.log('   Your runtime configuration determines which tools are available.');
console.log('   Browser tools must be explicitly added to your runtime to be accessible.');
console.log('   The gateway URL connects to a specific runtime with specific tools.');
console.log('');
console.log('📚 For detailed technical steps, see:');
console.log('   tests/agentcore-runtime-browser-setup.md');