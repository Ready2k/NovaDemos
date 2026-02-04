#!/bin/bash

# Restart Local Services (Non-Docker)
# This script stops and restarts services running locally via start-all-services.sh

set -e

echo "========================================="
echo "Restarting Local Services"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ backend/.env not found${NC}"
    echo "Please create backend/.env with AWS credentials"
    exit 1
fi

echo -e "${GREEN}✅ Found backend/.env${NC}"

# Load environment variables
export $(cat backend/.env | grep -v '^#' | xargs)

# Verify AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo -e "${RED}❌ AWS credentials not set in backend/.env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS credentials loaded${NC}"
echo ""

# Stop existing processes
echo "Stopping existing processes..."

# Kill local-tools
pkill -f "local-tools" 2>/dev/null || true

# Kill gateway
pkill -f "node dist/server.js" 2>/dev/null || true

# Kill agent
pkill -f "node dist/agent-runtime-unified.js" 2>/dev/null || true

# Kill frontend
pkill -f "next-server" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true

sleep 2
echo -e "${GREEN}✅ Processes stopped${NC}"
echo ""

# Build services
echo "Building services..."

# Build local-tools
echo "  Building local-tools..."
cd local-tools
npm run build > /dev/null 2>&1
cd ..
echo -e "${GREEN}  ✅ Local Tools built${NC}"

# Build agent
echo "  Building agent..."
cd agents
npm run build > /dev/null 2>&1
cd ..
echo -e "${GREEN}  ✅ Agent built${NC}"

# Build gateway
echo "  Building gateway..."
cd gateway
npm run build > /dev/null 2>&1
cd ..
echo -e "${GREEN}  ✅ Gateway built${NC}"

echo ""

# Create log directory
mkdir -p logs

# Start services in background
echo "Starting services..."
echo ""

# Start Local Tools Service
echo "Starting Local Tools Service..."
cd local-tools
PORT=9000 \
TOOLS_DIR=../backend/tools \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
AWS_REGION=${AWS_REGION:-us-east-1} \
node dist/server.js > ../logs/local-tools.log 2>&1 &
TOOLS_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Local Tools started (PID: $TOOLS_PID)${NC}"
echo "   Logs: logs/local-tools.log"
echo ""

# Start Gateway
echo "Starting Gateway..."
cd gateway
REDIS_URL=redis://localhost:6379 PORT=8080 node dist/server.js > ../logs/gateway.log 2>&1 &
GATEWAY_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Gateway started (PID: $GATEWAY_PID)${NC}"
echo "   Logs: logs/gateway.log"
echo ""

# Start Agent
echo "Starting Triage Agent..."
cd agents
AGENT_ID=triage \
AGENT_HOST=localhost \
AGENT_PORT=8081 \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
MODE=voice \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
node dist/agent-runtime-unified.js > ../logs/agent-triage.log 2>&1 &
TRIAGE_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Triage Agent started (PID: $TRIAGE_PID, Port: 8081)${NC}"
echo "   Logs: logs/agent-triage.log"
echo ""

# Start IDV Agent
echo "Starting IDV Agent..."
cd agents
AGENT_ID=idv \
AGENT_HOST=localhost \
AGENT_PORT=8082 \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
MODE=voice \
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_idv.json \
node dist/agent-runtime-unified.js > ../logs/agent-idv.log 2>&1 &
IDV_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ IDV Agent started (PID: $IDV_PID, Port: 8082)${NC}"
echo "   Logs: logs/agent-idv.log"
echo ""

# Start Banking Agent
echo "Starting Banking Agent..."
cd agents
AGENT_ID=persona-SimpleBanking \
AGENT_HOST=localhost \
AGENT_PORT=8083 \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
MODE=voice \
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_banking-master.json \
node dist/agent-runtime-unified.js > ../logs/agent-banking.log 2>&1 &
BANKING_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Banking Agent started (PID: $BANKING_PID, Port: 8083)${NC}"
echo "   Logs: logs/agent-banking.log"
echo ""

# Start Frontend
echo "Starting Frontend..."
cd frontend-v2
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 5
echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"
echo "   Logs: logs/frontend.log"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $TOOLS_PID 2>/dev/null || true
    kill $GATEWAY_PID 2>/dev/null || true
    kill $TRIAGE_PID 2>/dev/null || true
    kill $IDV_PID 2>/dev/null || true
    kill $BANKING_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Done"
}
trap cleanup EXIT

# Verify services are running
sleep 2

echo "Verifying services..."
echo ""

# Check Local Tools
TOOLS_HEALTH=$(curl -s http://localhost:9000/health 2>/dev/null || echo "")
if echo "$TOOLS_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Local Tools healthy${NC}"
else
    echo -e "${RED}❌ Local Tools not responding${NC}"
    echo "Check logs/local-tools.log for errors"
fi

# Check Gateway
GATEWAY_HEALTH=$(curl -s http://localhost:8080/health 2>/dev/null || echo "")
if echo "$GATEWAY_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Gateway healthy${NC}"
else
    echo -e "${RED}❌ Gateway not responding${NC}"
    echo "Check logs/gateway.log for errors"
fi

# Check Agent
TRIAGE_HEALTH=$(curl -s http://localhost:8081/health 2>/dev/null || echo "")
if echo "$TRIAGE_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Triage Agent healthy${NC}"
else
    echo -e "${RED}❌ Triage Agent not responding${NC}"
    echo "Check logs/agent-triage.log for errors"
fi

IDV_HEALTH=$(curl -s http://localhost:8082/health 2>/dev/null || echo "")
if echo "$IDV_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ IDV Agent healthy${NC}"
else
    echo -e "${RED}❌ IDV Agent not responding${NC}"
    echo "Check logs/agent-idv.log for errors"
fi

BANKING_HEALTH=$(curl -s http://localhost:8083/health 2>/dev/null || echo "")
if echo "$BANKING_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Banking Agent healthy${NC}"
else
    echo -e "${RED}❌ Banking Agent not responding${NC}"
    echo "Check logs/agent-banking.log for errors"
fi

# Check Frontend
FRONTEND_CHECK=$(curl -s http://localhost:3000 2>/dev/null || echo "")
if [ ! -z "$FRONTEND_CHECK" ]; then
    echo -e "${GREEN}✅ Frontend responding${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend still starting...${NC}"
fi

# Check for handoff tools
echo ""
echo "Checking handoff tools..."
sleep 2
HANDOFF_CHECK=$(tail -100 logs/agent-triage.log 2>/dev/null | grep "Generated.*handoff" || echo "")
if [ ! -z "$HANDOFF_CHECK" ]; then
    echo -e "${GREEN}✅ Handoff tools loaded${NC}"
    echo "   $HANDOFF_CHECK"
else
    echo -e "${YELLOW}⚠️  Handoff tools not detected yet${NC}"
    echo "   (Will load when first session starts)"
fi

echo ""
echo "========================================="
echo -e "${GREEN}✅ All Services Running (Multi-Agent)${NC}"
echo "========================================="
echo ""
echo "Services:"
echo "  Local Tools:    http://localhost:9000"
echo "  Gateway:        http://localhost:8080"
echo "  Triage Agent:   http://localhost:8081"
echo "  IDV Agent:      http://localhost:8082"
echo "  Banking Agent:  http://localhost:8083"
echo "  Frontend:       http://localhost:3000"
echo ""
echo "WebSocket: ws://localhost:8080/sonic"
echo ""
echo "Logs:"
echo "  Local Tools: tail -f logs/local-tools.log"
echo "  Gateway:     tail -f logs/gateway.log"
echo "  Triage:      tail -f logs/agent-triage.log"
echo "  IDV:         tail -f logs/agent-idv.log"
echo "  Banking:     tail -f logs/agent-banking.log"
echo "  Frontend:    tail -f logs/frontend.log"
echo ""
echo "Test multi-agent handoff:"
echo "  1. Open http://localhost:3000"
echo "  2. Say: 'I want to check my balance'"
echo "  3. Expected: Triage → IDV → Banking → Triage"
echo "  4. Listen for voice changes!"
echo ""
echo "Watch handoffs:"
echo "  tail -f logs/gateway.log | grep -E 'handoff|HANDOFF'"
echo ""
echo "Check tools:"
echo "  tail -f logs/agent-triage.log | grep -E 'Tool called|HANDOFF'"
echo ""
echo "========================================="
echo "Press Ctrl+C to stop all services..."
echo ""

# Keep running until interrupted
wait
