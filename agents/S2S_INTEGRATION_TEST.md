# S2S Integration Test Guide

## What We're Testing

This test integrates Nova Sonic's Speech-to-Speech (S2S) capability into the A2A agent architecture. The triage agent will now:

1. Maintain a Nova Sonic S2S session
2. Forward audio bidirectionally (User ↔ Gateway ↔ Agent ↔ Nova Sonic)
3. Handle tool calling via Nova Sonic
4. Track workflow state (basic implementation)

## Prerequisites

### 1. AWS Credentials

You need AWS credentials with access to Bedrock Nova Sonic:

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"  # or your preferred region
```

### 2. Dependencies Installed

```bash
cd agents
npm install
```

This will install the new `langfuse` dependency needed for SonicClient.

## Test Options

### Option 1: Docker Compose (Recommended)

Test the full stack with gateway, agent, and frontend:

```bash
# Make sure AWS credentials are exported
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"

# Start the test stack
docker-compose -f docker-compose-s2s-test.yml up --build

# Watch the logs
docker-compose -f docker-compose-s2s-test.yml logs -f agent-triage-s2s
```

Then open http://localhost:3000 and test voice interaction.

### Option 2: Local Development

Test just the agent locally:

```bash
cd agents

# Build
npm run build

# Run with S2S runtime
AGENT_ID=triage \
AGENT_PORT=8081 \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
AWS_REGION=us-east-1 \
AWS_ACCESS_KEY_ID="..." \
AWS_SECRET_ACCESS_KEY="..." \
GATEWAY_URL=http://localhost:8080 \
node dist/agent-runtime-s2s.js
```

Or use the test script:

```bash
./test-s2s.sh
```

## What to Look For

### 1. Successful Startup

You should see:

```
[Agent:triage] HTTP server listening on port 8081
[Agent:triage] WebSocket endpoint: ws://localhost:8081/session
[Agent:triage] S2S Mode: ENABLED (Nova Sonic)
[Agent:triage] AWS Region: us-east-1
[Agent:triage] Registered with gateway
```

### 2. Session Initialization

When a client connects:

```
[Agent:triage] New WebSocket connection
[Agent:triage] Initializing session: abc-123-def
[Agent:triage] Nova Sonic S2S session started for abc-123-def
```

### 3. Audio Flow

When user speaks:

```
[Agent:triage] Forwarding audio to Nova Sonic (3200 bytes)
[Agent:triage] Received audio from Nova Sonic (1600 bytes)
[Agent:triage] Transcript: "I want to check my balance"
```

### 4. Tool Calling

When Nova Sonic calls a tool:

```
[Agent:triage] Tool called: get_account_balance
[Agent:triage] Tool result received
```

### 5. Workflow Tracking

When workflow steps are detected:

```
[Agent:triage] Workflow step: authenticate
[Agent:triage] Workflow step: check_balance
```

## Expected Behavior

### ✅ What Should Work

1. **Audio Streaming**: User speaks → hears response
2. **Tool Calling**: Nova Sonic calls tools (balance check, etc.)
3. **Transcripts**: See conversation in UI
4. **Workflow Tracking**: Basic step detection via `[STEP:]` tags

### ⚠️ What's Not Implemented Yet

1. **LangGraph Integration**: Workflow state not fully synchronized
2. **Handoffs**: Can't transfer between agents yet
3. **Advanced Workflow**: Decision nodes still simulated
4. **Sub-workflows**: Not supported yet

## Troubleshooting

### Error: AWS credentials not configured

```
[Agent:triage] ERROR: AWS credentials not configured!
```

**Solution**: Export AWS credentials before starting:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
```

### Error: Session not found

```
[Agent:triage] Session not found for audio: abc-123
```

**Solution**: This means the session wasn't initialized properly. Check that:
1. Gateway is sending `session_init` message
2. Agent received and processed it
3. SonicClient started successfully

### Error: Invalid PCM audio length

```
[Agent:triage] Invalid PCM audio length: 3201
```

**Solution**: This is normal - agent filters out invalid audio packets. No action needed.

### No audio response

**Check:**
1. AWS credentials are valid
2. Bedrock Nova Sonic is available in your region
3. Network connectivity to AWS
4. Browser microphone permissions

## Comparing to Legacy Backend

### Legacy Backend Flow

```
User → Backend (/sonic) → SonicService → Nova Sonic → SonicService → Backend → User
```

### New A2A Flow

```
User → Gateway (/sonic) → Agent (/session) → SonicClient → Nova Sonic → SonicClient → Agent → Gateway → User
```

The agent now does what SonicService did, but in a distributed architecture.

## Next Steps

Once this works:

1. **Add Workflow Context**: Inject workflow instructions into Nova Sonic system prompt
2. **Parse Step Tags**: Update LangGraph state when `[STEP:]` tags detected
3. **Implement Handoffs**: Transfer S2S sessions between agents
4. **Add Decision Logic**: Use LLM for decision nodes
5. **Tool Integration**: Connect tool calls to LangGraph state

## Success Criteria

✅ Agent starts with S2S enabled  
✅ Audio flows through agent to Nova Sonic  
✅ User hears responses  
✅ Tools are called by Nova Sonic  
✅ Transcripts appear in UI  
✅ Basic workflow steps detected  

## Files Changed

- `agents/package.json` - Added langfuse dependency
- `agents/src/sonic-client.ts` - Copied from backend
- `agents/src/types.ts` - Copied from backend
- `agents/src/agent-runtime-s2s.ts` - New S2S-enabled runtime
- `agents/Dockerfile.agent-s2s` - New Dockerfile for S2S mode
- `docker-compose-s2s-test.yml` - Test configuration
- `agents/test-s2s.sh` - Local test script

## Questions?

Check the logs carefully - they're very verbose and will show exactly what's happening at each step.
