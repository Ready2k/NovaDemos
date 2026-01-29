# Test: Simplest Possible Tool

## Hypothesis
Nova Sonic S2S might need:
1. Simpler tool schemas (no parameters)
2. More explicit system prompt instructions
3. Different tool configuration

## Test: Create Minimal Tool

Create a tool with ZERO parameters to test if Nova Sonic will call it:

```typescript
{
  toolSpec: {
    name: 'test_tool',
    description: 'A simple test tool with no parameters. Call this immediately when the user says hello.',
    inputSchema: {
      json: JSON.stringify({
        type: 'object',
        properties: {},
        required: []
      })
    }
  }
}
```

## Test System Prompt

```
You are a test agent. You have ONE tool available called 'test_tool'.

CRITICAL: When the user says "hello", you MUST call the test_tool.

Do NOT just greet them. Call the tool first, then greet them.
```

## Expected Behavior

User: "hello"
Agent: [CALLS test_tool]
Agent: "Hello! How can I help you?"

## If This Works
Then the issue is with:
- Tool parameter complexity
- System prompt phrasing
- Tool descriptions

## If This Doesn't Work
Then Nova Sonic S2S might not support tool calling at all, or requires:
- Different API configuration
- Different event format
- AWS support ticket

## Implementation

Add to `agents/src/handoff-tools.ts`:
```typescript
{
  toolSpec: {
    name: 'test_simple_tool',
    description: 'TEST: Call this tool immediately when user says hello. No parameters needed.',
    inputSchema: {
      json: JSON.stringify({
        type: 'object',
        properties: {},
        required: []
      })
    }
  }
}
```

Add to triage prompt:
```
**TEST MODE: You have a test_simple_tool. When user says "hello", call it immediately before responding.**
```

## Test Command
```bash
# Restart
./restart-local-services.sh

# Watch logs
tail -f logs/agent.log | grep -E "(test_simple_tool|toolUse)"

# Test
# Say "hello" in frontend
# Look for: [Agent:triage] Tool called: test_simple_tool
```
