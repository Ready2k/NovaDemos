#!/bin/bash

# Start all services locally for development
# This script starts gateway, frontend, and 6 agent processes in the background

echo "Starting all services locally..."

# Kill any existing processes
echo "Stopping any existing services..."
pkill -f "AGENT_ID=" 2>/dev/null || true
pkill -f "ts-node src/server.ts" 2>/dev/null || true
pkill -f "gateway.*ts-node" 2>/dev/null || true
pkill -f "local-tools.*ts-node" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
# Kill by port if needed
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:9000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 3

# Start Gateway
echo "Starting Gateway on port 8080..."
cd gateway
npm run dev > /tmp/gateway.log 2>&1 &
cd ..

# Start Local Tools Service
echo "Starting Local Tools Service on port 9000..."
cd local-tools
# Load AWS credentials from agents/.env
export $(grep -E "^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_REGION|NOVA_AWS|AGENTCORE)" ../agents/.env | xargs)
TOOLS_DIR=./tools npm run dev > /tmp/local-tools.log 2>&1 &
cd ..

# Start Frontend
echo "Starting Frontend on port 3000..."
cd frontend-v2
npm run dev > /tmp/frontend.log 2>&1 &
cd ..

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 5

# Start Agents
cd agents

echo "Starting Triage Agent on port 8081..."
MODE=hybrid AGENT_ID=triage AGENT_PORT=8081 WORKFLOW_FILE=../gateway/workflows/workflow_triage.json LOCAL_TOOLS_URL=http://localhost:9000 npm run dev > /tmp/agent-triage.log 2>&1 &

echo "Starting Banking Agent on port 8082..."
MODE=hybrid AGENT_ID=banking AGENT_PORT=8082 WORKFLOW_FILE=../gateway/workflows/workflow_banking-master.json LOCAL_TOOLS_URL=http://localhost:9000 npm run dev > /tmp/agent-banking.log 2>&1 &

echo "Starting Mortgage Agent on port 8083..."
MODE=hybrid AGENT_ID=mortgage AGENT_PORT=8083 WORKFLOW_FILE=../gateway/workflows/workflow_persona-mortgage.json LOCAL_TOOLS_URL=http://localhost:9000 npm run dev > /tmp/agent-mortgage.log 2>&1 &

echo "Starting IDV Agent on port 8084..."
MODE=hybrid AGENT_ID=idv AGENT_PORT=8084 WORKFLOW_FILE=../gateway/workflows/workflow_idv.json LOCAL_TOOLS_URL=http://localhost:9000 npm run dev > /tmp/agent-idv.log 2>&1 &

echo "Starting Disputes Agent on port 8085..."
MODE=hybrid AGENT_ID=disputes AGENT_PORT=8085 WORKFLOW_FILE=../gateway/workflows/workflow_disputes.json LOCAL_TOOLS_URL=http://localhost:9000 npm run dev > /tmp/agent-disputes.log 2>&1 &

echo "Starting Investigation Agent on port 8086..."
MODE=hybrid AGENT_ID=investigation AGENT_PORT=8086 WORKFLOW_FILE=../gateway/workflows/workflow_investigation.json LOCAL_TOOLS_URL=http://localhost:9000 npm run dev > /tmp/agent-investigation.log 2>&1 &

cd ..

echo ""
echo "✅ All services started!"
echo ""
echo "Services:"
echo "  - Gateway:      http://localhost:8080"
echo "  - Local Tools:  http://localhost:9000"
echo "  - Frontend:     http://localhost:3000"
echo "  - Agent Test:   http://localhost:3000/agent-test"
echo ""
echo "Logs are available at:"
echo "  - /tmp/gateway.log"
echo "  - /tmp/local-tools.log"
echo "  - /tmp/frontend.log"
echo "  - /tmp/agent-triage.log"
echo "  - /tmp/agent-banking.log"
echo "  - /tmp/agent-mortgage.log"
echo "  - /tmp/agent-idv.log"
echo "  - /tmp/agent-disputes.log"
echo "  - /tmp/agent-investigation.log"
echo ""
echo "To view all logs: tail -f /tmp/gateway.log /tmp/local-tools.log /tmp/frontend.log /tmp/agent-*.log"
echo "To stop all services: pkill -f 'AGENT_ID=' && pkill -f 'ts-node.*gateway' && pkill -f 'ts-node.*local-tools' && pkill -f 'next-server' && pkill -f 'next dev'"
echo ""
echo "Waiting for services to initialize..."
sleep 8
echo "✅ Services should be ready now!"
echo ""
echo "Check if frontend is ready: curl -s http://localhost:3000 > /dev/null && echo 'Frontend: ✅' || echo 'Frontend: ⏳ (may need more time)'"
