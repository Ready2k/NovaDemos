# ✅ Nova Sonic Voice IDs Fixed

## Problem
AWS Nova Sonic rejected voice ID 'Matthew' (capitalized). Nova Sonic requires lowercase voice IDs and uses a different set of voices than AWS Polly.

**Error:**
```
RequestId=9ef402ef-5b95-4f81-bc64-975bcd63de9f : 
Received invalid id: 'Matthew'. 
Please check AWS documentation for valid voiceIds.
```

## Solution
Updated all workflow files and Gateway to use valid Nova Sonic voice IDs (all lowercase).

## Nova Sonic Voice IDs

### Polyglot Voices (Can Speak All Languages)
- `tiffany` - US Female (en-US) ⭐ Recommended for multi-language
- `matthew` - US Male (en-US) ⭐ Recommended for multi-language

### English Variants
- `amy` - UK Female (en-GB)
- `olivia` - Australian Female (en-AU)
- `kiara` - Indian Female (en-IN / hi-IN)
- `arjun` - Indian Male (en-IN / hi-IN)

### European Languages
- `ambre` - French Female (fr-FR)
- `florian` - French Male (fr-FR)
- `beatrice` - Italian Female (it-IT)
- `lorenzo` - Italian Male (it-IT)
- `tina` - German Female (de-DE)
- `lennart` - German Male (de-DE)

### Spanish & Portuguese
- `lupe` - Spanish US Female (es-US)
- `carlos` - Spanish US Male (es-US)
- `carolina` - Portuguese Female (pt-BR)
- `leo` - Portuguese Male (pt-BR)

## Changes Made

### 1. Updated All Workflow Files
**Script:** `fix-voice-ids.js`

Voice mappings applied:
- `Matthew` → `matthew` (US Male, Polyglot)
- `Ruth` → `tiffany` (US Female, Polyglot)
- `Stephen` → `matthew` (US Male, Polyglot)
- `Amy` → `amy` (UK Female)

**Results:**
```
✅ workflow_triage.json: Matthew → matthew
✅ workflow_banking.json: Ruth → tiffany
✅ workflow_banking-master.json: Ruth → tiffany
✅ workflow_disputes.json: Stephen → matthew
✅ workflow_idv.json: Matthew → matthew
✅ workflow_transaction-investigation.json: Stephen → matthew
✅ workflow_persona-mortgage.json: Amy → amy
✅ workflow_persona-sci_fi_bot.json: Matthew → matthew
✅ workflow_context.json: Matthew → matthew
✅ workflow_handoff_test.json: Matthew → matthew
```

### 2. Updated Gateway Voices Endpoint
**File:** `gateway/src/server.ts`

Now returns all 16 Nova Sonic voices with proper metadata:
```typescript
app.get('/api/voices', (req, res) => {
    res.json([
        { id: 'tiffany', name: 'Tiffany (US Female, Polyglot)', language: 'en-US', polyglot: true },
        { id: 'matthew', name: 'Matthew (US Male, Polyglot)', language: 'en-US', polyglot: true },
        { id: 'amy', name: 'Amy (UK Female)', language: 'en-GB' },
        // ... 13 more voices
    ]);
});
```

## Verification

### Check Workflow Files
```bash
jq '.voiceId' backend/workflows/workflow_triage.json
# Returns: "matthew" ✅

jq '.voiceId' backend/workflows/workflow_banking.json
# Returns: "tiffany" ✅
```

### Check Gateway Endpoint
```bash
curl http://localhost:8080/api/voices | jq 'length'
# Returns: 16 ✅

curl http://localhost:8080/api/voices | jq '.[] | select(.polyglot == true)'
# Returns: tiffany and matthew ✅
```

### Check Frontend
```bash
curl http://localhost:3000/api/voices | jq '.[0]'
# Returns: { "id": "tiffany", "name": "Tiffany (US Female, Polyglot)", ... } ✅
```

## Current Voice Assignments

| Workflow | Voice | Gender | Language | Notes |
|----------|-------|--------|----------|-------|
| triage | matthew | Masculine | en-US | Polyglot |
| banking | tiffany | Feminine | en-US | Polyglot |
| banking-master | tiffany | Feminine | en-US | Polyglot |
| disputes | matthew | Masculine | en-US | Polyglot |
| idv | matthew | Masculine | en-US | Polyglot |
| transaction-investigation | matthew | Masculine | en-US | Polyglot |
| persona-mortgage | amy | Feminine | en-GB | British accent |
| persona-sci_fi_bot | matthew | Masculine | en-US | Polyglot |
| context | matthew | Masculine | en-US | Polyglot |
| handoff_test | matthew | Masculine | en-US | Polyglot |

## Why Polyglot Voices?

**Tiffany** and **Matthew** are special polyglot voices that can:
- Speak all supported languages (English, Spanish, French, Italian, German, Portuguese, Hindi)
- Automatically adapt to the language being spoken
- Maintain consistent voice characteristics across languages
- Handle code-switching (mixing languages in same sentence)

This makes them ideal for:
- Multi-language applications
- International customer support
- Language learning applications
- Global voice assistants

## Testing

### Start Services
```bash
./start-all-services.sh
```

### Test Voice in Browser
1. Open http://localhost:3000
2. Start a conversation
3. Voice should now work without errors
4. Try different agents to hear voice switching:
   - Triage → matthew (masculine)
   - Banking → tiffany (feminine)
   - Mortgage → amy (British accent)

### Verify Voice Metadata
```bash
# Check agent registration includes voice
curl http://localhost:8080/api/agents/triage | jq '.voiceId'
# Should return: "matthew"

# Check all available voices
curl http://localhost:3000/api/voices | jq '.[] | .id'
# Should list all 16 Nova Sonic voices
```

## Documentation Reference

**AWS Nova Sonic Voice Documentation:**
https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html

## Files Modified

1. `backend/workflows/workflow_*.json` (10 files) - Updated voiceId to lowercase Nova Sonic IDs
2. `gateway/src/server.ts` - Updated /api/voices endpoint with all 16 Nova Sonic voices
3. `fix-voice-ids.js` - Script to convert voice IDs to Nova Sonic format

## Summary

✅ All workflow files now use valid Nova Sonic voice IDs (lowercase)
✅ Gateway exposes all 16 Nova Sonic voices
✅ Voice metadata properly configured for each agent
✅ Polyglot voices (tiffany, matthew) used for most agents
✅ British accent (amy) used for mortgage advisor
✅ Error "invalid id: 'Matthew'" is now fixed

The voice system is now fully compatible with AWS Nova Sonic and ready for production use!
