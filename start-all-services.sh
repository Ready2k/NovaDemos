#!/bin/bash

# Start All Services Script
# Starts Gateway, Agent, and Frontend for complete voice testing

set -e

echo "========================================="
echo "Starting All Services for Voice Testing"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

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

# Check if Redis is running
echo "Checking Redis..."
if ! docker ps | grep -q redis; then
    echo -e "${YELLOW}⚠️  Redis not running, starting...${NC}"
    docker run -d --name redis -p 6379:6379 redis:7-alpine
    sleep 2
fi
echo -e "${GREEN}✅ Redis running${NC}"
echo ""

# Build agent
echo "Building agent..."
cd agents
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Agent build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Agent built${NC}"
cd ..
echo ""

# Build gateway
echo "Building gateway..."
cd gateway
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Gateway build failed${NC}"
    exit 1
fi
cd ..
echo -e "${GREEN}✅ Gateway built${NC}"
echo ""

# Build local-tools
echo "Building local-tools..."
cd local-tools
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Local Tools build failed${NC}"
    exit 1
fi
cd ..
echo -e "${GREEN}✅ Local Tools built${NC}"
echo ""

# Check frontend dependencies
if [ ! -d "frontend-v2/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend-v2
    npm install
    cd ..
    echo ""
fi

# Create log directory
mkdir -p logs

# Start services in background
echo "Starting services..."
echo ""

# Start Local Tools
echo "Starting Local Tools..."
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
echo ""

# Start Triage Agent
echo "Starting Triage Agent..."
cd agents
AGENT_ID=triage \
AGENT_HOST=localhost \
AGENT_PORT=8081 \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
node dist/agent-runtime-s2s.js > ../logs/agent-triage.log 2>&1 &
TRIAGE_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Triage Agent started (PID: $TRIAGE_PID)${NC}"
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
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_idv.json \
node dist/agent-runtime-s2s.js > ../logs/agent-idv.log 2>&1 &
IDV_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ IDV Agent started (PID: $IDV_PID)${NC}"
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
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_banking-master.json \
node dist/agent-runtime-s2s.js > ../logs/agent-banking.log 2>&1 &
BANKING_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Banking Agent started (PID: $BANKING_PID)${NC}"
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
fi

# Check Gateway
GATEWAY_HEALTH=$(curl -s http://localhost:8080/health 2>/dev/null || echo "")
if echo "$GATEWAY_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Gateway healthy${NC}"
else
    echo -e "${RED}❌ Gateway not responding${NC}"
fi

# Check Agent
TRIAGE_HEALTH=$(curl -s http://localhost:8081/health 2>/dev/null || echo "")
if echo "$TRIAGE_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Triage Agent healthy${NC}"
else
    echo -e "${RED}❌ Triage Agent not responding${NC}"
fi

IDV_HEALTH=$(curl -s http://localhost:8082/health 2>/dev/null || echo "")
if echo "$IDV_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ IDV Agent healthy${NC}"
else
    echo -e "${RED}❌ IDV Agent not responding${NC}"
fi

BANKING_HEALTH=$(curl -s http://localhost:8083/health 2>/dev/null || echo "")
if echo "$BANKING_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Banking Agent healthy${NC}"
else
    echo -e "${RED}❌ Banking Agent not responding${NC}"
fi

# Check Frontend
FRONTEND_CHECK=$(curl -s http://localhost:3000 2>/dev/null || echo "")
if [ ! -z "$FRONTEND_CHECK" ]; then
    echo -e "${GREEN}✅ Frontend responding${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend still starting...${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}✅ All Services Running${NC}"
echo "========================================="
echo ""
echo "Services:"
echo "  Local Tools: http://localhost:9000"
echo "  Gateway:     http://localhost:8080"
echo "  Triage:      http://localhost:8081"
echo "  IDV:         http://localhost:8082"
echo "  Banking:     http://localhost:8083"
echo "  Frontend:    http://localhost:3000"
echo ""
echo "WebSocket: ws://localhost:8080/sonic"
echo ""
echo "Logs:"
echo "  Gateway: tail -f logs/gateway.log"
echo "  Triage:  tail -f logs/agent-triage.log"
echo "  IDV:     tail -f logs/agent-idv.log"
echo "  Banking: tail -f logs/agent-banking.log"
echo ""
echo "========================================="
echo "🎤 READY FOR MULTI-AGENT VOICE TESTING!"
echo "========================================="
echo ""
echo "1. Open http://localhost:3000 in your browser"
echo "2. Click the microphone button"
echo "3. Say: 'I want to check my balance'"
echo ""
echo "Press Ctrl+C to stop all services..."
echo ""

# Keep running until interrupted
wait
