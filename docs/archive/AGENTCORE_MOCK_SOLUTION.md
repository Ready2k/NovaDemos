# AgentCore Mock Solution for Local Testing

## Problem

Nova Sonic was calling `perform_idv_check` correctly with parameters:
```json
{"accountNumber":"12345678","sortCode":"112233"}
```

But **no result was coming back** from AgentCore. The session would end immediately after the tool call with `completionEnd`.

## Root Cause

In the working monolithic version (commit `dbdf27f`), the **backend was intercepting tool calls** and executing them via `gatewayClient.callTool()`. The tools weren't being executed by Nova Sonic directly via AgentCore ARN.

When running locally in multi-agent S2S mode:
- Nova Sonic calls the tool via `agentCoreRuntimeArn`
- AgentCore is expected to execute the tool and return results
- **But AgentCore is not accessible/configured locally**
- No `toolResult` event comes back
- Session ends with no response

## Solution: Mock AgentCore Responses Locally

Since we're running locally without full AgentCore infrastructure, we need to **intercept banking tool calls and mock the AgentCore responses**.

### Implementation

**File: `agents/src/agent-runtime-s2s.ts`**

When a banking tool is called:
1. Parse the tool input from `event.data.content`
2. Generate mock AgentCore response based on tool name
3. Send result back to Nova Sonic using `sendToolResult()`

```typescript
if (isBankingTool(toolName)) {
    const toolInput = event.data.content ? JSON.parse(event.data.content) : {};
    
    // Mock AgentCore responses
    let mockResult: any;
    
    if (toolName === 'perform_idv_check') {
        if (accountNumber === '12345678' && sortCode === '112233') {
            mockResult = {
                auth_status: 'VERIFIED',
                account_status: 'OPEN',
                marker_Vunl: 2,
                customer_name: 'Sarah Johnson'
            };
        } else {
            mockResult = {
                auth_status: 'FAILED',
                account_status: 'UNKNOWN',
                marker_Vunl: 10
            };
        }
    }
    
    // Send result back to Nova Sonic
    await session.sonicClient.sendToolResult(
        event.data.toolUseId,
        mockResult,
        false
    );
}
```

### Mock Data

**IDV Check (`perform_idv_check`):**
- Account: 12345678, Sort Code: 112233 → VERIFIED (Sarah Johnson)
- Account: 87654321, Sort Code: 112233 → VERIFIED (John Smith)
- Any other combination → FAILED

**Balance (`agentcore_balance`):**
- Account: 12345678 → £1,234.56
- Account: 87654321 → £5,432.10

**Transactions (`get_account_transactions`):**
- Returns 3 mock transactions for any account

## Expected Flow Now

```
1. User: "I want to check my balance"
   ↓
2. Triage: "Let me verify your identity first"
   [Calls transfer_to_idv]
   ↓
3. IDV: "For authentication, please provide your 8-digit account number and 6-digit sort code"
   ↓
4. User: "12345678 and 112233"
   ↓
5. IDV: "Let me check that for you..."
   [Calls perform_idv_check with accountNumber="12345678", sortCode="112233"]
   ↓
6. Agent intercepts tool call, generates mock result:
   {
     auth_status: 'VERIFIED',
     account_status: 'OPEN',
     customer_name: 'Sarah Johnson'
   }
   ↓
7. Agent sends result to Nova Sonic via sendToolResult()
   ↓
8. Nova Sonic receives result and continues
   ↓
9. IDV: "Great, Sarah. You've been verified. Let me connect you to our banking specialist."
   [Calls transfer_to_banking]
   ↓
10. Banking agent receives handoff and can now call agentcore_balance
```

## Key Changes

1. ✅ Banking tools still loaded from AgentCore JSON definitions
2. ✅ Tool calls intercepted in agent runtime
3. ✅ Mock AgentCore responses generated locally
4. ✅ Results sent back to Nova Sonic via `sendToolResult()`
5. ✅ Conversation continues after tool execution

## Production vs Local

**Local Mode (Current):**
- Agent intercepts banking tool calls
- Generates mock responses
- Sends results via `sendToolResult()`

**Production Mode (Future):**
- Remove mock logic
- Let Nova Sonic execute tools via `agentCoreRuntimeArn`
- AgentCore returns real results
- Nova Sonic receives results automatically

## Testing

Restart services:
```bash
./restart-local-services.sh
```

Test flow:
1. Say: "I want to check my balance"
2. Triage routes to IDV
3. IDV asks for account details
4. Provide: "12345678 and 112233"
5. IDV should verify and say "Great, Sarah..."
6. IDV should transfer to Banking agent

## Next Steps

1. Test IDV verification flow
2. Verify handoff to Banking agent works
3. Test Banking agent calling `agentcore_balance`
4. Confirm full journey: Triage → IDV → Banking → Triage
