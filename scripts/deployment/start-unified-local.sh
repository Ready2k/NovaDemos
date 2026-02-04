#!/bin/bash

# Start Unified Architecture - Local Mode
# Runs all services locally (no Docker except Redis)
# Best for: Development, debugging, rapid iteration

set -e

echo "========================================="
echo "Starting Unified Architecture (Local)"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default mode
MODE=${1:-voice}

# Validate mode
if [[ ! "$MODE" =~ ^(voice|text|hybrid)$ ]]; then
    echo -e "${RED}❌ Invalid mode: $MODE${NC}"
    echo "Usage: ./start-unified-local.sh [voice|text|hybrid]"
    exit 1
fi

echo -e "${BLUE}Mode: $MODE${NC}"
echo ""

# Check .env
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ backend/.env not found${NC}"
    echo "Please create backend/.env with AWS credentials"
    exit 1
fi

export $(cat backend/.env | grep -v '^#' | xargs)

# Verify AWS credentials for voice/hybrid
if [[ "$MODE" == "voice" || "$MODE" == "hybrid" ]]; then
    if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
        echo -e "${RED}❌ AWS credentials required for $MODE mode${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ AWS credentials loaded${NC}"
else
    echo -e "${YELLOW}⚠️  Text mode - AWS credentials not required${NC}"
fi
echo ""

# Check Redis
if ! docker ps | grep -q redis; then
    echo "Starting Redis..."
    docker run -d --name redis -p 6379:6379 redis:7-alpine
    sleep 2
fi
echo -e "${GREEN}✅ Redis running${NC}"
echo ""

# Build all services
echo "Building services..."
cd agents && npm run build > /dev/null 2>&1 && cd ..
cd gateway && npm run build > /dev/null 2>&1 && cd ..
cd local-tools && npm run build > /dev/null 2>&1 && cd ..
echo -e "${GREEN}✅ All services built${NC}"
echo ""

# Create logs directory
mkdir -p logs

# Start services
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
echo -e "${GREEN}✅ Local Tools (PID: $TOOLS_PID, Port: 9000)${NC}"

# Start Gateway
echo "Starting Gateway..."
cd gateway
REDIS_URL=redis://localhost:6379 \
PORT=8080 \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
AWS_REGION=${AWS_REGION:-us-east-1} \
node dist/server.js > ../logs/gateway.log 2>&1 &
GATEWAY_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Gateway (PID: $GATEWAY_PID, Port: 8080)${NC}"

# Start all 6 agents
echo ""
echo "Starting agents in $MODE mode..."
echo ""

# Triage Agent
cd agents
AGENT_ID=triage \
AGENT_PORT=8081 \
MODE=$MODE \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
node dist/agent-runtime-unified.js > ../logs/agent-triage.log 2>&1 &
TRIAGE_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Triage Agent (PID: $TRIAGE_PID, Port: 8081)${NC}"

# IDV Agent
cd agents
AGENT_ID=idv \
AGENT_PORT=8082 \
MODE=$MODE \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_idv.json \
node dist/agent-runtime-unified.js > ../logs/agent-idv.log 2>&1 &
IDV_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ IDV Agent (PID: $IDV_PID, Port: 8082)${NC}"

# Banking Agent
cd agents
AGENT_ID=banking \
AGENT_PORT=8083 \
MODE=$MODE \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_banking-master.json \
node dist/agent-runtime-unified.js > ../logs/agent-banking.log 2>&1 &
BANKING_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Banking Agent (PID: $BANKING_PID, Port: 8083)${NC}"

# Mortgage Agent
cd agents
AGENT_ID=mortgage \
AGENT_PORT=8084 \
MODE=$MODE \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_persona-mortgage.json \
node dist/agent-runtime-unified.js > ../logs/agent-mortgage.log 2>&1 &
MORTGAGE_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Mortgage Agent (PID: $MORTGAGE_PID, Port: 8084)${NC}"

# Disputes Agent
cd agents
AGENT_ID=disputes \
AGENT_PORT=8085 \
MODE=$MODE \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_disputes.json \
node dist/agent-runtime-unified.js > ../logs/agent-disputes.log 2>&1 &
DISPUTES_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Disputes Agent (PID: $DISPUTES_PID, Port: 8085)${NC}"

# Investigation Agent
cd agents
AGENT_ID=investigation \
AGENT_PORT=8086 \
MODE=$MODE \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
LOCAL_TOOLS_URL=http://localhost:9000 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_investigation.json \
node dist/agent-runtime-unified.js > ../logs/agent-investigation.log 2>&1 &
INVESTIGATION_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Investigation Agent (PID: $INVESTIGATION_PID, Port: 8086)${NC}"

# Start Frontend
echo ""
echo "Starting Frontend..."
cd frontend-v2
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 5
echo -e "${GREEN}✅ Frontend (PID: $FRONTEND_PID, Port: 3000)${NC}"

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $TOOLS_PID 2>/dev/null || true
    kill $GATEWAY_PID 2>/dev/null || true
    kill $TRIAGE_PID 2>/dev/null || true
    kill $IDV_PID 2>/dev/null || true
    kill $BANKING_PID 2>/dev/null || true
    kill $MORTGAGE_PID 2>/dev/null || true
    kill $DISPUTES_PID 2>/dev/null || true
    kill $INVESTIGATION_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Done"
}
trap cleanup EXIT

# Verify services
sleep 3
echo ""
echo "Verifying services..."
echo ""

curl -s http://localhost:9000/health | grep -q "healthy" && echo -e "${GREEN}✅ Local Tools${NC}" || echo -e "${RED}❌ Local Tools${NC}"
curl -s http://localhost:8080/health | grep -q "healthy" && echo -e "${GREEN}✅ Gateway${NC}" || echo -e "${RED}❌ Gateway${NC}"
curl -s http://localhost:8081/health | grep -q "healthy" && echo -e "${GREEN}✅ Triage Agent${NC}" || echo -e "${RED}❌ Triage${NC}"
curl -s http://localhost:8082/health | grep -q "healthy" && echo -e "${GREEN}✅ IDV Agent${NC}" || echo -e "${RED}❌ IDV${NC}"
curl -s http://localhost:8083/health | grep -q "healthy" && echo -e "${GREEN}✅ Banking Agent${NC}" || echo -e "${RED}❌ Banking${NC}"
curl -s http://localhost:8084/health | grep -q "healthy" && echo -e "${GREEN}✅ Mortgage Agent${NC}" || echo -e "${RED}❌ Mortgage${NC}"
curl -s http://localhost:8085/health | grep -q "healthy" && echo -e "${GREEN}✅ Disputes Agent${NC}" || echo -e "${RED}❌ Disputes${NC}"
curl -s http://localhost:8086/health | grep -q "healthy" && echo -e "${GREEN}✅ Investigation Agent${NC}" || echo -e "${RED}❌ Investigation${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}✅ All Services Running (Local, $MODE Mode)${NC}"
echo "========================================="
echo ""
echo "Services:"
echo "  Local Tools:  http://localhost:9000"
echo "  Gateway:      http://localhost:8080"
echo "  Frontend:     http://localhost:3000"
echo ""
echo "Agents (all in $MODE mode):"
echo "  Triage:        http://localhost:8081"
echo "  IDV:           http://localhost:8082"
echo "  Banking:       http://localhost:8083"
echo "  Mortgage:      http://localhost:8084"
echo "  Disputes:      http://localhost:8085"
echo "  Investigation: http://localhost:8086"
echo ""
echo "Logs:"
echo "  All:      tail -f logs/*.log"
echo "  Gateway:  tail -f logs/gateway.log"
echo "  Triage:   tail -f logs/agent-triage.log"
echo "  Frontend: tail -f logs/frontend.log"
echo ""
echo "🎤 Open http://localhost:3000 to start testing!"
echo ""
echo "Press Ctrl+C to stop all services..."
echo ""

wait
