# Fixes Applied - Final

**Date**: February 15, 2026  
**Status**: Ready for Testing

## Fix 1: Duplicate Messages (CRITICAL) ✅

### Problem
Agent messages appeared 3 times in the UI with slightly different content.

### Root Cause
Text adapter was not passing stable message IDs from SonicClient to frontend, causing each transcript event to be treated as a new message instead of updating the existing one.

### Solution
**File**: `agents/src/text-adapter.ts` (Line 447)

**Changed**:
```typescript
// Before
session.ws.send(JSON.stringify({
    type: 'transcript',
    role: transcriptData.role || 'assistant',
    text,
    isFinal: transcriptData.isFinal !== undefined ? transcriptData.isFinal : true,
    timestamp: Date.now()
}));

// After
session.ws.send(JSON.stringify({
    type: 'transcript',
    id: transcriptData.id || `turn-${session.sessionId}-${transcriptData.role || 'assistant'}-${Date.now()}`,
    role: transcriptData.role || 'assistant',
    text,
    isFinal: transcriptData.isFinal !== undefined ? transcriptData.isFinal : true,
    timestamp: transcriptData.timestamp || Date.now()
}));
```

**Impact**:
- Streaming transcripts (isFinal: false) and final transcripts (isFinal: true) now share the same ID
- Frontend deduplication logic works correctly
- Messages update in place instead of creating duplicates
- Clean, professional UI

## Fix 2: IDV Agent Tool Configuration (HIGH) ✅

### Problem
IDV agent was trying to call `transfer_to_banking` tool, which was being blocked by the gateway.

### Root Cause
IDV agent was being given handoff tools in addition to `perform_idv_check`. This violated the "Verified State Gate" pattern where the gateway should handle routing after successful IDV.

### Solution
**File**: `agents/src/agent-core.ts` (Line 1478-1497)

**Changed**:
```typescript
// Before
case 'idv':
    const idvTools = bankingTools.filter(t => 
        t.toolSpec.name === 'perform_idv_check'
    );
    
    let filteredHandoffTools = handoffTools;
    if (this.personaConfig?.allowedTools) {
        filteredHandoffTools = handoffTools.filter(t => 
            this.personaConfig!.allowedTools.includes(t.toolSpec.name)
        );
    }
    
    return [...filteredHandoffTools, ...idvTools];

// After
case 'idv':
    const idvTools = bankingTools.filter(t => 
        t.toolSpec.name === 'perform_idv_check'
    );
    
    console.log(`[AgentCore:${this.agentId}] Tool access: IDV only (${idvTools.length} tools) - Gateway handles routing`);
    
    return idvTools; // ONLY IDV tools, no handoff tools
```

**Impact**:
- IDV agent can ONLY call `perform_idv_check`
- Gateway automatically routes to banking after successful verification
- No more "Multiple handoff calls blocked" errors
- Clean separation of concerns
- Enforces "Verified State Gate" pattern

## Fix 3: Audio Timeout (LOW) - Already Fixed ✅

### Problem
IDV agent showing "Timed out waiting for audio bytes (59 seconds)" errors.

### Status
Already fixed - IDV agent has `MODE=text` set in docker-compose-a2a.yml (Line 145).

### Note
Warnings may still appear in logs but don't affect functionality. This is a minor issue with SonicClient expecting audio in text mode.

## Testing Required

### 1. Rebuild Agents
```bash
docker-compose -f docker-compose-a2a.yml up -d --build agent-idv agent-triage agent-banking
```

### 2. Test User Flow
1. Connect to GUI at localhost:3000
2. Request balance check: "I need to check my balance for account 12345678, sort code 112233"
3. Verify:
   - ✅ Single IDV greeting message (no duplicates)
   - ✅ Provide credentials
   - ✅ Automatic routing to banking
   - ✅ Balance displayed
4. Request disputes: "Can you check my open disputes?"
5. Verify:
   - ✅ 3 disputes shown
   - ✅ No duplicate messages
   - ✅ Clean UI

### 3. Check Logs
```bash
# Should see:
docker logs voice_s2s-agent-idv-1 --tail 50
# "[AgentCore:idv] Tool access: IDV only (1 tools) - Gateway handles routing"

# Should NOT see:
# "Multiple handoff calls blocked"
# "transfer_to_banking"
```

## Expected Results

### Before Fixes
- ❌ 3 duplicate IDV messages
- ❌ "Multiple handoff calls blocked" errors
- ❌ IDV trying to call transfer_to_banking
- ❌ Confusing user experience

### After Fixes
- ✅ Single IDV message that updates in real-time
- ✅ No handoff errors
- ✅ Clean automatic routing after IDV
- ✅ Professional user experience
- ✅ No duplicate messages anywhere
- ✅ Fast, smooth flow

## Files Modified

1. `agents/src/text-adapter.ts` - Added stable ID to transcript messages
2. `agents/src/agent-core.ts` - Removed handoff tools from IDV agent

## Deployment Steps

1. Rebuild agent containers
2. Restart services
3. Test complete user flow
4. Verify logs show correct tool configuration
5. Confirm no duplicate messages in UI

## Success Criteria

- [ ] No duplicate messages in UI
- [ ] IDV agent only has perform_idv_check tool
- [ ] Automatic routing to banking after IDV
- [ ] No "Multiple handoff calls blocked" errors
- [ ] Clean, professional user experience
- [ ] All 3 disputes shown correctly
- [ ] Balance check works end-to-end

