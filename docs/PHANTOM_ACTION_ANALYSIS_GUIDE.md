# Phantom Action Log Analysis Guide

## Overview

This guide explains how to analyze the `phantom-actions.jsonl` log file to improve the Phantom Action Watcher system. The log tracks instances where the LLM promises to perform an action but fails to execute the corresponding tool.

## Log File Location

```
logs/phantom-actions.jsonl
```

## Log Format

The log uses **JSON Lines** format (`.jsonl`), where each line is a complete JSON object. This format is ideal for:
- Streaming analysis
- Easy parsing with standard tools
- Appending without reading the entire file

### Log Entry Structure

```json
{
  "timestamp": "2026-01-16T13:08:54.123Z",
  "sessionId": "abc123-def456",
  "actionName": "balance_check",
  "expectedTool": "agentcore_balance",
  "assistantText": "Let me check your balance for you.",
  "toolsCalled": [],
  "confidence": "high",
  "correctionAttempted": true,
  "correctionSuccessful": true,
  "repromptUsed": "SYSTEM OVERRIDE: You said you would check..."
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string (ISO 8601) | When the phantom action was detected |
| `sessionId` | string | Unique session identifier |
| `actionName` | string | Name of the detected action pattern (e.g., `balance_check`, `dispute_creation`) |
| `expectedTool` | string | The tool that should have been called |
| `assistantText` | string | The full text from the assistant's response |
| `toolsCalled` | array | List of tools that were actually called (usually empty for phantoms) |
| `confidence` | string | Detection confidence: `high`, `medium`, or `low` |
| `correctionAttempted` | boolean | Whether auto-correction was attempted |
| `correctionSuccessful` | boolean (optional) | Whether the correction resulted in tool execution |
| `repromptUsed` | string (optional) | The reprompt text that was injected |

---

## Analysis Methods

### 1. Basic Statistics

**Count total phantom actions:**
```bash
wc -l logs/phantom-actions.jsonl
```

**Count by action type:**
```bash
cat logs/phantom-actions.jsonl | jq -r '.actionName' | sort | uniq -c | sort -rn
```

**Count corrections attempted:**
```bash
cat logs/phantom-actions.jsonl | jq 'select(.correctionAttempted == true)' | wc -l
```

**Calculate correction success rate:**
```bash
# Total corrections
total=$(cat logs/phantom-actions.jsonl | jq 'select(.correctionAttempted == true)' | wc -l)

# Successful corrections
successful=$(cat logs/phantom-actions.jsonl | jq 'select(.correctionSuccessful == true)' | wc -l)

# Calculate percentage
echo "scale=2; ($successful / $total) * 100" | bc
```

### 2. Identify Problem Patterns

**Find most common phantom actions:**
```bash
cat logs/phantom-actions.jsonl | jq -r '.actionName' | sort | uniq -c | sort -rn | head -10
```

**Find actions with low correction success:**
```bash
cat logs/phantom-actions.jsonl | \
  jq -r 'select(.correctionAttempted == true and .correctionSuccessful != true) | .actionName' | \
  sort | uniq -c | sort -rn
```

**View recent phantom actions:**
```bash
tail -20 logs/phantom-actions.jsonl | jq '.'
```

### 3. Pattern Analysis

**Extract unique assistant text patterns:**
```bash
cat logs/phantom-actions.jsonl | jq -r '.assistantText' | sort | uniq
```

**Find sessions with multiple phantoms:**
```bash
cat logs/phantom-actions.jsonl | jq -r '.sessionId' | sort | uniq -c | sort -rn | head -10
```

---

## Improving the System

### Adding New Action Patterns

If you discover a new phantom action pattern in the logs:

1. **Identify the pattern** in `assistantText`
2. **Determine the expected tool**
3. **Add to `phantom-action-watcher.ts`:**

```typescript
{
  name: 'new_action_name',
  pattern: /\b(phrase|pattern|to|match)/i,
  expectedTool: 'tool_name',
  reprompt: 'SYSTEM OVERRIDE: You said you would... but did not call tool_name. Execute it NOW.',
  confidence: 'high'  // or 'medium' or 'low'
}
```

### Refining Existing Patterns

**If false positives occur** (detecting phantoms when tool was actually called):
- Make the regex pattern more specific
- Add negative lookahead assertions
- Lower the confidence level

**If false negatives occur** (missing actual phantoms):
- Broaden the regex pattern
- Add alternative phrasings
- Check for typos or variations in the logs

### Adjusting Confidence Levels

Based on correction success rates:

- **High confidence (>90% success):** Keep as `high`, auto-correct enabled
- **Medium confidence (70-90% success):** Change to `medium`, log only
- **Low confidence (<70% success):** Change to `low`, log only, or remove

---

## Example Analysis Workflow

### Step 1: Review Recent Activity

```bash
# View last 50 phantom actions
tail -50 logs/phantom-actions.jsonl | jq '.'
```

### Step 2: Identify Trends

```bash
# Group by action and count
cat logs/phantom-actions.jsonl | jq -r '.actionName' | sort | uniq -c | sort -rn

# Output example:
#  45 dispute_creation
#  23 balance_check
#  12 transaction_lookup
#   5 idv_verification
```

### Step 3: Deep Dive on Problem Actions

```bash
# View all dispute_creation phantoms
cat logs/phantom-actions.jsonl | jq 'select(.actionName == "dispute_creation")'

# Check their assistant text
cat logs/phantom-actions.jsonl | \
  jq -r 'select(.actionName == "dispute_creation") | .assistantText' | \
  sort | uniq
```

### Step 4: Evaluate Corrections

```bash
# Check correction success for dispute_creation
cat logs/phantom-actions.jsonl | \
  jq 'select(.actionName == "dispute_creation" and .correctionAttempted == true)' | \
  jq -s 'group_by(.correctionSuccessful) | map({success: .[0].correctionSuccessful, count: length})'
```

### Step 5: Update Patterns

Based on findings, update `backend/src/phantom-action-watcher.ts` and restart the server.

---

## Monitoring Dashboard (Future Enhancement)

Consider building a simple dashboard that shows:
- Total phantom actions (last 24h, 7d, 30d)
- Correction success rate by action type
- Trending phantom actions
- Sessions with highest phantom count

**Quick stats command:**
```bash
cat logs/phantom-actions.jsonl | jq -s '{
  total: length,
  by_action: group_by(.actionName) | map({action: .[0].actionName, count: length}),
  corrections: map(select(.correctionAttempted == true)) | length,
  successful: map(select(.correctionSuccessful == true)) | length
}'
```

---

## Troubleshooting

### Log file doesn't exist
- The file is created on first phantom detection
- If no phantoms detected, file won't exist (this is good!)

### Invalid JSON errors
- Each line must be valid JSON
- Check for corruption: `jq '.' logs/phantom-actions.jsonl`
- If corrupted, remove bad lines manually

### High false positive rate
- Review the regex patterns in `phantom-action-watcher.ts`
- Consider adding more context to patterns (e.g., require specific keywords)
- Lower confidence levels for problematic patterns

### Low correction success rate
- Check if reprompts are clear enough
- Verify the expected tool name is correct
- Consider if the LLM needs more context in the reprompt

---

## Best Practices

1. **Review logs weekly** to identify new patterns
2. **Track metrics** over time to measure improvement
3. **Start conservative** - use high confidence only for well-tested patterns
4. **Iterate based on data** - let the logs guide pattern refinement
5. **Document changes** - note why patterns were added/modified

---

## Contact & Support

For questions or issues with the Phantom Action Watcher:
- Check the implementation plan: `implementation_plan.md`
- Review the source code: `backend/src/phantom-action-watcher.ts`
- Examine server integration: `backend/src/server.ts` (search for "PhantomWatcher")
