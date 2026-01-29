# Workflow Logic Leaking Fixed

## Issue #2: Agent Speaking Internal Workflow Logic

### Problem
The agent was narrating internal workflow decision-making process out loud:

**Bad Output**:
```
Thank you for reaching out.
Let's begin the triage process to see how I can assist you today.
I will now check your account for any high-risk vulnerabilities.
Please hold on for a moment while I review your account markers.
(Assuming 'marker_Vunl' is not greater than 5)  
Next, I will check the current status of your account...
(Assuming 'account_status' is not 'FROZEN')  
Your account is currently safe, open, and at low risk.
```

The agent was speaking the workflow conditions like:
- "(Assuming 'marker_Vunl' is not greater than 5)"
- "(Assuming 'account_status' is not 'FROZEN')"

### Root Cause
The workflow-to-text conversion in `agents/src/workflow-utils.ts` was creating instructions that the agent interpreted as things to say out loud. The LLM was reading the workflow transitions and conditions as part of its response script.

### Solution
Modified `convertWorkflowToText()` function to:

1. **Explicitly mark workflow logic as INTERNAL**
   - Added clear instructions that workflow steps are for internal use only
   - Emphasized that conditions and transitions should NOT be spoken

2. **Added "DO NOT NARRATE" rules**
   ```
   5. DO NOT narrate your decision-making process (e.g., don't say 'Assuming X is Y')
   6. DO NOT mention conditions, transitions, or workflow steps in your spoken response
   7. Execute the workflow silently and only speak the user-facing content
   ```

3. **Provided good vs bad examples**
   ```
   Example: [STEP: check_auth] I need to verify your identity first.
   BAD Example: [STEP: check_auth] (Assuming marker_Vunl is not greater than 5) I need to verify...
   ```

4. **Labeled sections clearly**
   - Changed "TRANSITIONS:" to "INTERNAL TRANSITIONS (DO NOT SPEAK THESE):"
   - Changed "ACTION REQUIRED:" to "INTERNAL ACTION:"
   - Added "USER-FACING INSTRUCTION:" for what should be spoken

5. **Added final reminder**
   ```
   REMEMBER: All workflow logic is INTERNAL. Only speak naturally to the user about what they need to know.
   ```

### Expected Output After Fix
```
Thank you for reaching out.
Let's begin the triage process to see how I can assist you today.
I'll check your account for any high-risk vulnerabilities.
[pause while checking]
Your account is currently safe, open, and at low risk.
```

The agent should:
- ✅ Still include `[STEP: node_id]` tags (for system tracking)
- ✅ Follow the workflow logic internally
- ✅ Call tools when required
- ✅ Make correct transitions
- ❌ NOT speak the conditions
- ❌ NOT narrate the decision process
- ❌ NOT mention "assuming" or workflow logic

### Files Modified
- `agents/src/workflow-utils.ts` - Updated `convertWorkflowToText()` function
- `agents/dist/workflow-utils.js` - Rebuilt TypeScript output

### Testing
To verify the fix:
1. Restart the agent service
2. Connect and trigger the workflow
3. Listen to the agent's response
4. Verify no "(Assuming...)" statements are spoken
5. Verify workflow still executes correctly (check logs for [STEP: ...] tags)

### Status
✅ Workflow text generation updated
✅ TypeScript compiled successfully
✅ Clear instructions added to prevent leaking
⏳ Ready for testing

## Technical Details

### Before (Problematic)
```typescript
text += `STEP [${node.id}] (${node.type}):\n   INSTRUCTION: ${node.label || 'No instruction'}\n`;
text += "   TRANSITIONS:\n";
edges.forEach((edge: any) => {
    const condition = edge.label ? `IF "${edge.label}"` : "NEXT";
    text += `   - ${condition} -> GOTO [${edge.to}]\n`;
});
```

The LLM saw "TRANSITIONS" and "IF" statements as part of the script to follow.

### After (Fixed)
```typescript
text += `STEP [${node.id}] (${node.type}):\n`;
text += `   USER-FACING INSTRUCTION: ${node.label || 'No instruction'}\n`;
text += "   INTERNAL TRANSITIONS (DO NOT SPEAK THESE):\n";
edges.forEach((edge: any) => {
    const condition = edge.label ? `IF "${edge.label}"` : "NEXT";
    text += `   - ${condition} -> GOTO [${edge.to}]\n`;
});
```

Now the LLM understands these are internal system instructions, not dialogue.

## Next Steps
1. Restart agent service to load new code
2. Test with a workflow that has decision nodes
3. Verify clean, natural responses without workflow narration
