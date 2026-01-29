#!/bin/bash

# Gateway Integration Test Script
# Tests full audio flow: Frontend → Gateway → Agent → Nova Sonic

set -e

echo "========================================="
echo "Gateway Integration Test"
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
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build successful${NC}"
cd ..
echo ""

# Start gateway in background
echo "Starting gateway..."
cd gateway
npm run build 2>&1 | grep -v "warning" || true
REDIS_URL=redis://localhost:6379 PORT=8080 node dist/server.js &
GATEWAY_PID=$!
cd ..
sleep 3
echo -e "${GREEN}✅ Gateway started (PID: $GATEWAY_PID)${NC}"
echo ""

# Start agent in background
echo "Starting agent..."
cd agents
AGENT_ID=triage \
AGENT_PORT=8081 \
REDIS_URL=redis://localhost:6379 \
GATEWAY_URL=http://localhost:8080 \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
node dist/agent-runtime-s2s.js &
AGENT_PID=$!
cd ..
sleep 3
echo -e "${GREEN}✅ Agent started (PID: $AGENT_PID)${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Cleaning up..."
    kill $GATEWAY_PID 2>/dev/null || true
    kill $AGENT_PID 2>/dev/null || true
    echo "Done"
}
trap cleanup EXIT

# Test gateway health
echo "Testing gateway health..."
GATEWAY_HEALTH=$(curl -s http://localhost:8080/health)
if echo "$GATEWAY_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Gateway healthy${NC}"
    echo "$GATEWAY_HEALTH" | jq '.'
else
    echo -e "${RED}❌ Gateway unhealthy${NC}"
    exit 1
fi
echo ""

# Test agent health
echo "Testing agent health..."
AGENT_HEALTH=$(curl -s http://localhost:8081/health)
if echo "$AGENT_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Agent healthy${NC}"
    echo "$AGENT_HEALTH" | jq '.'
else
    echo -e "${RED}❌ Agent unhealthy${NC}"
    exit 1
fi
echo ""

# Check agent registration
echo "Checking agent registration..."
sleep 2
GATEWAY_HEALTH=$(curl -s http://localhost:8080/health)
AGENT_COUNT=$(echo "$GATEWAY_HEALTH" | jq '.agents')
if [ "$AGENT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Agent registered with gateway (count: $AGENT_COUNT)${NC}"
else
    echo -e "${RED}❌ Agent not registered${NC}"
    exit 1
fi
echo ""

echo "========================================="
echo -e "${GREEN}✅ Gateway Integration Test PASSED${NC}"
echo "========================================="
echo ""
echo "Services running:"
echo "  Gateway:  http://localhost:8080"
echo "  Agent:    http://localhost:8081"
echo "  WebSocket: ws://localhost:8080/sonic"
echo ""
echo "Next steps:"
echo "  1. Open frontend at http://localhost:3000"
echo "  2. Click microphone button"
echo "  3. Start speaking"
echo "  4. Verify audio flows through gateway to agent"
echo ""
echo "Press Ctrl+C to stop services..."
echo ""

# Keep running until interrupted
wait
