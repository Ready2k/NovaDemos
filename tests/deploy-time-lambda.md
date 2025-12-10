# Deploy Time Lambda - Same Pattern as Banking Tools

## Lambda Function: `lambda-time-agentcore.py`

This Lambda follows the exact same pattern as your existing banking Lambda functions:
- ✅ Python 3.12 runtime
- ✅ Same logging structure
- ✅ Same event handling pattern
- ✅ Same response format
- ✅ Same error handling

## Deployment Steps

### 1. Create Lambda Function

**AWS Console:**
1. Go to [AWS Lambda Console](https://us-east-1.console.aws.amazon.com/lambda/)
2. Click "Create function"
3. Choose "Author from scratch"
4. Function name: `get-current-time`
5. Runtime: `Python 3.12`
6. Architecture: `x86_64`
7. Click "Create function"

### 2. Deploy Code

1. Copy the entire content from `lambda-time-agentcore.py`
2. Paste it into the Lambda code editor
3. Click "Deploy"

### 3. Test Lambda Function

Create a test event:
```json
{
  "timezone": "UTC"
}
```

Expected response:
```json
{
  "statusCode": 200,
  "body": "The current time is Tuesday, December 10, 2024 at 15:30:45 UTC."
}
```

### 4. Configure IAM Role

Ensure your Lambda execution role has:
- Basic Lambda execution permissions
- CloudWatch Logs permissions (for logging)

### 5. Add to AgentCore Gateway

This is the same process you used for your banking tools:

1. **Gateway Configuration**: Add the new Lambda to your AgentCore Gateway configuration
2. **Tool Name**: It should appear as `get-current-time___get_CurrentTime`
3. **Parameters**: Supports optional `timezone` parameter (defaults to UTC)

### 6. Test Integration

Run the test script:
```bash
cd tests
node test-time-lambda-agentcore.js
```

**Before adding to gateway:**
```
❌ Time tool "get-current-time___get_CurrentTime" not found yet
💡 Deploy the lambda-time-agentcore.py Lambda and add it to your gateway
```

**After adding to gateway:**
```
✅ Target time tool found: get-current-time___get_CurrentTime
✅ SUCCESS: Authenticated request worked!
🕐 Current Time: The current time is Tuesday, December 10, 2024 at 15:30:45 UTC.
```

## Expected Tool List After Setup

Your capability checker should show:
```
✅ API & HTTP Operations (3 tools):
   • get-Balance___get_Balance
   • get-TransactionalHistory___get_TransactionHistory  
   • get-current-time___get_CurrentTime  ← NEW!
```

## Test with Nova Client

After deployment, your Nova client can handle:
- "What time is it?"
- "Tell me the current time"
- "What's the time in EST?" (if you pass timezone parameter)

## Lambda Function Features

- **Timezone Support**: Supports UTC, EST, PST, GMT, CET, JST
- **Error Handling**: Same robust error handling as banking tools
- **Logging**: Comprehensive logging for debugging
- **Format**: Returns human-readable time format
- **No Dependencies**: Uses only built-in Python libraries

## Comparison with Banking Tools

| Feature | Banking Tools | Time Tool |
|---------|---------------|-----------|
| Runtime | Python 3.12 | Python 3.12 ✅ |
| Pattern | AgentCore Gateway | AgentCore Gateway ✅ |
| Logging | Structured logging | Structured logging ✅ |
| Error Handling | Try/catch with status codes | Try/catch with status codes ✅ |
| Response Format | `{statusCode, body}` | `{statusCode, body}` ✅ |
| Parameters | Required (accountId, sortCode) | Optional (timezone) ✅ |

This gives you real-time capability using the exact same infrastructure and patterns as your existing banking tools!