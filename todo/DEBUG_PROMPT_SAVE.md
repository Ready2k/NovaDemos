# 🔍 Debug Guide - Prompt Save Not Working

## Quick Debug Steps

### 1. Open Browser Console
- **Mac**: `Cmd + Option + J`
- **Windows/Linux**: `Ctrl + Shift + J`

### 2. Test Save Prompt

1. **Edit** the pirate prompt
2. **Click Save** button (💾 Save)
3. **Watch console** for these logs:

#### Expected Logs:
```
[Frontend] Saving and syncing prompt: persona-pirate.txt...
[Frontend] Prompt saved successfully
```

#### If You See:
- **No logs** → Save button not working (JavaScript error?)
- **"Failed to save/sync prompt"** → Server error
- **Logs but no version** → PromptService not working

### 3. Check Network Tab

1. **Open Network tab** in DevTools
2. **Click Save**
3. **Look for** `/api/prompts/persona-pirate.txt?sync=true`

#### Check:
- **Status**: Should be `200 OK`
- **Response**: Should include `version` number
- **Request URL**: Should have `?sync=true`

### 4. Check Server Logs

```bash
tail -f tests/logs/server.log | grep -i "prompt\|save\|sync"
```

#### Expected:
```
[Server] Saved prompt to .../persona-pirate.txt
[PromptService] Creating new version of prompt 'persona-pirate'...
[PromptService] Created version 2 of prompt 'persona-pirate'
```

---

## Common Issues

### Issue 1: Save Button Disabled
**Symptom**: Can't click Save button  
**Cause**: No changes detected  
**Fix**: Make a change to the prompt text

### Issue 2: Browser Cache
**Symptom**: Old JavaScript running  
**Fix**: Hard refresh (`Cmd+Shift+R`)

### Issue 3: PromptService Not Initialized
**Symptom**: Server error in logs  
**Fix**: Restart server (already done)

### Issue 4: Wrong Button
**Symptom**: Clicking Sync instead of Save  
**Clarification**:
- **Sync button** (🔄 Sync) = Syncs ALL prompts
- **Save button** (💾 Save) = Saves CURRENT prompt

---

## Test Script

Paste this in browser console to test:

```javascript
// Check if savePrompt function exists
console.log('savePrompt exists:', typeof app.savePrompt === 'function');

// Check current prompt ID
console.log('Current prompt:', app.promptPresetSelect?.value);

// Check if Save button is enabled
const saveBtn = document.getElementById('save-btn');
console.log('Save button disabled:', saveBtn?.disabled);

// Manually trigger save (if button is enabled)
if (!saveBtn?.disabled) {
  console.log('Triggering save...');
  app.savePrompt();
}
```

---

## Manual Test

If automatic save doesn't work, test the API directly:

```bash
# From terminal
curl -X POST 'http://localhost:8080/api/prompts/test-prompt.txt?sync=true' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Test prompt content","config":{}}'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Prompt saved and synced to Langfuse as version 1",
  "version": 1
}
```

---

## Next Steps

1. **Run the test script** in browser console
2. **Check network tab** when clicking Save
3. **Share the console output** if still not working
4. **Check if it's the Sync button** vs Save button confusion

---

**Most Likely Issue**: Browser cache - try hard refresh first!
