# Voice Mode Fixes - Complete

## Issues Fixed

### 1. Raw Nova Sonic Events Being Forwarded to Client ✅

**Problem**: Frontend was receiving raw Nova Sonic events with uppercase types like `TEXT`, `AUDIO`, `TOOL` which caused "Invalid JSON message format" errors.

**Root Cause**: The gateway was forwarding ALL messages from agents to the client without filtering, including internal Nova Sonic events that aren't part of the application's message protocol.

**Solution**:
- Added filtering in `gateway/src/server.ts` (line ~623) to detect and block raw Nova Sonic event types before forwarding to client
- Enhanced `agents/src/voice-sidecar.ts` default case logging to clarify that unknown events are not forwarded
- Added default case in `frontend-v2/app/agent-test/page.tsx` switch statement to gracefully ignore unknown message types

**Files Modified**:
- `gateway/src/server.ts` - Added raw event filtering before forwarding to client
- `agents/src/voice-sidecar.ts` - Improved logging for filtered events
- `frontend-v2/app/agent-test/page.tsx` - Added default case for unknown message types

---

### 2. Credentials Not Being Passed to Banking Agent ✅

**Problem**: Banking agent received `session_init` after IDV handoff but credentials were undefined, causing "issue finding your account" error.

**Root Cause**: In voice mode, user speech is transcribed by Nova Sonic and sent as `transcript` messages, not `text_input` messages. The gateway was only extracting credentials from `text_input` messages, so voice input credentials were never captured.

**Solution**:
- Added credential extraction from user transcript messages in `gateway/src/server.ts` (line ~445)
- Gateway now parses BOTH `text_input` (chat mode) AND `transcript` (voice mode) messages for account numbers and sort codes
- Credentials are stored in memory with both `account`/`sortCode` and `providedAccount`/`providedSortCode` keys
- Memory is updated and sent to agents via `memory_update` message after extraction

**Files Modified**:
- `gateway/src/server.ts` - Added credential extraction from user transcript messages

---

## How It Works Now

### Voice Mode Flow:

1. **User speaks**: "account number is one two three four five six seven eight"
2. **Intent Parser**: Converts spoken numbers to digits → "12345678"
3. **Gateway**: Extracts credentials from transcript message (role='user', isFinal=true)
4. **Memory Update**: Stores `account: "12345678"` and `providedAccount: "12345678"`
5. **IDV Verification**: Agent verifies credentials
6. **Auto-Route**: Gateway detects successful IDV and routes to banking agent
7. **Session Init**: Banking agent receives `session_init` with full memory including credentials
8. **Banking Operations**: Agent can now check balance, transactions, etc.

### Event Filtering:

1. **Nova Sonic**: Emits internal events (TEXT, AUDIO, TOOL, etc.)
2. **SonicClient**: Transforms to application events (transcript, audio, toolUse, etc.)
3. **Voice-Sidecar**: Filters unknown event types in handleSonicEvent
4. **Gateway**: Double-checks and filters raw Nova Sonic events before forwarding
5. **Frontend**: Receives only valid application messages, ignores unknown types gracefully

---

## Testing Instructions

### Test Voice Mode with Balance Check:

1. Start all services:
   ```bash
   ./start-agents-local.sh
   ```

2. Open browser: `http://localhost:3000/agent-test`

3. Select "Gateway → Triage Agent" and enable "Voice Mode"

4. Click "Connect" and speak:
   - "I want to check my balance"
   - Wait for IDV agent to ask for credentials
   - "account number is one two three four five six seven eight"
   - "sort code is one one two two three three"
   - Wait for verification and auto-handoff to banking
   - Banking agent should greet you and provide balance

### Expected Behavior:

- ✅ No "Invalid JSON message format" errors in console
- ✅ Credentials extracted from voice input and stored in memory
- ✅ IDV verification succeeds
- ✅ Auto-handoff to banking agent
- ✅ Banking agent has credentials and can check balance
- ✅ No raw Nova Sonic events (TEXT, AUDIO, TOOL) in frontend logs

### Check Gateway Logs:

Look for these log messages:
```
[Gateway] 🎤 User transcript (final): "account number is one two three four five six seven eight"
[Gateway] 🔍 Parsed user transcript: { accountNumber: '12345678', sortCode: null, intent: null }
[Gateway] 📋 Extracted account from voice: 12345678
[Gateway] 💾 Updating memory from voice transcript: { account: '12345678', providedAccount: '12345678', ... }
[Gateway] 📤 Memory after voice update: { account: '12345678', sortCode: '112233', ... }
[Gateway] ✅ Detected successful IDV. Syncing memory and triggering auto-route to banking.
[Gateway] 📋 Memory after update: { verified: true, userName: 'Sarah Jones', account: '12345678', sortCode: '112233' }
[Gateway] Sending session_init to banking with memory: {"verified":true,"userName":"Sarah Jones","account":"12345678","sortCode":"112233",...}
```

---

## Technical Details

### Credential Extraction Logic:

The `parseUserMessage` function in `gateway/src/intent-parser.ts`:
1. Converts spoken numbers to digits using `convertSpokenNumbersToDigits()`
2. Extracts account numbers (8 digits) and sort codes (6 digits) using regex patterns
3. Supports multiple formats: "account 12345678 sort code 112233", "12345678, 112233", etc.
4. Handles partial matches (just account OR just sort code)

### Event Filtering Logic:

The gateway filters raw Nova Sonic events by:
1. Parsing the message to check the `type` field
2. Checking if type is in the raw event list: `['TEXT', 'AUDIO', 'TOOL', 'CONTENT_START', 'CONTENT_END']`
3. Logging and returning early (not forwarding) if it's a raw event
4. Only forwarding valid application messages to the client

---

## Files Changed

1. `gateway/src/server.ts`
   - Added credential extraction from user transcript messages (voice mode)
   - Added raw Nova Sonic event filtering before forwarding to client

2. `agents/src/voice-sidecar.ts`
   - Improved logging for filtered unknown events

3. `frontend-v2/app/agent-test/page.tsx`
   - Added default case to handle unknown message types gracefully

---

## Next Steps

The voice mode should now work end-to-end:
- ✅ No JSON parsing errors
- ✅ Credentials extracted from voice input
- ✅ IDV verification works
- ✅ Auto-handoff to banking works
- ✅ Banking agent receives credentials
- ✅ Balance checks work in voice mode

Test the full flow and verify all logs show correct behavior!
