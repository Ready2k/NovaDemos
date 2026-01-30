# Banking Tools AgentCore Integration Fix

## Problem Identified

Nova Sonic was calling banking tools (`verify_account`, `get_balance`, `get_transactions`) but with **empty parameters `{}`**, causing errors:
```
[Agent:idv] Tool input: {}
[BankingTools] Executing verify_account with input: {}
TypeError: Cannot read properties of undefined (reading 'length')
```

## Root Cause

1. **Wrong Architecture**: Banking tools were implemented as local mock functions instead of AgentCore tools
2. **Tool Mismatch**: Using `verify_account` instead of the actual AgentCore tool `perform_idv_check`
3. **Local Execution**: Agent was trying to execute banking tools locally instead of letting AgentCore handle them

## Solution Applied

### 1. Load Tools from AgentCore Definitions

**File: `agents/src/banking-tools.ts`**
- Changed from mock implementations to loading from `backend/tools/*.json`
- Now loads:
  - `perform_idv_check.json` - Identity verification (AgentCore)
  - `agentcore_balance.json` - Account balance (AgentCore)
  - `agentcore_transactions.json` - Transaction history (AgentCore)

### 2. Remove Local Execution

**File: `agents/src/agent-runtime-s2s.ts`**
- Banking tools are NO LONGER executed locally
- Nova Sonic executes them via `agentCoreRuntimeArn`
- Agent just logs the tool call for debugging

```typescript
if (isBankingTool(toolName)) {
    console.log(`[Agent:${AGENT_ID}] 💰 BANKING TOOL: ${toolName}`);
    console.log(`[Agent:${AGENT_ID}] This tool is executed via AgentCore`);
    // Nova Sonic handles execution via agentCoreRuntimeArn
    break;
}
```

### 3. Update IDV Agent Prompt

**File: `backend/prompts/persona-idv.txt`**
- Changed tool name: `verify_account` → `perform_idv_check`
- Updated parameter names: `account` → `accountNumber`
- Added explicit instructions for extracting numbers from speech
- Updated examples to show AgentCore tool usage

### 4. Tool Configuration

**AgentCore ARN** (already configured):
```
AGENT_CORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:388660028061:runtime/BankingCoreRuntime_http_v1-aIECoiHAgv
```

**Tool Definitions** (already exist):
- `backend/tools/perform_idv_check.json` - IDV verification
- `backend/tools/agentcore_balance.json` - Balance retrieval
- `backend/tools/agentcore_transactions.json` - Transaction history

## Expected Flow Now

### IDV Agent Journey:
```
1. User: "I want to check my balance"
   ↓
2. Triage: "Let me verify your identity first"
   [Calls transfer_to_idv tool]
   ↓
3. IDV: "For authentication, please provide your 8-digit account number and 6-digit sort code"
   ↓
4. User: "12345678 and 112233"
   ↓
5. IDV: "Let me check that for you..."
   [Calls perform_idv_check via AgentCore with accountNumber="12345678", sortCode="112233"]
   ↓
6. AgentCore: Executes IDV check, returns result
   ↓
7. IDV: "Great, Sarah. You've been verified. Let me connect you to our banking specialist."
   [Calls transfer_to_banking tool]
   ↓
8. Banking: "Let me fetch your balance..."
   [Calls agentcore_balance via AgentCore]
   ↓
9. AgentCore: Returns balance
   ↓
10. Banking: "Your balance is £1,234.56"
    [Calls return_to_triage tool]
```

## Key Changes

1. ✅ Banking tools loaded from AgentCore JSON definitions
2. ✅ Local execution removed - AgentCore handles it
3. ✅ Correct tool names: `perform_idv_check`, `agentcore_balance`, `get_account_transactions`
4. ✅ Correct parameter names: `accountNumber`, `sortCode`, `accountId`
5. ✅ IDV prompt updated with clear extraction instructions
6. ✅ AgentCore ARN configured in tool configuration

## Testing

Restart services and test:
```bash
./restart-local-services.sh
```

Test accounts:
- Account: 12345678, Sort Code: 112233, Name: Sarah Johnson
- Account: 87654321, Sort Code: 112233, Name: John Smith

## Next Steps

1. Restart services to load new tool definitions
2. Test IDV flow: User provides account details → IDV calls `perform_idv_check`
3. Verify AgentCore executes the tool (not local code)
4. Check that Nova Sonic receives the result from AgentCore
5. Confirm handoff to Banking agent works
6. Test Banking agent calling `agentcore_balance`
