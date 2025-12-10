# AgentCore Runtime Browser Setup Guide

## Step 5: Update Your AgentCore Runtime Configuration

Your current setup uses a specific AgentCore Runtime via Gateway URL:
```
https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp
```

This runtime currently only has banking tools. To add browser capabilities, you have **two options**:

## Option A: Create a New Runtime with Browser Tools (Recommended)

### 1. Access AgentCore Console
- Go to [AWS AgentCore Console](https://us-east-1.console.aws.amazon.com/bedrock-agentcore/)
- Navigate to **Built-in Tools** → **Browser**

### 2. Create Browser Tool Instance
```bash
# Using AWS CLI (if available)
aws bedrock-agentcore create-browser \
    --region us-east-1 \
    --browser-name "MyAgentBrowser" \
    --description "Browser tool for time queries and web navigation"
```

### 3. Create New Runtime with Browser + Banking Tools
You need to create a new AgentCore Runtime that includes:
- Your existing banking tools (Balance, Transaction History)
- The new Browser tool

### 4. Update Your Configuration
In your `backend/.env` file, you'll need to update:
```env
# New runtime ARN with browser capabilities
AGENT_CORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/BankingBrowserRuntime_http_v1-xyz789

# Or new gateway URL if using gateway approach
AGENTCORE_GATEWAY_URL=https://new-gateway-url-with-browser.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp
```

## Option B: Modify Existing Runtime (If Possible)

### 1. Check Current Runtime Configuration
```bash
# List your current runtimes
aws bedrock-agentcore list-runtimes --region us-east-1

# Get details of your current runtime
aws bedrock-agentcore get-runtime \
    --runtime-id "BankingCoreRuntime_http_v1-abc123456" \
    --region us-east-1
```

### 2. Update Runtime Configuration
If your runtime supports modification, add browser tool:
```bash
aws bedrock-agentcore update-runtime \
    --runtime-id "BankingCoreRuntime_http_v1-abc123456" \
    --region us-east-1 \
    --tools '[
        {
            "type": "banking_balance",
            "name": "get-Balance___get_Balance"
        },
        {
            "type": "banking_transactions", 
            "name": "get-TransactionalHistory___get_TransactionHistory"
        },
        {
            "type": "browser",
            "name": "browser_navigate",
            "browserInstanceArn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:browser/MyAgentBrowser"
        }
    ]'
```

## Required IAM Permissions for Browser

Make sure your AWS credentials have these permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock-agentcore:CreateBrowser",
                "bedrock-agentcore:ListBrowsers",
                "bedrock-agentcore:GetBrowser",
                "bedrock-agentcore:StartBrowserSession",
                "bedrock-agentcore:ListBrowserSessions",
                "bedrock-agentcore:GetBrowserSession",
                "bedrock-agentcore:StopBrowserSession",
                "bedrock-agentcore:UpdateBrowserStream",
                "bedrock-agentcore:ConnectBrowserAutomationStream"
            ],
            "Resource": "arn:aws:bedrock-agentcore:us-east-1:*:browser/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "bedrock-agentcore:CreateRuntime",
                "bedrock-agentcore:UpdateRuntime",
                "bedrock-agentcore:GetRuntime",
                "bedrock-agentcore:ListRuntimes"
            ],
            "Resource": "arn:aws:bedrock-agentcore:us-east-1:*:runtime/*"
        }
    ]
}
```

## Testing Your Updated Runtime

### 1. Run Capability Check
```bash
cd tests
node check-agentcore-capabilities.js
```

**Expected Output After Setup:**
```
✅ Web Browser & Navigation (X tools):
   • browser_navigate
   • browser_click
   • browser_extract_text
   
✅ API & HTTP Operations (2 tools):
   • get-Balance___get_Balance
   • get-TransactionalHistory___get_TransactionHistory
```

### 2. Test Browser Time Functionality
```bash
node test-browser-time.js
```

### 3. Test with Nova Sonic Client
Ask your Nova client: "What's the current time?" 

It should now be able to:
1. Use browser tool to navigate to timeanddate.com
2. Extract current time information
3. Provide accurate, real-time response

## Troubleshooting

### If Browser Tools Don't Appear:
1. **Check IAM Permissions**: Ensure browser permissions are attached
2. **Verify Runtime Configuration**: Confirm browser tool is added to runtime
3. **Check Region**: Browser tool must be in same region as runtime
4. **Model Access**: Ensure Claude Sonnet 4.0 is enabled in Bedrock

### If Gateway URL Doesn't Change:
- Your current gateway might be tied to the specific runtime
- You may need a new gateway URL for the updated runtime
- Check AgentCore Console for the correct gateway endpoint

## Alternative: Using Strands Framework

If runtime modification is complex, consider using the Strands framework approach from the AWS documentation:

```python
from strands import Agent
from strands_tools.browser import AgentCoreBrowser

# Initialize Browser tool
browser_tool = AgentCoreBrowser(region="us-east-1")

# Create agent with browser + your banking tools
agent = Agent(tools=[browser_tool.browser, your_banking_tools])
```

This bypasses the need to modify your existing runtime configuration.