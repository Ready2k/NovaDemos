# Local Testing Status

## ✅ Services Running

1. **Gateway** - Port 8080 (Process ID: 8)
   - WebSocket server for routing
   - Connects to agents and frontend
   - Status: Running successfully

2. **Frontend** - Port 3000 (Process ID: 9)
   - Next.js development server
   - URL: http://localhost:3000
   - Status: Running successfully

3. **Banking Agent** - Port 8081 (Process ID: 5)
   - Unified agent runtime in hybrid mode
   - Workflow: banking-master
   - Status: Running successfully

## 🔧 Configuration Applied

### agents/.env
- Added `import 'dotenv/config'` to agent-runtime-unified.ts
- Set AWS credentials (both NOVA_* and AWS_* prefixes)
- Set WORKFLOW_FILE to ../gateway/workflows/workflow_banking-master.json
- Set MODE=hybrid
- Set AGENT_PORT=8081

### frontend-v2/app/agent-test/page.tsx
- Fixed WebSocket host to use localhost instead of 192.168.5.190

## 📝 Testing Instructions

### Option 1: Direct Agent Connection (Recommended for single agent)
1. Go to http://localhost:3000/agent-test
2. Select "Triage Agent" (or any agent)
3. **Turn OFF** the "Gateway Routing" toggle
4. Click "Connect"
5. Type messages to test the banking agent directly

### Option 2: Gateway Mode (Requires multiple agents)
Gateway mode enables agent-to-agent handoffs, but requires multiple agents running:
- Triage Agent: Port 8081
- Banking Agent: Port 8082
- Mortgage Agent: Port 8083
- IDV Agent: Port 8084
- Disputes Agent: Port 8085
- Investigation Agent: Port 8086

Currently only banking agent is running on 8081.

## 🎯 What Works

- ✅ Gateway WebSocket connections
- ✅ Frontend loads and renders
- ✅ Banking agent processes messages
- ✅ Voice synthesis (Nova Sonic)
- ✅ Tool execution
- ✅ Langfuse observability

## ⚠️ Known Limitations

- Agent-to-agent handoffs require multiple agents running
- Agent heartbeat to gateway fails (missing /api/agents/register endpoint)
- Only one agent workflow loaded (banking-master)

## 🚀 Next Steps

To enable full A2A functionality:
1. Create separate agent instances for each workflow
2. Configure each with different ports and workflow files
3. Implement /api/agents/register endpoint in gateway
4. Test handoff scenarios (triage → idv → banking)
