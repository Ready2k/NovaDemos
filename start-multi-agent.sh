#!/bin/bash

# Start Multi-Agent System
# Starts Gateway + Multiple Agents (Triage, IDV, Banking) + Frontend

set -e

echo "========================================="
echo "Starting Multi-Agent System (A2A)"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Load environment
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ backend/.env not found${NC}"
    exit 1
fi

export $(cat backend/.env | grep -v '^#' | xargs)

if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo -e "${RED}❌ AWS credentials not set${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS credentials loaded${NC}"

# Check Redis
if ! docker ps | grep -q redis; then
    echo "Starting Redis..."
    docker run -d --name redis -p 6379:6379 redis:7-alpine
    sleep 2
fi
echo -e "${GREEN}✅ Redis running${NC}"

# Build
echo "Building..."
cd agents && npm run build > /dev/null 2>&1 && cd ..
cd gateway && npm run build > /dev/null 2>&1 && cd ..
echo -e "${GREEN}✅ Built${NC}"

# Create logs
mkdir -p logs

# Start Gateway
echo "Starting Gateway..."
cd gateway
REDIS_URL=redis://localhost:6379 PORT=8080 node dist/server.js > ../logs/gateway.log 2>&1 &
GATEWAY_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Gateway (PID: $GATEWAY_PID)${NC}"

# Start Triage Agent
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
echo -e "${GREEN}✅ Triage Agent (PID: $TRIAGE_PID, Port: 8081)${NC}"

# Start IDV Agent
echo "Starting IDV Agent..."
cd agents
AGENT_ID=idv \
AGENT_HOST=localhost \
AGENT_PORT=8082 \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
MODE=voice \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_idv.json \
node dist/agent-runtime-unified.js > ../logs/agent-idv.log 2>&1 &
IDV_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ IDV Agent (PID: $IDV_PID, Port: 8082)${NC}"

# Start Banking Agent
echo "Starting Banking Agent..."
cd agents
AGENT_ID=persona-SimpleBanking \
AGENT_HOST=localhost \
AGENT_PORT=8083 \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
MODE=voice \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_banking-master.json \
node dist/agent-runtime-unified.js > ../logs/agent-banking.log 2>&1 &
BANKING_PID=$!
cd ..
sleep 2
echo -e "${GREEN}✅ Banking Agent (PID: $BANKING_PID, Port: 8083)${NC}"

# Start Frontend
echo "Starting Frontend..."
cd frontend-v2
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 5
echo -e "${GREEN}✅ Frontend (PID: $FRONTEND_PID)${NC}"

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $GATEWAY_PID 2>/dev/null || true
    kill $TRIAGE_PID 2>/dev/null || true
    kill $IDV_PID 2>/dev/null || true
    kill $BANKING_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Done"
}
trap cleanup EXIT

# Verify
sleep 3
echo ""
echo "Verifying services..."

curl -s http://localhost:8080/health | grep -q "healthy" && echo -e "${GREEN}✅ Gateway${NC}" || echo -e "${RED}❌ Gateway${NC}"
curl -s http://localhost:8081/health | grep -q "healthy" && echo -e "${GREEN}✅ Triage Agent${NC}" || echo -e "${RED}❌ Triage${NC}"
curl -s http://localhost:8082/health | grep -q "healthy" && echo -e "${GREEN}✅ IDV Agent${NC}" || echo -e "${RED}❌ IDV${NC}"
curl -s http://localhost:8083/health | grep -q "healthy" && echo -e "${GREEN}✅ Banking Agent${NC}" || echo -e "${RED}❌ Banking${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}✅ Multi-Agent System Running${NC}"
echo "========================================="
echo ""
echo "Services:"
echo "  Gateway:        http://localhost:8080"
echo "  Triage Agent:   http://localhost:8081"
echo "  IDV Agent:      http://localhost:8082"
echo "  Banking Agent:  http://localhost:8083"
echo "  Frontend:       http://localhost:3000"
echo ""
echo "Logs:"
echo "  Gateway:  tail -f logs/gateway.log"
echo "  Triage:   tail -f logs/agent-triage.log"
echo "  IDV:      tail -f logs/agent-idv.log"
echo "  Banking:  tail -f logs/agent-banking.log"
echo "  Frontend: tail -f logs/frontend.log"
echo ""
echo "Watch handoffs:"
echo "  tail -f logs/gateway.log | grep -E 'handoff|HANDOFF'"
echo ""
echo "========================================="
echo "🎤 READY FOR MULTI-AGENT TESTING!"
echo "========================================="
echo ""
echo "Expected Journey:"
echo "  1. User: 'I want to check my balance'"
echo "  2. Triage → IDV (for verification)"
echo "  3. IDV → Banking (after verification)"
echo "  4. Banking → Triage (after balance check)"
echo ""
echo "Press Ctrl+C to stop all services..."
echo ""

wait
