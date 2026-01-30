# Remove Fallback/Mock Data - Fail Fast on AgentCore Issues

## Problem

The local-tools service had fallback implementations for banking tools that returned mock data when AgentCore calls failed. This **hid real issues** and made debugging difficult.

### What Was Happening

```
AgentCore call fails
↓
"Falling back to local implementation"
↓
Returns mock data (£1,234.56)
↓
User sees fake data
↓
Issue is hidden ❌
```

## Solution Applied

Removed ALL fallback implementations. Now AgentCore failures throw clear errors.

### Changes Made

#### 1. Removed Fallback Logic

**Before:**
```typescript
if (hasAgentCoreCredentials) {
    try {
        // Call AgentCore
        return result;
    } catch (error) {
        console.log('Falling back to local implementation');
        // Fall through to mock data
    }
}

// Fallback implementations
if (toolName === 'perform_idv_check') {
    return executeIDVCheck(input);  // Mock data
}
```

**After:**
```typescript
if (!hasAgentCoreCredentials) {
    throw new Error(`AgentCore credentials not configured. Cannot execute ${toolName}.`);
}

// Call AgentCore - NO FALLBACK
const result = await callAgentCoreGateway(toolName, input, gatewayTarget);
return result;
```

#### 2. Removed Mock Functions

Deleted these functions entirely:
- `executeIDVCheck()` - Mock IDV verification
- `executeGetBalance()` - Mock balance (£1,234.56)
- `executeGetTransactions()` - Mock transactions

#### 3. Updated Startup Messages

**Before:**
```
[LocalTools] AgentCore credentials not available - will use fallback implementations
```

**After:**
```
[LocalTools] ❌ AgentCore credentials NOT available
[LocalTools] ❌ Banking tools (IDV, balance, transactions) will FAIL
[LocalTools] Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
```

## New Behavior

### When AgentCore is Working ✅

```
User: "Check my balance"
↓
Banking agent calls agentcore_balance
↓
Local-tools calls AgentCore Gateway
↓
AgentCore returns real data: £1,200.00
↓
User hears real balance ✅
```

### When AgentCore Fails ❌

```
User: "Check my balance"
↓
Banking agent calls agentcore_balance
↓
Local-tools tries to call AgentCore Gateway
↓
AgentCore call fails (network, credentials, etc.)
↓
Local-tools throws error: "AgentCore Gateway Request Failed"
↓
Banking agent receives error
↓
User hears error message
↓
Logs show clear error ✅
```

## Benefits

### 1. Clear Error Messages

**Before:**
```
[LocalTools] AgentCore call failed: fetch failed
[LocalTools] Falling back to local implementation
[LocalTools] Using FALLBACK balance implementation
```
Result: User sees fake data, no indication of problem ❌

**After:**
```
[LocalTools] AgentCore call failed: fetch failed
[LocalTools] Tool execution error: AgentCore Gateway Request Failed
```
Result: Clear error, immediate visibility of problem ✅

### 2. Fail Fast

- No silent failures
- No hidden issues
- Immediate feedback when something is wrong
- Easier debugging

### 3. Production-Ready

- Forces proper configuration
- No accidental use of mock data in production
- Clear separation: AgentCore tools MUST use AgentCore

## Error Scenarios

### Scenario 1: Missing Credentials

```
Error: AgentCore credentials not configured. Cannot execute agentcore_balance. 
Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.
```

**Fix:** Add credentials to `.env` file

### Scenario 2: Wrong Gateway URL

```
Error: AgentCore Gateway Request Failed (TypeError: Invalid URL)
```

**Fix:** Set correct HTTPS URL in `AGENTCORE_GATEWAY_URL`

### Scenario 3: Network Failure

```
Error: AgentCore Gateway Request Failed (fetch failed)
```

**Fix:** Check network connectivity, firewall, VPN

### Scenario 4: Invalid Credentials

```
Error: AgentCore Gateway Request Failed (403 Forbidden)
```

**Fix:** Verify AWS credentials are correct and have proper permissions

## Files Modified

1. **local-tools/src/server.ts**
   - Removed fallback logic in `executeTool()`
   - Deleted `executeIDVCheck()` function
   - Deleted `executeGetBalance()` function
   - Deleted `executeGetTransactions()` function
   - Updated startup messages
   - Added clear error when credentials missing

## Testing

### Test 1: Verify AgentCore Works

```bash
curl -X POST http://localhost:9000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"agentcore_balance","input":{"accountId":"12345678","sortCode":"112233"}}'
```

**Expected:** Real balance from AgentCore (£1,200.00)

### Test 2: Verify No Fallback

Break the AgentCore URL temporarily:
```bash
# In .env, change to invalid URL
AGENTCORE_GATEWAY_URL=https://invalid-url.example.com
```

Restart and test:
```bash
curl -X POST http://localhost:9000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"agentcore_balance","input":{"accountId":"12345678","sortCode":"112233"}}'
```

**Expected:** Clear error (NOT mock data)
```json
{
  "success": false,
  "error": "AgentCore Gateway Request Failed..."
}
```

### Test 3: End-to-End Journey

```bash
./restart-local-services.sh
```

Say: "I want to check my balance"

**Expected:**
- If AgentCore working: Real balance (£1,200.00)
- If AgentCore broken: Clear error message

**NOT Expected:**
- Mock balance (£1,234.56) ❌
- Silent fallback ❌

## Logs to Watch

```bash
# Should see this on startup
tail -f logs/local-tools.log | grep "AgentCore"

# Expected:
[LocalTools] ✅ AgentCore credentials available - will use AgentCore Gateway
[LocalTools] ⚠️  NO FALLBACK DATA - AgentCore failures will throw errors

# When tool is called:
[LocalTools] Calling AgentCore Gateway for agentcore_balance...
[LocalTools] AgentCore response status: 200
[LocalTools] AgentCore result: {...}

# If it fails:
[LocalTools] AgentCore call failed: [error details]
[LocalTools] Tool execution error: [error message]
```

## Success Criteria

✅ No fallback functions exist  
✅ No mock data returned  
✅ AgentCore failures throw clear errors  
✅ Startup messages indicate no fallback  
✅ Logs show real errors (not silent fallback)  
✅ Real data from AgentCore when working  
✅ Clear error messages when broken  

## Important Notes

### Built-in Tools Still Work

These tools don't need AgentCore and still work:
- `calculator`
- `string_formatter`
- `date_formatter`

### Only Banking Tools Require AgentCore

These tools MUST use AgentCore (no fallback):
- `perform_idv_check`
- `agentcore_balance`
- `get_account_transactions`

### Configuration Required

For banking tools to work, you MUST have:
1. ✅ Valid AWS credentials in `.env`
2. ✅ Correct `AGENTCORE_GATEWAY_URL` (HTTPS URL, not ARN)
3. ✅ Network access to AgentCore Gateway
4. ✅ Proper IAM permissions

## Summary

**Before:** Silent failures, mock data, hidden issues ❌  
**After:** Fail fast, clear errors, real data only ✅

No more guessing if AgentCore is working - you'll know immediately! 🎉
