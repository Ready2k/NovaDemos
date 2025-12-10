#!/usr/bin/env node

/**
 * AgentCore Browser Setup Helper
 * 
 * This script helps you set up the required IAM permissions for AgentCore Browser.
 * Based on: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-onboarding.html
 */

console.log('🌐 AgentCore Browser Setup Helper');
console.log('=================================\n');

// Load environment variables
require('dotenv').config({ path: '../backend/.env' });

const CONFIG = {
    awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
    accountId: process.env.AWS_ACCOUNT_ID || 'YOUR_ACCOUNT_ID'
};

function generateIAMPolicy() {
    const policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "BedrockAgentCoreBrowserFullAccess",
                "Effect": "Allow",
                "Action": [
                    "bedrock-agentcore:CreateBrowser",
                    "bedrock-agentcore:ListBrowsers",
                    "bedrock-agentcore:GetBrowser",
                    "bedrock-agentcore:DeleteBrowser",
                    "bedrock-agentcore:StartBrowserSession",
                    "bedrock-agentcore:ListBrowserSessions",
                    "bedrock-agentcore:GetBrowserSession",
                    "bedrock-agentcore:StopBrowserSession",
                    "bedrock-agentcore:UpdateBrowserStream",
                    "bedrock-agentcore:ConnectBrowserAutomationStream",
                    "bedrock-agentcore:ConnectBrowserLiveViewStream"
                ],
                "Resource": `arn:aws:bedrock-agentcore:${CONFIG.awsRegion}:${CONFIG.accountId}:browser/*`
            },
            {
                "Sid": "BedrockModelAccess",
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                "Resource": ["*"]
            }
        ]
    };
    
    return JSON.stringify(policy, null, 2);
}

function displaySetupInstructions() {
    console.log('📋 REQUIRED SETUP STEPS');
    console.log('=======================\n');
    
    console.log('1️⃣ **Check Your Current Identity**');
    console.log('   Run this command to see your current AWS identity:');
    console.log('   ```');
    console.log('   aws sts get-caller-identity');
    console.log('   ```\n');
    
    console.log('2️⃣ **Add IAM Permissions**');
    console.log('   Your IAM user/role needs browser permissions.');
    console.log('   Go to: AWS Console → IAM → Your User/Role → Add Permissions\n');
    
    console.log('3️⃣ **Create Inline Policy**');
    console.log('   - Click "Create inline policy"');
    console.log('   - Switch to JSON view');
    console.log('   - Paste the policy below');
    console.log('   - Name it: "AgentCoreBrowserAccess"\n');
    
    console.log('📄 **IAM Policy JSON:**');
    console.log('```json');
    console.log(generateIAMPolicy());
    console.log('```\n');
    
    console.log('4️⃣ **Verify Model Access**');
    console.log('   Ensure Claude Sonnet 4.0 is enabled in Bedrock Console:');
    console.log('   AWS Console → Bedrock → Model Access → Enable Claude Sonnet 4.0\n');
    
    console.log('5️⃣ **Update Your AgentCore Runtime**');
    console.log('   After permissions are set, you need to configure your AgentCore Runtime');
    console.log('   to include the Browser tool. This might require updating your runtime configuration.\n');
    
    console.log('🔍 **Test After Setup**');
    console.log('   Run the capability checker again:');
    console.log('   ```');
    console.log('   node check-agentcore-capabilities.js');
    console.log('   ```');
    console.log('   You should see Browser tools in the results.\n');
}

function displayCurrentConfig() {
    console.log('🔧 CURRENT CONFIGURATION');
    console.log('========================');
    console.log(`AWS Region: ${CONFIG.awsRegion}`);
    console.log(`Account ID: ${CONFIG.accountId}`);
    
    if (CONFIG.accountId === 'YOUR_ACCOUNT_ID') {
        console.log('\n⚠️  **Account ID Not Set**');
        console.log('   Add AWS_ACCOUNT_ID to your backend/.env file');
        console.log('   You can get it by running: aws sts get-caller-identity\n');
    }
}

// Main execution
console.log('This script helps you enable AgentCore Browser for your runtime.\n');
console.log('The Browser tool will allow your agent to:');
console.log('• Navigate websites to get current time');
console.log('• Search for real-time information');
console.log('• Extract content from web pages');
console.log('• Interact with web elements\n');

displayCurrentConfig();
displaySetupInstructions();

console.log('💡 **Why This Fixes Your Time Issue:**');
console.log('   Currently your agent only has banking tools.');
console.log('   With Browser tools, it can visit time websites like:');
console.log('   • worldclock.com');
console.log('   • timeanddate.com');
console.log('   • Or any other time source');
console.log('   This gives accurate, real-time information instead of relying on static data.\n');

console.log('✅ After completing these steps, re-run your capability checker!');