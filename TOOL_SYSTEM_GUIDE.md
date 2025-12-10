# Native Tool System Guide

## 🎯 Quick Start

### Testing Native Tools
1. Set Brain Mode to "Nova Sonic Direct"
2. Enable "get_server_time" tool in configuration
3. Ask: "What time is it?"
4. Expect: Native tool execution → Natural speech response

### Adding New Tools
1. Create tool definition in `tools/your_tool.json`
2. Restart server to load new tool
3. Test with appropriate user query

## 🛠️ Tool Definition Format

### Basic Structure
```json
{
    "name": "tool_name",
    "description": "What this tool does",
    "input_schema": {
        "type": "object",
        "properties": {
            "param1": {
                "type": "string",
                "description": "Parameter description"
            }
        },
        "required": ["param1"]
    },
    "instruction": "- Invoke tool tool_name when needed.",
    "agentPrompt": "Custom prompt for AgentCore execution"
}
```

### Example: Time Tool
```json
{
    "name": "get_server_time",
    "description": "Returns the current server time. Use this to verify connectivity and tool execution.",
    "input_schema": {
        "type": "object",
        "properties": {
            "zone": {
                "type": "string", 
                "description": "Optional timezone"
            }
        },
        "required": []
    },
    "instruction": "- Invoke tool get_server_time if needed.",
    "agentPrompt": "What is the current time in {{USER_LOCATION}} ({{USER_TIMEZONE}})?"
}
```

## 🔄 Tool Execution Flow

### Nova Sonic Direct Mode
```
1. User: "What time is it?"
2. Nova Sonic: Generates native toolUse event
3. Server: Processes toolUse → calls AgentCore
4. AgentCore: Executes tool logic → returns result
5. Server: Sends result back to Nova Sonic
6. Nova Sonic: Speaks result naturally
```

### Key Components
- **Tool Detection**: Nova Sonic identifies when to use tools
- **Native Events**: `toolUse` events with `toolName`, `toolUseId`, `content`
- **AgentCore Integration**: Handles actual tool execution
- **Result Processing**: Clean formatting for natural speech

## 📝 System Prompts

### Core Guardrails (Required)
```
Tool Usage Rules:
- IF (and ONLY IF) you have been provided with a specific tool for the user's request:
  a) Use the native tool call functionality to invoke the tool.
  b) Do NOT generate JSON code blocks or say "ACTION: [tool_name]".
  c) The response must be SILENT until the tool returns.
  d) Do NOT say "Sure", "Okay", "Checking now" or narrate your action.
```

### Tool Instructions (Auto-injected)
```
You have access to tools. When users ask for the current time, use the get_server_time tool to get the information and then respond naturally with the result.
```

## 🧪 Testing Tools

### Manual Testing
1. Use the web interface
2. Enable specific tools in configuration
3. Ask relevant questions
4. Check debug panel for tool events

### Automated Testing
```bash
node test-complete-native.js
```

Expected output:
```
✅ NATIVE TOOL USE: Native toolUse events detected
✅ TOOL EXECUTION: Tool execution was initiated
✅ ACTUAL RESULTS: Time information was returned
🎉 SUCCESS: Complete native Nova 2 Sonic tool capability achieved!
```

## 🔧 Configuration

### Frontend Tool Selection
- Tools appear in configuration panel
- Enable/disable specific tools
- Selection sent to backend in `selectedTools` array
- **Fixed**: Empty array `[]` properly disables all tools

### Backend Tool Loading
```typescript
// Load all available tools
const allTools = loadTools();

// Filter by frontend selection (fixed to handle empty arrays)
if (selectedTools !== undefined && Array.isArray(selectedTools)) {
    tools = allTools.filter(t => selectedTools.includes(t.toolSpec.name));
} else {
    tools = allTools; // Default: all tools
}

// Pass to Nova Sonic (empty array = no tools)
sonicClient.updateSessionConfig({ tools: mappedTools });
```

### Dynamic Variables
Use in `agentPrompt` field:
- `{{USER_LOCATION}}`: User's location setting
- `{{USER_TIMEZONE}}`: User's timezone setting

## 🐛 Troubleshooting

### Tool Not Executing
1. Check tool is in `selectedTools` array (verify UI selection)
2. Verify tool definition JSON is valid
3. Check system prompt includes tool instructions
4. Look for `toolUse` events in logs
5. Ensure tool enable/disable UI is working correctly

### Tool Executing When Disabled
1. Check frontend sends `selectedTools: []` when no tools selected
2. Verify server logs show "Loaded 0/X tools: NONE"
3. Check system prompt says "You do not have access to any tools"

### Duplicate Audio
1. Ensure only one delivery method active
2. Check for multiple TTS generations
3. Verify session management

### No Audio Response
1. Check tool result is being sent back to Nova Sonic
2. Verify `sendToolResult()` is called correctly
3. Check for session disconnections

### Tool Retry Loops
1. Ensure tool results are properly formatted
2. Check that `sendToolResult()` includes correct `toolUseId`
3. Verify no duplicate tool calls in logs

## 📊 Performance Tips

### Optimize Tool Execution
- Keep AgentCore prompts concise
- Use specific tool descriptions
- Minimize tool execution time

### Audio Quality
- Clean tool results (remove markdown)
- Use natural language in responses
- Keep responses conversational

### Error Handling
- Graceful fallbacks for tool failures
- Clear error messages to users
- Proper session cleanup

## 🚀 Advanced Features

### Multi-Tool Workflows
- Chain multiple tool calls
- Context preservation between calls
- Complex reasoning with tools

### Custom Tool Types
- API integrations
- Database queries
- File operations
- External service calls

### Tool Security
- Input validation
- Output sanitization
- Permission checks
- Rate limiting

## 📈 Monitoring

### Key Metrics
- Tool execution success rate
- Average execution time
- User satisfaction with results
- Error rates and types

### Debug Information
- Tool use events in debug panel
- Execution traces in logs
- Performance timing data
- User interaction patterns