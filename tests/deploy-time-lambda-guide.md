# Simple Time Lambda Deployment Guide

## Why This Approach is Better

Instead of complex browser tools, we're creating a simple Lambda function that:
- ✅ Uses your existing AgentCore Gateway (no new setup)
- ✅ Follows the same pattern as your banking tools
- ✅ Requires no browser permissions or runtime changes
- ✅ Is fast, reliable, and easy to maintain

## Step 1: Create the Lambda Function

### Option A: AWS Console (Recommended)
1. Go to [AWS Lambda Console](https://us-east-1.console.aws.amazon.com/lambda/)
2. Click "Create function"
3. Choose "Author from scratch"
4. Function name: `get-current-time`
5. Runtime: `Python 3.9` or later
6. Click "Create function"

### Option B: AWS CLI
```bash
# Create the function
aws lambda create-function \
    --function-name get-current-time \
    --runtime python3.9 \
    --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
    --handler lambda_function.lambda_handler \
    --zip-file fileb://time-lambda.zip \
    --region us-east-1
```

## Step 2: Deploy the Code

1. Copy the code from `simple-time-lambda.py`
2. In the Lambda console, paste it into the code editor
3. The function requires the `pytz` library for timezone handling

### Add pytz Dependency
Create a `requirements.txt` file:
```
pytz==2023.3
```

Or use a Lambda Layer with pytz, or modify the code to use only built-in datetime (simpler).

### Simplified Version (No External Dependencies)
```python
import json
from datetime import datetime, timezone, timedelta

def lambda_handler(event, context):
    try:
        # Get current UTC time
        utc_now = datetime.now(timezone.utc)
        
        # Calculate other timezones manually (no pytz needed)
        eastern_offset = timedelta(hours=-5)  # EST (adjust for DST as needed)
        pacific_offset = timedelta(hours=-8)  # PST (adjust for DST as needed)
        
        eastern_time = utc_now + eastern_offset
        pacific_time = utc_now + pacific_offset
        
        time_data = {
            "utc": utc_now.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "eastern": eastern_time.strftime("%Y-%m-%d %H:%M:%S EST"),
            "pacific": pacific_time.strftime("%Y-%m-%d %H:%M:%S PST"),
            "timestamp": int(utc_now.timestamp())
        }
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'message': f'Current time: {utc_now.strftime("%Y-%m-%d %H:%M:%S UTC")}',
                'data': time_data
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'message': f'Error getting time: {str(e)}',
                'data': None
            })
        }
```

## Step 3: Test the Lambda Function

In the Lambda console:
1. Click "Test"
2. Create a new test event (use default template)
3. Click "Test"
4. Verify you get a successful response with current time

Expected response:
```json
{
  "statusCode": 200,
  "body": "{\"success\": true, \"message\": \"Current time: 2024-12-10 15:30:45 UTC\", \"data\": {...}}"
}
```

## Step 4: Add Lambda to AgentCore Gateway

This is where you configure your AgentCore Gateway to include the new time Lambda alongside your existing banking tools.

### Method 1: Gateway Configuration (Most Likely)
- Your gateway configuration probably includes a list of Lambda functions
- Add your new `get-current-time` Lambda to this list
- The gateway will expose it as a tool with a name like `get-current-time___get_CurrentTime`

### Method 2: Runtime Configuration
- If your gateway is tied to your runtime configuration
- You may need to update the runtime to include the new Lambda
- This would be done through the AgentCore console

### Method 3: MCP Server Configuration
- If you're using MCP servers behind the gateway
- Add the Lambda as a new MCP tool
- Configure the MCP server to call your Lambda

## Step 5: Verify Integration

Run the test script:
```bash
cd tests
node test-simple-time-lambda.js
```

Expected output after setup:
```
✅ Gateway connection works! Found 3 tools:
   • get-Balance___get_Balance
   • get-TransactionalHistory___get_TransactionHistory
   • get-current-time___get_CurrentTime  ← NEW!
```

## Step 6: Test with Nova Client

Ask your Nova client:
- "What time is it?"
- "What's the current time?"
- "Tell me the time"

Expected behavior:
- Nova client calls the time tool via gateway
- Gets real-time response with current time
- No more "I don't have access to real-time information" responses

## Troubleshooting

### Lambda Function Issues
- Check CloudWatch logs for Lambda execution errors
- Verify the function returns the expected JSON format
- Test the function directly in Lambda console

### Gateway Integration Issues
- Verify the Lambda is properly configured in your gateway
- Check that the tool name matches what the gateway expects
- Ensure proper IAM permissions for gateway to call Lambda

### Tool Not Appearing
- Gateway configuration may need to be refreshed
- Runtime may need to be redeployed
- Check AgentCore console for configuration updates

## Benefits of This Approach

✅ **Simple**: Just another Lambda function like your banking tools
✅ **Reliable**: No external dependencies or complex browser automation
✅ **Fast**: Direct Lambda execution, no web scraping delays
✅ **Maintainable**: Easy to update, debug, and monitor
✅ **Consistent**: Uses same pattern as existing tools
✅ **Secure**: No additional permissions or runtime changes needed

This gives you real-time information capability without the complexity of browser tools!