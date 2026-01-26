# Sentiment Analysis Implementation

The Voice S2S application uses a **Unified Sentiment Architecture** where the LLM (Nova 2 Sonic) serves as the Single Source of Truth for all sentiment data.

## Overview
We have removed the redundancy of local keyword analysis. Now, the LLM evaluates its own response context and outputs a score which drives **both** the real-time graph and the immediate visual feedback (emojis).

---

## 1. Backend Analysis (LLM-Driven)

This method ensures consistency between what the graph shows and what the emojis indicate.

### A. Prompt Injection (`server.ts`)
We inject a mandatory instruction into the System Prompt instructing the model to self-evaluate and append a hidden tag.

```typescript
// backend/src/server.ts
// 1.9.5 Inject Sentiment Tagging Instruction
if (parsed.config.systemPrompt) {
    const sentimentInstruction = "\n\n" +
        "########## SENTIMENT TAGGING (REQUIRED) ##########\n" +
        "You MUST end every single response with a sentiment tag in this exact format: [SENTIMENT: score]\n" +
        "Score range: -1 (Negative) to 1 (Positive).\n" +
        "Example: [SENTIMENT: -0.5]\n" +
        "Do NOT speak this tag. It is for system use only.\n" +
        "FAILURE TO INCLUDE THIS TAG IS A SYSTEM ERROR.\n";
    parsed.config.systemPrompt += sentimentInstruction;
}
```

## 2. Frontend Processing (`displayTranscript`)

In `frontend/main.js`, we intercept the stream, extract the tag, and use the score for two purposes before stripping it from the display.

### A. Graph and Emojis (Unified Logic)

```javascript
// frontend/main.js -> displayTranscript()

// 1. Parse & Capture Score
let parsedSentimentScore = null;
const sentimentMatch = text.match(/(?:\[\[|\[|\])SENTIMENT:\s*(-?[\d\.]+)(?:\]\]|\])?/i);

if (sentimentMatch) {
    const score = parseFloat(sentimentMatch[1]);
    parsedSentimentScore = score;
    
    // Update Graph (Live)
    if (isFinal) {
        this.updateLiveSentiment(null, 'user', score);
    }
    
    // Strip Tag
    text = text.replace(stripRegex, '').trim();
}

```javascript
// frontend/main.js -> displayTranscript()

// 1. Parsing (As above)...

// 2. Late Packet Handling (Race Condition Guard)
// If the text is a duplicate of the last message (e.g. "Hello." vs "Hello."), we usually return early.
// BUT, if the new packet contains a sentiment score that the old one didn't have, we update the existing bubble.
if (lastText === text && isFinal) {
    if (parsedSentimentScore !== null) {
        // Helper function updates the DOM element in-place
        updateSentimentMarker(lastMessage, parsedSentimentScore);
    }
    return; // Skip creating a new bubble
}

// 3. New Message Creation
// ... Standard creation logic using parsedSentimentScore ...
```

## Summary
| Feature | Source | Purpose |
| :--- | :--- | :--- |
| **Live Graph** | `[[SENTIMENT: score]]` | Tracks conversation arc |
| **Chat Emojis** | `[[SENTIMENT: score]]` | Immediate visual feedback |

**Status**: Simplified. `sentiment-lite.js` has been removed. All sentiment data comes directly from the model's understanding of the conversation.
