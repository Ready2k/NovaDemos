# Progressive Filler and Caching System Guide

## Overview

The Progressive Filler and Caching System enhances the user experience during tool execution by providing intelligent filler messages and caching tool results to avoid unnecessary re-execution.

## Progressive Filler System

### How It Works

The system provides cascading filler messages during tool execution:

1. **Primary Filler** (Immediate, Interruptible)
   - Message: "Let me check that for you..."
   - Timing: Immediate when tool execution starts
   - Behavior: Can be interrupted by user speech
   - Purpose: Provides immediate feedback that the system is working

2. **Secondary Filler** (2-second delay, Non-interruptible)
   - Message: "I'm still checking for you..."
   - Timing: 2 seconds after tool execution starts
   - Behavior: Cannot be interrupted (uses system audio channel)
   - Purpose: Reassures user during longer tool executions

### Implementation Details

```typescript
// Start progressive filler when tool execution begins
await startProgressiveFiller(session, toolName, toolUseId);

// Clear filler when tool completes or errors
clearProgressiveFiller(session);
```

### Configuration

The filler system is automatically activated for all native tool calls. No configuration required.

### Audio Channels

- **Primary Filler**: Uses Nova Sonic's normal speech channel (interruptible)
- **Secondary Filler**: Uses system message channel with `[SYSTEM_FILLER]` prefix (non-interruptible)

## Tool Result Caching System

### Cache Strategy

The system intelligently caches tool results based on:
- Tool name
- User query text
- Tool parameters
- Timestamp

### Cache Duration by Tool Type

| Tool Type | Cache Duration | Reason |
|-----------|----------------|---------|
| `get_server_time` | 30 seconds | Time changes frequently |
| `get_account_info` | 60 seconds | Account data relatively stable |
| `payments_agent` | 60 seconds | Payment status updates |
| `get_weather` | 5 minutes | Weather changes slowly |
| Default | 30 seconds | Conservative default |

### Cache Key Generation

```typescript
function getCacheKey(toolName: string, query: string, parameters?: any): string {
    const paramStr = parameters ? JSON.stringify(parameters) : '';
    return `${toolName}:${query}:${paramStr}`;
}
```

### Smart Cache Invalidation

- **Time-based**: Automatic expiration based on tool type
- **LRU Eviction**: Maintains maximum 50 entries, removes oldest when full
- **Session-scoped**: Cache is cleared when session ends

### Fuzzy Query Matching

The system can detect similar queries for interrupted/repeated questions:

```typescript
// Examples of queries that would match:
"What time is it?" 
"What is the current time?"
"Can you tell me the time please?"

// Similarity threshold: 70% word overlap
```

### Cache Hit Scenarios

1. **Exact Repeat**: User asks the same question within cache duration
2. **Interrupted Query**: User interrupts tool execution, then asks similar question
3. **Paraphrased Query**: User asks the same question with different wording

## Usage Examples

### Example 1: Progressive Filler

```
User: "What time is it?"
System: "Let me check that for you..." (immediate, interruptible)
[2 seconds pass]
System: "I'm still checking for you..." (non-interruptible)
[Tool completes]
System: "The current time is 2:30 PM"
```

### Example 2: Cache Hit

```
User: "What time is it?"
System: [Tool execution with filler]
System: "The current time is 2:30 PM"

[10 seconds later]
User: "What was the time?"
System: "I have that information ready for you..."
System: "The current time is 2:30 PM" (from cache)
```

### Example 3: Interrupted Query

```
User: "What time is it?"
System: "Let me check that for you..."
User: [Interrupts] "Never mind"
System: [Tool execution continues in background, result cached]

[Later]
User: "Can you tell me the current time?"
System: "I remember that. The current time is 2:30 PM" (from cache)
```

## Technical Implementation

### Session Interface Extensions

```typescript
interface ClientSession {
    // Progressive Filler System
    primaryFillerTimer?: NodeJS.Timeout;
    secondaryFillerTimer?: NodeJS.Timeout;
    isToolExecuting?: boolean;
    currentToolExecution?: {
        toolName: string;
        startTime: number;
        toolUseId: string;
    };
    
    // Tool Result Caching
    toolResultCache?: Map<string, {
        result: any;
        timestamp: number;
        toolName: string;
        query: string;
    }>;
}
```

### Key Functions

- `startProgressiveFiller()`: Initiates cascading filler messages
- `clearProgressiveFiller()`: Stops all filler timers
- `getCachedToolResult()`: Retrieves cached result if valid
- `setCachedToolResult()`: Stores result in cache
- `findSimilarCachedQuery()`: Fuzzy matching for similar queries

## Error Handling

### Filler System Errors

- Timers are automatically cleared on tool completion, error, or interruption
- Failed audio playback is logged but doesn't block tool execution
- Session cleanup removes all active timers

### Cache System Errors

- Invalid cache entries are automatically removed
- JSON parsing errors are handled gracefully
- Memory limits are enforced (max 50 entries)

## Performance Considerations

### Memory Usage

- Cache is session-scoped (cleared on disconnect)
- Maximum 50 entries per session
- LRU eviction prevents unbounded growth

### Network Efficiency

- Cache hits avoid unnecessary AgentCore calls
- Reduces AWS API usage and costs
- Improves response time for repeated queries

### Audio Performance

- Non-interruptible filler uses separate audio channel
- Minimal impact on main speech synthesis
- Timers are lightweight and efficient

## Testing

Use the provided test script to verify functionality:

```bash
node test-progressive-filler.js
```

This script tests:
1. Progressive filler timing
2. Cache hit detection
3. Interrupted query handling

## Configuration

### System Prompt Updates

The system prompt has been updated to work with the new filler system:

```
- Do NOT add your own "let me check" or "one moment" phrases
- Wait for tool results and respond naturally with the information
- Do NOT interrupt or speak over system filler messages
```

### Environment Variables

No additional environment variables required. The system uses existing Nova Sonic configuration.

## Troubleshooting

### Filler Not Playing

1. Check Nova Sonic session is active
2. Verify WebSocket connection is open
3. Check browser console for audio errors

### Cache Not Working

1. Verify session is properly initialized
2. Check tool execution completes successfully
3. Ensure queries are similar enough (70% threshold)

### Performance Issues

1. Monitor cache size (should not exceed 50 entries)
2. Check for memory leaks in session cleanup
3. Verify timers are properly cleared

## Future Enhancements

Potential improvements for future versions:

1. **Configurable Cache Durations**: Allow per-tool cache duration settings
2. **Cross-Session Caching**: Persist cache across sessions for frequently asked questions
3. **Advanced Similarity Matching**: Use semantic similarity instead of word overlap
4. **Adaptive Filler Timing**: Adjust filler timing based on tool execution history
5. **Cache Analytics**: Track cache hit rates and optimize accordingly