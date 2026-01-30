# AgentCore Fix Applied - Tools Should Work Now!

## The Missing Piece
**AgentCore Runtime ARN** was not being passed in the `toolConfiguration`!

## What Was Wrong
We were sending tools to Nova Sonic like this:
```typescript
toolConfiguration: {
  tools: [...tools]
}
```

But for S2S with AgentCore, it needs to be:
```typescript
toolConfiguration: {
  tools: [...tools],
  agentCoreRuntimeArn: "arn:aws:bedrock-agentcore:..."  // ← MISSING!
}
```

## The Fix
**File:** `agents/src/sonic-client.ts`

Added AgentCore ARN to toolConfiguration:
```typescript
toolConfiguration: {
    tools: this.sessionConfig.tools,
    ...(this.config.agentCoreRuntimeArn ? {
        agentCoreRuntimeArn: this.config.agentCoreRuntimeArn
    } : {})
}
```

## Why This Matters
- **S2S mode uses AgentCore for tool execution**
- Tools are registered with AgentCore, not executed locally
- AgentCore ARN tells Nova Sonic WHERE to execute the tools
- Without it, Nova Sonic doesn't know how to call the tools!

## How to Test

1. **Restart services:**
   ```bash
   ./restart-local-services.sh
   ```

2. **Check logs for AgentCore ARN:**
   ```bash
   tail -f logs/agent.log | grep "AgentCore ARN"
   ```
   
   Should see:
   ```
   [SonicClient] AgentCore ARN: arn:aws:bedrock-agentcore:us-east-1:...
   ```

3. **Test the flow:**
   - Say: "I want to check my balance"
   - **EXPECTED:** Agent calls `transfer_to_idv` tool
   - **WATCH FOR:** `[Agent:triage] Tool called: transfer_to_idv`

4. **Watch for toolUse events:**
   ```bash
   tail -f logs/agent.log | grep -E "(toolUse|Tool called|HANDOFF)"
   ```

## Expected Journey

```
User: "I want to check my balance"
↓
Triage: "Sure, let me verify your identity first"
[CALLS: transfer_to_idv via AgentCore]
↓
IDV Agent: "For authentication, please provide your account number..."
```

## What Changed
- ✅ Added `agentCoreRuntimeArn` to `toolConfiguration`
- ✅ Added logging to confirm ARN is set
- ✅ Tools will now be executed via AgentCore

## If Still Not Working

Check:
1. **AgentCore ARN is set:**
   ```bash
   grep AGENT_CORE agents/.env
   ```

2. **AgentCore ARN is valid:**
   - Should be format: `arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/NAME`
   - Check AWS console for correct ARN

3. **Tools are registered in AgentCore:**
   - Tools must be registered in AWS Bedrock AgentCore
   - Tool names must match exactly

4. **AWS permissions:**
   - Agent needs permission to invoke AgentCore
   - Check IAM role/credentials

## Next Steps
If tools work now:
1. ✅ Test full journey (Triage → IDV → Banking → Triage)
2. ✅ Verify voice changes between agents
3. ✅ Test with real account numbers
4. ✅ Celebrate! 🎉

If tools still don't work:
1. Verify AgentCore ARN in logs
2. Check AWS console for AgentCore configuration
3. Verify tool registration in AgentCore
4. Check AWS CloudWatch logs for AgentCore errors
