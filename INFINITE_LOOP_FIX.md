# Infinite Tool Loop Fix - Applied

## Problem Summary

The Banking agent was stuck in an infinite loop calling `agentcore_balance` repeatedly after successful tool execution. The root cause was that tool results were not being added to the conversation history, so the agent didn't know the previous tool call had succeeded.

## Root Cause

In `agents/src/text-adapter.ts`, after a tool executed successfully:
1. The tool result was sent to the frontend ✅
2. A follow-up response was generated ❌ BUT the tool result wasn't in conversation history
3. The agent called `generateResponse` without seeing the tool result
4. The agent thought it still needed to call the tool → infinite loop

## Fixes Applied

### 1. Tool Result Feedback Loop (`agents/src/text-adapter.ts`)

**Location**: Lines 227-268

**What Changed**:
- After tool execution, we now add TWO messages to conversation history:
  1. Assistant message with tool use (toolUseId, name, input)
  2. User message with tool result (toolUseId, content, status)
- Then call `generateResponse` with empty string (agent sees history)

**Code**:
```typescript
// Add the assistant's tool use message to history
agentSession.messages.push({
    role: 'assistant',
    content: JSON.stringify({
        toolUse: {
            toolUseId: toolCall.toolUseId,
            name: toolCall.toolName,
            input: toolCall.input
        }
    }),
    timestamp: toolCall.timestamp,
    metadata: { type: 'tool_use' }
});

// Add user message with tool result
agentSession.messages.push({
    role: 'user',
    content: JSON.stringify({
        toolResult: {
            toolUseId: toolCall.toolUseId,
            content: result.result,
            status: result.success ? 'success' : 'error'
        }
    }),
    timestamp: Date.now(),
    metadata: { type: 'tool_result' }
});
```

### 2. Message History Builder (`agents/src/agent-core.ts`)

**Location**: Lines 524-570

**What Changed**:
- Updated `buildClaudeMessages` to properly format tool use and tool result messages
- Checks for `metadata.type` to identify special message types
- Formats messages according to AWS Bedrock Converse API spec

**Code**:
```typescript
private buildClaudeMessages(session: SessionContext): any[] {
    const messages: any[] = [];

    for (const msg of session.messages) {
        if (msg.metadata?.type === 'tool_use') {
            // Parse and format tool use
            const toolUseData = JSON.parse(msg.content);
            messages.push({
                role: 'assistant',
                content: [{
                    toolUse: {
                        toolUseId: toolUseData.toolUse.toolUseId,
                        name: toolUseData.toolUse.name,
                        input: toolUseData.toolUse.input
                    }
                }]
            });
        } else if (msg.metadata?.type === 'tool_result') {
            // Parse and format tool result
            const toolResultData = JSON.parse(msg.content);
            messages.push({
                role: 'user',
                content: [{
                    toolResult: {
                        toolUseId: toolResultData.toolResult.toolUseId,
                        content: [{ json: toolResultData.toolResult.content }],
                        status: toolResultData.toolResult.status
                    }
                }]
            });
        } else {
            // Regular text message
            messages.push({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: [{ text: msg.content }]
            });
        }
    }

    return messages;
}
```

## Additional Enhancement: Loading Animation

Added visual feedback when agent is thinking:

**Location**: `frontend-v2/app/agent-test/page.tsx`

**Features**:
- Animated dots (1-3 dots cycling every 500ms)
- Shows "Thinking..." when:
  - User sends a message
  - Tool is executing
  - Waiting for agent response
- Hides when agent responds

**Component**:
```typescript
function ThinkingDots() {
  const [dots, setDots] = useState(1);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev % 3) + 1);
    }, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <span className="text-gray-400">
      Thinking{'.'.repeat(dots)}
    </span>
  );
}
```

## Expected Behavior After Fix

1. User asks: "What's my balance?"
2. Triage agent routes to IDV agent ✅
3. IDV agent calls `perform_idv_check` ✅
4. IDV agent sees tool result in history ✅
5. IDV agent routes to Banking agent ✅
6. Banking agent calls `agentcore_balance` ✅
7. Banking agent sees tool result in history ✅
8. Banking agent responds with balance (NO LOOP) ✅

## Testing Instructions

1. Services are already restarted with the fix
2. Open `http://localhost:3000/agent-test`
3. Ensure "Gateway Routing" toggle is ON (green)
4. Click "Connect"
5. Type: "What's my balance?"
6. Provide credentials when asked: `12345678 112233`
7. Agent should respond with balance WITHOUT infinite loop

## Files Modified

- `agents/src/text-adapter.ts` - Tool result feedback loop
- `agents/src/agent-core.ts` - Message history builder
- `frontend-v2/app/agent-test/page.tsx` - Loading animation

## Status

✅ Code changes applied
✅ TypeScript compiled successfully
✅ Docker images rebuilt with new code
✅ Docker services restarted with new images
✅ All services healthy
✅ Ready for testing

## Next Test

Please try the flow again:
1. Refresh the page at `http://localhost:3000/agent-test`
2. Ensure "Gateway Routing" is ON (green)
3. Click "Connect"
4. Type: "hi can i have my balance"
5. When asked, provide: `12345678 112233`
6. The agent should now respond with the balance WITHOUT infinite loop or manual nudging

The key difference you should see in the logs:
- OLD: `Generating response for: "[Tool agentcore_balance completed]"`
- NEW: `Generating response for: ""` (empty string, tool result is in conversation history)
