# User Intent Fix - Context Passing Through Handoffs

## Problem

After IDV verification, the Banking agent was greeting the user with "Welcome to our banking services. How can I assist you today?" instead of immediately helping with their balance check request.

The verified user information (name, account) was being passed correctly ✅, but the **original user intent** (that they wanted to check their balance) was being lost ❌.

## Root Cause

The handoff chain was:
1. Triage → IDV: Passed reason "User needs identity verification for balance check" ✅
2. IDV → Banking: Only passed "Verified user: Sarah Johnson, Account: 12345678" ❌
3. Banking received verified user but NOT the original intent

## Solution

### 1. Store User Intent in Session Memory (gateway/src/server.ts)

When processing handoff requests, extract and store the user intent from the handoff reason:

```typescript
if (message.context.reason) {
    updates.userIntent = message.context.reason;
    console.log(`[Gateway] Storing user intent: ${message.context.reason}`);
}
```

### 2. Updated SessionMemory Interface (gateway/src/session-router.ts)

Added `userIntent` field to track the original user request:

```typescript
export interface SessionMemory {
    // ... existing fields
    userIntent?: string;  // Original user request (e.g., "User needs balance check")
    lastUserMessage?: string;
}
```

### 3. Inject User Intent into System Prompt (agents/src/agent-runtime-s2s.ts)

When Banking agent receives session_init with memory, inject the userIntent into the system prompt:

```typescript
if (message.memory && message.memory.userIntent && AGENT_ID !== 'triage') {
    contextInjection = `

### CURRENT SESSION CONTEXT ###

**User Intent:** ${message.memory.userIntent}
**Verified User:** ${message.memory.verified ? 'Yes' : 'No'}
**Customer Name:** ${message.memory.userName}
**Account:** ${message.memory.account}
**Sort Code:** ${message.memory.sortCode}

**IMPORTANT:** The user has already stated their request. Act on the User Intent immediately - do NOT ask "How can I help you?"

`;
}
```

### 4. Updated Banking Agent Prompt (backend/prompts/persona-banking.txt)

Updated the Banking agent to:
- Check for userIntent in session context
- Act on the intent immediately
- NOT ask "How can I help you?" - be proactive!

Example:
```
[Handoff with userIntent="User needs identity verification for balance check"]
Agent: "Hello Sarah, let me fetch your balance for you..."
[Immediately calls agentcore_balance]
```

## Data Flow

```
User: "I want to check my balance"
  ↓
Triage: Calls transfer_to_idv
  → reason: "User needs identity verification for balance check"
  ↓
Gateway: Stores in session memory
  → memory.userIntent = "User needs identity verification for balance check"
  ↓
IDV: Verifies user
  → Stores verified user data
  → Calls transfer_to_banking
  ↓
Gateway: Retrieves session memory
  → memory includes: userIntent, verified, userName, account, sortCode
  → Passes ALL memory to Banking agent in session_init
  ↓
Banking: Receives session_init with memory
  → Injects userIntent into system prompt
  → System prompt now includes:
     "User Intent: User needs identity verification for balance check"
     "Customer Name: Sarah Johnson"
     "Account: 12345678"
  → Nova Sonic sees this context and acts on it
  ↓
Banking: "Hello Sarah, let me fetch your balance for you..."
  → Immediately calls agentcore_balance
  → No need to ask what they want!
```

## Expected Behavior Now

### Before Fix ❌
```
Banking: "Hello! Welcome to our banking services. How can I assist you today?"
User: "I want to check my balance" (has to repeat themselves)
Banking: "Let me fetch that for you..."
```

### After Fix ✅
```
Banking: "Hello Sarah, let me fetch your balance for you..."
[Immediately calls agentcore_balance]
Banking: "Your current balance is £1,234.56"
```

## Files Modified

1. **gateway/src/server.ts**
   - Store userIntent from handoff reason in session memory

2. **gateway/src/session-router.ts**
   - Added userIntent field to SessionMemory interface

3. **agents/src/agent-runtime-s2s.ts**
   - Inject userIntent into system prompt when available
   - Add session context section with all relevant info

4. **backend/prompts/persona-banking.txt**
   - Updated to check for and act on userIntent
   - Be proactive instead of asking "How can I help?"

## Testing

Restart services:
```bash
./restart-local-services.sh
```

Test journey:
1. Say: "I want to check my balance"
2. Triage routes to IDV
3. Provide: Account 12345678, Sort Code 112233
4. IDV verifies: "Great, Sarah. You've been verified"
5. Banking should say: "Hello Sarah, let me fetch your balance for you..." (NOT "How can I help?")
6. Banking immediately fetches balance

## Log Verification

**Gateway storing intent:**
```bash
tail -f logs/gateway.log | grep "Storing user intent"
# Expected: [Gateway] Storing user intent: User needs identity verification for balance check
```

**Banking agent receiving context:**
```bash
tail -f logs/agent-banking.log | grep "Injecting session context"
# Expected: [Agent:persona-SimpleBanking] Injecting session context with userIntent: User needs...
```

## Success Criteria

✅ Triage passes user intent in handoff reason  
✅ Gateway stores userIntent in session memory  
✅ Banking agent receives userIntent in session_init  
✅ Banking agent injects userIntent into system prompt  
✅ Banking agent acts on intent immediately  
✅ Banking agent does NOT ask "How can I help you?"  
✅ User does NOT have to repeat their request  

The user intent now flows through the entire handoff chain! 🎉
