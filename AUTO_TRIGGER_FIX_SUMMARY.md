# Auto-Trigger Tool Calling Fix - Applied

## Problem
Agents were waiting for user confirmation before calling tools, requiring manual "nudging" at each step:
1. Triage: Said "I need to verify..." instead of calling `transfer_to_idv`
2. IDV: Said "Let me verify..." instead of calling `perform_idv_check`
3. Banking: Said "Let me check..." instead of calling `agentcore_balance`

## Root Cause
Nova 2 Lite model prefers to be conversational and explain actions before taking them, despite prompt instructions to call tools immediately.

## Solutions Applied

### 1. Enhanced Prompt Engineering

**Triage Agent** (`gateway/prompts/persona-triage.txt`):
- Added explicit "ABSOLUTELY NO TEXT - ONLY THE TOOL CALL" instructions
- Multiple examples showing CORRECT (tool only) vs WRONG (text first) behavior
- Emphasized: "DO NOT say 'I need to verify' - JUST CALL THE TOOL"

**IDV Agent** (`gateway/prompts/persona-idv-simple.txt`):
- Added "ABSOLUTELY NO TEXT RESPONSE - ONLY CALL THE TOOL" section
- Explicit examples: "DO NOT say 'Let me verify those details now' - JUST CALL THE TOOL"
- Clear instruction: Tool first, then respond with result

**Banking Agent** (`gateway/prompts/persona-BankingDisputes.txt`):
- Updated "TOOL EXECUTION PROTOCOL" with "NO TEXT BEFORE TOOL CALLS"
- Added examples showing immediate tool calls without text
- Emphasized: "When you have all info needed, CALL THE TOOL - do not say 'Let me check'"

### 2. Force Tool Usage with `toolChoice` Parameter

**Location**: `agents/src/agent-core.ts` (lines 430-475)

**What Changed**:
Added intelligent detection to force tool usage in specific scenarios:

```typescript
const hasNumbers = /\d{6,}/.test(userMessage); // Detects credentials
const shouldForceToolUse = 
    // Triage: User asking for account-specific info
    (this.agentId === 'triage' && 
     (userMessage.includes('balance') || userMessage.includes('transaction') || ...)) ||
    // IDV: User provided credentials (numbers detected)
    (this.agentId === 'idv' && hasNumbers) ||
    // Banking: User asking for balance/transactions
    (this.agentId === 'banking' && 
     (userMessage.includes('balance') || userMessage.includes('transaction')));

// Apply toolChoice parameter
toolConfig: {
    tools: [...],
    toolChoice: shouldForceToolUse ? { any: {} } : { auto: {} }
}
```

**How It Works**:
- `toolChoice: { auto: {} }` - Model decides whether to use tools (default)
- `toolChoice: { any: {} }` - Model MUST use a tool (forced)
- Logs: `🔧 Forcing tool usage with toolChoice: any` when triggered

### 3. Tool Result Feedback Loop (Already Fixed)

**Location**: `agents/src/text-adapter.ts` (lines 227-268)

Ensures tool results are added to conversation history so agent doesn't repeat tool calls.

## Expected Behavior After Fix

### Scenario 1: Triage → IDV Transfer
```
User: "What's my balance?"
[Agent IMMEDIATELY calls transfer_to_idv - NO TEXT]
[Handoff to IDV agent]
```

### Scenario 2: IDV Verification
```
User: "12345678 112233"
[Agent IMMEDIATELY calls perform_idv_check - NO TEXT]
[After tool returns]
Agent: "Thank you, Sarah Jones. Your identity is verified..."
```

### Scenario 3: Banking Balance Check
```
User: "What's my balance?"
[Agent IMMEDIATELY calls agentcore_balance - NO TEXT]
[After tool returns]
Agent: "Your current account balance is £1,200.00 GBP..."
```

## Testing Instructions

1. Refresh `http://localhost:3000/agent-test`
2. Ensure "Gateway Routing" is ON (green)
3. Click "Connect"
4. Type: "Hi there, what's my balance"
5. Should see tool call immediately (no "I need to verify" text)
6. When IDV asks for credentials, provide: `12345678 112233`
7. Should see tool call immediately (no "Let me verify" text)
8. Should see balance immediately (no "Let me check" text)

## What to Look For in Logs

**Success indicators**:
```
[AgentCore:triage] 🔧 Forcing tool usage with toolChoice: any
[AgentCore:triage] Claude requested tool: transfer_to_idv
```

```
[AgentCore:idv] 🔧 Forcing tool usage with toolChoice: any
[AgentCore:idv] Claude requested tool: perform_idv_check
```

```
[AgentCore:banking] 🔧 Forcing tool usage with toolChoice: any
[AgentCore:banking] Claude requested tool: agentcore_balance
```

## Files Modified

1. `agents/src/agent-core.ts` - Added toolChoice logic with intelligent detection
2. `gateway/prompts/persona-triage.txt` - Enhanced tool calling instructions
3. `gateway/prompts/persona-idv-simple.txt` - Enhanced tool calling instructions
4. `gateway/prompts/persona-BankingDisputes.txt` - Enhanced tool calling instructions

## Status

✅ Prompt engineering enhanced (all 3 agents)
✅ toolChoice parameter added with smart detection
✅ TypeScript compiled successfully
✅ Docker images rebuilt
✅ Services redeployed and healthy
✅ Ready for testing

## Fallback Plan

If `toolChoice: { any: {} }` is too aggressive (forces tool use when not appropriate), we can:
1. Make the detection logic more specific
2. Use `toolChoice: { tool: { name: "specific_tool" } }` to force a specific tool
3. Fall back to prompt engineering only
4. Consider switching to a more tool-friendly model (Claude Sonnet 3.5)
