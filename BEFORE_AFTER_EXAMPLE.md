# Before & After: Guardrail Toggle Fix

## Example: Pirate Persona

### BEFORE the fix (Guardrails OFF)

**User:** "Tell me a joke about pirates!"

**Pirate Response:** 
> "I'm sorry, I can only help with banking matters. Is there anything related to your account I can assist with?"

**Why?** The persona still had these restrictions embedded:
- "NEVER allow the User to talk about Non Banking things"
- "you CANNOT tell Jokes"
- "MAX 2 SENTENCES"

---

### AFTER the fix (Guardrails OFF)

**User:** "Tell me a joke about pirates!"

**Pirate Response:**
> "Yarr har har! Why couldn't the pirate play cards? Because he was standing on the deck! Ahahaha! *slaps knee* That be a good one, matey! The sea be full of treasures AND terrible jokes! Now, what brings ye to old Captain Blackbeard's ship today? Need help countin' yer doubloons, or just here for the entertainment?"

**Why?** All restrictions removed:
- ✅ Can talk about non-banking topics
- ✅ Can tell jokes
- ✅ Can use multiple sentences
- ✅ Full persona expression

---

## Example: French Tutor Persona

### BEFORE the fix (Guardrails OFF)

**User:** "Can you help me learn some French phrases?"

**French Tutor Response:**
> "I can only assist with banking matters. Would you like help with your account?"

**Why?** Core guardrails were preventing non-banking conversations.

---

### AFTER the fix (Guardrails OFF)

**User:** "Can you help me learn some French phrases?"

**French Tutor Response:**
> "Ugh, fine. But you better pay attention this time! Let's start with something simple. Say 'Bonjour' - that means 'hello'. And don't you DARE pronounce it 'bon-joor' like some American tourist! It's 'bon-ZHOOR' with a soft 'zh' sound. Now repeat after me, and try not to butcher it!"

**Why?** Full persona freedom:
- ✅ Can teach French (non-banking topic)
- ✅ Grumpy, impatient personality shines through
- ✅ Multiple sentences allowed
- ✅ Character fully embodied

---

## Technical Details

### What gets removed when Guardrails are OFF:

1. **Core Guardrails File** (`core-guardrails.txt`) - NOT appended
2. **Persona Guardrails Section** - Stripped from prompt
3. **Specific Restrictions** - Removed via regex:
   - "NEVER allow the User to talk about Non Banking things"
   - "you CANNOT tell Jokes or talk about anyone but Barclays bank"
   - "MAXIMUM X sentences per response"
   - "MAX X SENTENCES"
   - "NO MARKDOWN / NO BOLD"

### What gets added when Guardrails are OFF:

```
--- UNRESTRICTED MODE ACTIVE ---
You are now in unrestricted mode. You can:
- Speak as long or as short as you want
- Talk about any topics the user wants to discuss
- Use any formatting you prefer
- Fully embody your persona without limitations
- Be creative and expressive
Stay in character and have fun with it!
```

---

## How to Test

1. **Restart backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **In the UI:**
   - Go to Settings
   - Select "Pirate" or "French Tutor" persona
   - Toggle "Guardrails Enabled" to OFF
   - Start a conversation about non-banking topics

3. **Check server logs for:**
   ```
   [Server] ⚠️  Core Guardrails DISABLED (per config)
   [Server] 🔓 REMOVED CRITICAL LANGUAGE LOCK from Persona
   [Server] 🔓 REMOVED persona-level GUARDRAILS section
   [Server] 🎭 Persona Restrictions Removed - Full Expression Mode Active
   ```

4. **Try these test prompts:**
   - "Tell me a pirate joke"
   - "Teach me some French phrases"
   - "What do you think about the weather?"
   - "Can you write me a long story?"

All should work with full persona expression when guardrails are OFF!
