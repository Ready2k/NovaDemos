#!/bin/bash

# Restart Multi-Agent System with Docker Compose
# This script stops, rebuilds, and restarts all multi-agent services

set -e

echo "========================================="
echo "Restarting Multi-Agent System"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check for .env file
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo "Please create .env with AWS credentials"
    exit 1
fi

echo -e "${GREEN}✅ Found .env file${NC}"

# Load and verify AWS credentials
export $(cat .env | grep -v '^#' | xargs)

if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo -e "${RED}❌ AWS credentials not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS credentials loaded${NC}"
echo ""

# Stop existing containers
echo "Stopping existing containers..."
docker-compose -f docker-compose-a2a.yml down
echo -e "${GREEN}✅ Containers stopped${NC}"
echo ""

# Rebuild agent image (since we modified the code)
echo "Rebuilding agent image..."
docker-compose -f docker-compose-a2a.yml build agent-triage
echo -e "${GREEN}✅ Agent image rebuilt${NC}"
echo ""

# Start all services
echo "Starting all services..."
docker-compose -f docker-compose-a2a.yml up -d
echo -e "${GREEN}✅ Services started${NC}"
echo ""

# Wait for services to initialize
echo "Waiting for services to initialize..."
sleep 10

# Check service health
echo ""
echo "Checking service health..."
echo ""

# Check Gateway
GATEWAY_HEALTH=$(curl -s http://localhost:8080/health 2>/dev/null || echo "")
if echo "$GATEWAY_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Gateway healthy${NC}"
else
    echo -e "${RED}❌ Gateway not responding${NC}"
    echo "Check logs: docker logs voice_s2s-gateway-1"
fi

# Check Triage Agent
TRIAGE_HEALTH=$(curl -s http://localhost:8081/health 2>/dev/null || echo "")
if echo "$TRIAGE_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Triage Agent healthy${NC}"
else
    echo -e "${RED}❌ Triage Agent not responding${NC}"
    echo "Check logs: docker logs voice_s2s-agent-triage-1"
fi

# Check Banking Agent
BANKING_HEALTH=$(curl -s http://localhost:8082/health 2>/dev/null || echo "")
if echo "$BANKING_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Banking Agent healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Banking Agent not responding${NC}"
fi

# Check registered agents
echo ""
echo "Registered agents:"
curl -s http://localhost:8080/api/agents 2>/dev/null | jq -r '.[] | "  - \(.id) (\(.voiceId))"' || echo "  (Unable to fetch)"

echo ""
echo "========================================="
echo -e "${GREEN}✅ Multi-Agent System Running${NC}"
echo "========================================="
echo ""
echo "Services:"
echo "  Gateway:  http://localhost:8080"
echo "  Frontend: http://localhost:3000"
echo ""
echo "Agents:"
echo "  Triage:        http://localhost:8081 (matthew)"
echo "  Banking:       http://localhost:8082 (joanna)"
echo "  Mortgage:      http://localhost:8083 (ruth)"
echo "  IDV:           http://localhost:8084 (stephen)"
echo "  Disputes:      http://localhost:8085 (danielle)"
echo "  Investigation: http://localhost:8086 (stephen)"
echo ""
echo "View logs:"
echo "  All:    docker-compose -f docker-compose-a2a.yml logs -f"
echo "  Triage: docker logs voice_s2s-agent-triage-1 -f"
echo "  Gateway: docker logs voice_s2s-gateway-1 -f"
echo ""
echo "Test handoffs:"
echo "  1. Open http://localhost:3000"
echo "  2. Select 'Triage Agent'"
echo "  3. Say: 'I need to check my balance'"
echo "  4. Listen for voice change (matthew → joanna)"
echo ""
