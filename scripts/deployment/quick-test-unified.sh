#!/bin/bash

# Quick Test Script for Unified Architecture
# Starts just Triage agent for rapid testing

set -e

echo "========================================="
echo "Quick Test: Unified Architecture"
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
    echo "Usage: ./quick-test-unified.sh [voice|text|hybrid]"
    exit 1
fi

echo -e "${BLUE}Testing Mode: $MODE${NC}"
echo ""

# Check .env
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ backend/.env not found${NC}"
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

# Build
echo "Building..."
cd agents && npm run build > /dev/null 2>&1 && cd ..
cd gateway && npm run build > /dev/null 2>&1 && cd ..
echo -e "${GREEN}✅ Built${NC}"
echo ""

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
echo ""

# Start Triage Agent
echo "Starting Triage Agent (MODE=$MODE)..."
cd agents
AGENT_ID=triage \
AGENT_HOST=localhost \
AGENT_PORT=8081 \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
MODE=$MODE \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
node dist/agent-runtime-unified.js > ../logs/agent-triage.log 2>&1 &
TRIAGE_PID=$!
cd ..
sleep 3
echo -e "${GREEN}✅ Triage Agent (PID: $TRIAGE_PID, Port: 8081)${NC}"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $GATEWAY_PID 2>/dev/null || true
    kill $TRIAGE_PID 2>/dev/null || true
    echo "Done"
}
trap cleanup EXIT

# Verify
echo "Verifying services..."
echo ""

GATEWAY_HEALTH=$(curl -s http://localhost:8080/health 2>/dev/null || echo "")
if echo "$GATEWAY_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Gateway healthy${NC}"
else
    echo -e "${RED}❌ Gateway not responding${NC}"
    echo "Check logs: tail -f logs/gateway.log"
fi

TRIAGE_HEALTH=$(curl -s http://localhost:8081/health 2>/dev/null || echo "")
if echo "$TRIAGE_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Triage Agent healthy (MODE=$MODE)${NC}"
else
    echo -e "${RED}❌ Triage Agent not responding${NC}"
    echo "Check logs: tail -f logs/agent-triage.log"
fi

echo ""
echo "Registered agents:"
curl -s http://localhost:8080/api/agents 2>/dev/null | jq -r '.[] | "  - \(.id) (mode: \(.mode // "voice"))"' || echo "  (Unable to fetch)"

echo ""
echo "========================================="
echo -e "${GREEN}✅ Quick Test Ready ($MODE Mode)${NC}"
echo "========================================="
echo ""
echo "Services:"
echo "  Gateway: http://localhost:8080"
echo "  Triage:  http://localhost:8081"
echo ""
echo "Logs:"
echo "  Gateway: tail -f logs/gateway.log"
echo "  Triage:  tail -f logs/agent-triage.log"
echo ""

if [ "$MODE" == "voice" ]; then
    echo "Test Voice Mode:"
    echo "  1. Start frontend: cd frontend-v2 && npm run dev"
    echo "  2. Open http://localhost:3000"
    echo "  3. Click microphone and speak"
    echo ""
elif [ "$MODE" == "text" ]; then
    echo "Test Text Mode:"
    echo "  1. Start frontend: cd frontend-v2 && npm run dev"
    echo "  2. Open http://localhost:3000"
    echo "  3. Type messages and press Enter"
    echo ""
elif [ "$MODE" == "hybrid" ]; then
    echo "Test Hybrid Mode:"
    echo "  1. Start frontend: cd frontend-v2 && npm run dev"
    echo "  2. Open http://localhost:3000"
    echo "  3. Use BOTH voice and text"
    echo ""
fi

echo "Architecture Validation:"
echo "  ✅ Unified runtime (agent-runtime-unified.js)"
echo "  ✅ Mode selection via environment variable"
echo "  ✅ Single codebase for all modes"
echo ""
echo "Press Ctrl+C to stop..."
echo ""

wait
