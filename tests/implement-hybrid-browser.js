#!/usr/bin/env node

/**
 * Hybrid Browser Implementation Helper
 * 
 * This script helps you implement the hybrid approach:
 * - Keep existing banking runtime
 * - Add browser tools separately
 * - Smart routing between the two
 */

console.log('🚀 Hybrid Browser Implementation Helper');
console.log('=======================================\n');

// Load environment variables
require('dotenv').config({ path: '../backend/.env' });

const CONFIG = {
    awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
    accountId: process.env.AWS_ACCOUNT_ID || 'YOUR_ACCOUNT_ID'
};

function displayImplementationPlan() {
    console.log('📋 HYBRID IMPLEMENTATION PLAN');
    console.log('=============================');
    
    console.log('Instead of modifying your existing runtime, we will:');
    console.log('');
    console.log('1. ✅ Keep BankingCoreRuntime_http_v1-aIECoiHAgv as-is');
    console.log('2. 🌐 Create separate browser tool instance');
    console.log('3. 🔧 Modify agentcore-gateway-client.ts for smart routing');
    console.log('4. 🧪 Test both banking and browser functionality');
    console.log('');
}

function displayBrowserToolCreation() {
    console.log('🌐 STEP 1: CREATE BROWSER TOOL INSTANCE');
    console.log('=======================================');
    
    console.log('First, create a browser tool instance (separate from runtime):');
    console.log('');
    console.log('Option A: AWS CLI (if available)');
    console.log('```bash');
    console.log('aws bedrock-agentcore create-browser \\');
    console.log('    --region us-east-1 \\');
    console.log('    --browser-name "TimeQueryBrowser" \\');
    console.log('    --description "Browser tool for time queries and web navigation"');
    console.log('```');
    console.log('');
    console.log('Option B: AWS Console');
    console.log('1. Go to: https://us-east-1.console.aws.amazon.com/bedrock-agentcore/');
    console.log('2. Navigate: Built-in Tools → Browser');
    console.log('3. Click: "Create Browser"');
    console.log('4. Name: "TimeQueryBrowser"');
    console.log('5. Description: "Browser for time queries"');
    console.log('6. Note the Browser ARN for next step');
    console.log('');
}

function generateModifiedGatewayClient() {
    console.log('🔧 STEP 2: MODIFY GATEWAY CLIENT');
    console.log('================================');
    
    console.log('Create enhanced agentcore-gateway-client.ts:');
    console.log('');
    console.log('```typescript');
    console.log(`const aws4 = require('aws4');

interface AgentCoreGatewayConfig {
    bankingGatewayUrl: string;
    browserToolArn: string;
    awsRegion: string;
    awsAccessKey: string;
    awsSecretKey: string;
}

export class HybridAgentCoreClient {
    private config: AgentCoreGatewayConfig;

    constructor() {
        this.config = {
            // Existing banking gateway (keep as-is)
            bankingGatewayUrl: "https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
            
            // New browser tool ARN (update after creating browser)
            browserToolArn: "arn:aws:bedrock-agentcore:${CONFIG.awsRegion}:${CONFIG.accountId}:browser/TimeQueryBrowser",
            
            awsRegion: process.env.NOVA_AWS_REGION || 'us-east-1',
            awsAccessKey: process.env.NOVA_AWS_ACCESS_KEY_ID!,
            awsSecretKey: process.env.NOVA_AWS_SECRET_ACCESS_KEY!
        };
    }

    async callTool(toolName: string, args: any): Promise<string> {
        console.log(\`[HybridClient] Routing tool call: \${toolName}\`);
        
        // Smart routing based on tool type
        if (this.isBrowserTool(toolName)) {
            return this.callBrowserTool(toolName, args);
        } else {
            return this.callBankingTool(toolName, args);
        }
    }

    private isBrowserTool(toolName: string): boolean {
        const browserKeywords = ['browser', 'navigate', 'time', 'web', 'search', 'url'];
        return browserKeywords.some(keyword => 
            toolName.toLowerCase().includes(keyword)
        );
    }

    private async callBrowserTool(toolName: string, args: any): Promise<string> {
        console.log(\`[HybridClient] Using browser tool for: \${toolName}\`);
        
        // Direct browser tool API call
        const payload = {
            action: "navigate",
            url: args.url || "https://timeanddate.com/worldclock/",
            extractText: true
        };

        try {
            // Browser tool API endpoint
            const browserEndpoint = \`https://bedrock-agentcore.\${this.config.awsRegion}.amazonaws.com/browsers/\${this.getBrowserId()}/sessions\`;
            
            const request = {
                host: \`bedrock-agentcore.\${this.config.awsRegion}.amazonaws.com\`,
                method: 'POST',
                path: \`/browsers/\${this.getBrowserId()}/sessions\`,
                service: 'bedrock-agentcore',
                region: this.config.awsRegion,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            };

            const signedRequest = aws4.sign(request, {
                accessKeyId: this.config.awsAccessKey,
                secretAccessKey: this.config.awsSecretKey
            });

            const response = await fetch(browserEndpoint, {
                method: 'POST',
                headers: signedRequest.headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(\`Browser tool failed: \${response.status}\`);
            }

            const result = await response.json();
            return this.extractTimeFromBrowserResult(result);

        } catch (error: any) {
            console.error(\`[HybridClient] Browser tool error:\`, error);
            return \`Browser tool unavailable: \${error.message}\`;
        }
    }

    private async callBankingTool(toolName: string, args: any): Promise<string> {
        console.log(\`[HybridClient] Using banking gateway for: \${toolName}\`);
        
        // Your existing banking gateway logic (unchanged)
        const toolMapping: { [key: string]: string } = {
            'agentcore_balance': 'get-Balance___get_Balance',
            'agentcore_transactions': 'get-TransactionalHistory___get_TransactionHistory'
        };

        const actualToolName = toolMapping[toolName] || toolName;
        
        const payload = {
            jsonrpc: "2.0",
            id: \`tool-call-\${Date.now()}\`,
            method: "tools/call",
            params: {
                name: actualToolName,
                arguments: args
            }
        };

        // ... rest of your existing banking logic
        return "Banking tool result";
    }

    private getBrowserId(): string {
        // Extract browser ID from ARN
        const match = this.config.browserToolArn.match(/browser\\/(.+)$/);
        return match ? match[1] : 'TimeQueryBrowser';
    }

    private extractTimeFromBrowserResult(result: any): string {
        // Parse browser result to extract time information
        if (result.extractedText) {
            // Look for time patterns in extracted text
            const timePattern = /\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?/gi;
            const matches = result.extractedText.match(timePattern);
            
            if (matches && matches.length > 0) {
                return \`Current time: \${matches[0]}\`;
            }
        }
        
        return "Time information extracted from web page";
    }

    async listAllTools(): Promise<any[]> {
        // Combine tools from both sources
        const bankingTools = await this.listBankingTools();
        const browserTools = await this.listBrowserTools();
        
        return [...bankingTools, ...browserTools];
    }

    private async listBankingTools(): Promise<any[]> {
        // Your existing banking tools list logic
        return [
            { name: "get-Balance___get_Balance", description: "Get account balance" },
            { name: "get-TransactionalHistory___get_TransactionHistory", description: "Get transaction history" }
        ];
    }

    private async listBrowserTools(): Promise<any[]> {
        return [
            { name: "browser_navigate", description: "Navigate to web pages" },
            { name: "browser_extract_time", description: "Extract time from web pages" },
            { name: "browser_search", description: "Search the web" }
        ];
    }
}
\`\`\`);
    console.log('');
    console.log('');
}

function displayEnvironmentUpdates() {
    console.log('🔧 STEP 3: UPDATE ENVIRONMENT');
    console.log('=============================');
    
    console.log('Add to your backend/.env:');
    console.log('');
    console.log('```env');
    console.log('# Existing banking runtime (keep as-is)');
    console.log('AGENT_CORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:388660028061:runtime/BankingCoreRuntime_http_v1-aIECoiHAgv');
    console.log('');
    console.log('# New browser tool ARN (update after creating browser)');
    console.log(`BROWSER_TOOL_ARN=arn:aws:bedrock-agentcore:${CONFIG.awsRegion}:${CONFIG.accountId}:browser/TimeQueryBrowser`);
    console.log('');
    console.log('# Account ID for browser permissions');
    console.log(`AWS_ACCOUNT_ID=${CONFIG.accountId}`);
    console.log('```');
    console.log('');
}

function displayTestingSteps() {
    console.log('🧪 STEP 4: TESTING');
    console.log('==================');
    
    console.log('After implementation, test both capabilities:');
    console.log('');
    console.log('1. Test Banking Tools (should work as before):');
    console.log('   ```bash');
    console.log('   node test-gateway-transactions.js');
    console.log('   ```');
    console.log('');
    console.log('2. Test Browser Tools (new capability):');
    console.log('   ```bash');
    console.log('   node test-browser-time.js');
    console.log('   ```');
    console.log('');
    console.log('3. Test Combined Capability Check:');
    console.log('   ```bash');
    console.log('   node check-agentcore-capabilities.js');
    console.log('   ```');
    console.log('   Expected: Shows both banking AND browser tools');
    console.log('');
    console.log('4. Test with Nova Client:');
    console.log('   - "What\'s my account balance?" → Uses banking tools');
    console.log('   - "What\'s the current time?" → Uses browser tools');
    console.log('');
}

function displayBenefits() {
    console.log('✅ BENEFITS OF HYBRID APPROACH');
    console.log('==============================');
    
    console.log('✅ No disruption to existing banking functionality');
    console.log('✅ Browser capabilities for time and web queries');
    console.log('✅ Smart routing - right tool for right job');
    console.log('✅ Easy to troubleshoot (separate concerns)');
    console.log('✅ Flexible - can add more tools later');
    console.log('✅ Maintains your current runtime investment');
    console.log('');
    console.log('🎯 Result: Your agent will have BOTH banking and browser capabilities!');
    console.log('');
}

// Main execution
console.log('This script guides you through implementing browser tools');
console.log('alongside your existing banking runtime.\n');

displayImplementationPlan();
displayBrowserToolCreation();
generateModifiedGatewayClient();
displayEnvironmentUpdates();
displayTestingSteps();
displayBenefits();

console.log('🚀 Ready to implement? Start with Step 1: Create Browser Tool Instance');
console.log('   Then I can help you implement the modified gateway client!');