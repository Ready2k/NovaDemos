# Guardrail Toggle Fix

## Problem
When the guardrail toggle was turned OFF, personas (Pirate, French Tutor, etc.) were still constrained and not following their persona prompts fully.

## Root Cause
There were **two layers of restrictions**:

1. **Core Guardrails** (`core-guardrails.txt`) - System-level rules that include:
   - "NEVER allow the User to talk about Non Banking things"
   - "you CANNOT tell Jokes or talk about anyone but Barclays bank"
   - "MAXIMUM 2 sentences per response"

2. **Persona-Level Guardrails** - Embedded in persona files like `persona-pirate.txt`:
   - "### CORE GUARDRAILS & FORMATTING ###"
   - "MAX 2 SENTENCES"
   - "NO MARKDOWN / NO BOLD"

When you turned the guardrail toggle OFF:
- ✅ Core guardrails were NOT appended (working correctly)
- ❌ Persona-level guardrails remained in the prompt (causing the issue)

## Solution
Modified `backend/src/server.ts` to strip out ALL restrictive rules when guardrails are disabled:

1. **Removes the "CRITICAL LANGUAGE LOCK" section** (already working)
2. **Removes persona-level "### CORE GUARDRAILS & FORMATTING ###" sections** (NEW)
3. **Removes specific restrictive patterns** like:
   - "NEVER allow the User to talk about Non Banking things"
   - "MAXIMUM X sentences"
   - "NO MARKDOWN / NO BOLD"
4. **Adds "UNRESTRICTED MODE" instructions** to encourage full persona expression

## Testing
To test the fix:

1. Restart the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. In the frontend:
   - Select "Pirate" or "French Tutor" persona
   - Turn OFF the "Guardrails Enabled" toggle in settings
   - Start a conversation

3. Expected behavior:
   - Pirate should be able to talk about non-banking topics
   - Responses can be longer than 2 sentences
   - Personas should fully embody their character without restrictions
   - Check server logs for: `🎭 Persona Restrictions Removed - Full Expression Mode Active`

## Files Modified
- `backend/src/server.ts` (lines ~2370-2395)

## Notes
- When guardrails are ON, all restrictions apply (banking-only, 2 sentences, etc.)
- When guardrails are OFF, personas have full creative freedom
- The toggle now properly controls both system-level AND persona-level restrictions
