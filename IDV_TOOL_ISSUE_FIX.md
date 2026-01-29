# IDV Tool Issue - Banking Tools vs AgentCore

## Problem
IDV agent says "technical difficulties" instead of calling `verify_account` tool.

## Root Cause
**Banking tools (`verify_account`, `get_balance`, `get_transactions`) are being sent to AgentCore, but they're not registered there!**

When we pass `agentCoreRuntimeArn` in `toolConfiguration`, Nova Sonic tries to execute ALL tools via AgentCore. But our banking tools are mock implementations in local code, not registered in AgentCore.

## Current Setup
```typescript
toolConfiguration: {
  tools: [
    ...handoffTools,    // Should go to AgentCore
    ...bankingTools     // Should be handled locally ❌
  ],
  agentCoreRuntimeArn: "arn:..."  // Makes ALL tools go to AgentCore
}
```

## Solution Options

### Option 1: Register Banking Tools in AgentCore (RECOMMENDED)
Register `verify_account`, `get_balance`, `get_transactions` as AgentCore actions in AWS Bedrock.

**Pros:**
- Proper architecture
- Tools executed by AWS
- Scalable

**Cons:**
- Requires AWS setup
- More complex

### Option 2: Split Tools (QUICK FIX)
Send handoff tools to AgentCore, handle banking tools locally without AgentCore.

**Implementation:**
```typescript
// In sonic-client.ts
toolConfiguration: {
  tools: handoffTools,  // Only handoff tools
  agentCoreRuntimeArn: this.config.agentCoreRuntimeArn
}

// Banking tools handled separately via local execution
// (already implemented in agent-runtime-s2s.ts)
```

**Pros:**
- Quick fix
- Works immediately
- No AWS setup needed

**Cons:**
- Banking tools won't be visible to Nova Sonic
- Agent won't know it can call them
- Breaks the tool calling flow

### Option 3: Remove AgentCore for Now
Don't use AgentCore at all - handle ALL tools locally.

**Implementation:**
```typescript
toolConfiguration: {
  tools: [...handoffTools, ...bankingTools]
  // NO agentCoreRuntimeArn
}
```

**Pros:**
- Simple
- All tools work locally

**Cons:**
- Handoff tools also handled locally
- Not using AgentCore as intended

## Recommended Fix: Option 1

Register banking tools in AWS Bedrock AgentCore:

1. **Go to AWS Bedrock Console**
2. **Navigate to AgentCore**
3. **Register Actions:**
   - `verify_account` - Verify account and sort code
   - `get_balance` - Get account balance
   - `get_transactions` - Get recent transactions

4. **Configure Action Handlers:**
   - Point to Lambda functions or HTTP endpoints
   - Use our mock implementations

5. **Test:**
   - IDV agent should now be able to call `verify_account`
   - Tool will execute via AgentCore
   - Results returned to Nova Sonic

## Temporary Workaround: Option 3

Remove AgentCore ARN temporarily to test the flow:

```typescript
// In agents/src/sonic-client.ts
toolConfiguration: {
  tools: this.sessionConfig.tools
  // Comment out agentCoreRuntimeArn temporarily
}
```

This will make ALL tools execute locally, which should work for testing.

## Next Steps

1. **Immediate:** Test with Option 3 (no AgentCore) to verify flow works
2. **Short-term:** Implement Option 1 (register tools in AgentCore)
3. **Long-term:** All tools should be in AgentCore for production

## Test Command

```bash
# After fix, restart and test
./restart-local-services.sh

# Say: "I want to check my balance"
# Expected: IDV asks for account number
# Then: IDV calls verify_account tool
# Then: IDV transfers to Banking
```
