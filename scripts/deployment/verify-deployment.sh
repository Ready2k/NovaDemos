#!/bin/bash

# Verify Docker Deployment Script
# This script checks that all services are running and healthy

set -e

echo "🔍 Verifying Docker Deployment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if docker-compose is running
echo "1️⃣  Checking if services are running..."
if ! docker-compose -f docker-compose-unified.yml ps | grep -q "Up"; then
    echo -e "${RED}❌ Services are not running. Start them with: ./start-unified-docker.sh${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Services are running${NC}"
echo ""

# Check Gateway health
echo "2️⃣  Checking Gateway health..."
if curl -s http://localhost:8080/health | grep -q "healthy"; then
    echo -e "${GREEN}✅ Gateway is healthy${NC}"
else
    echo -e "${RED}❌ Gateway is not healthy${NC}"
    exit 1
fi
echo ""

# Check Redis
echo "3️⃣  Checking Redis..."
if docker-compose -f docker-compose-unified.yml exec -T redis redis-cli ping | grep -q "PONG"; then
    echo -e "${GREEN}✅ Redis is responding${NC}"
else
    echo -e "${RED}❌ Redis is not responding${NC}"
    exit 1
fi
echo ""

# Check agent registration
echo "4️⃣  Checking agent registration..."
AGENT_COUNT=$(curl -s http://localhost:8080/api/agents | python3 -c "import sys, json; print(len([a for a in json.load(sys.stdin) if a['id'] != 'test' and 'transaction-investigation' not in a['id']]))" 2>/dev/null || echo "0")

if [ "$AGENT_COUNT" -eq 6 ]; then
    echo -e "${GREEN}✅ All 6 agents are registered${NC}"
else
    echo -e "${YELLOW}⚠️  Only $AGENT_COUNT agents registered (expected 6)${NC}"
fi
echo ""

# Check agent health and tools
echo "5️⃣  Checking agent health and tools..."
AGENTS=("triage" "banking" "mortgage" "idv" "disputes" "investigation")
ALL_HEALTHY=true

for agent in "${AGENTS[@]}"; do
    STATUS=$(curl -s http://localhost:8080/api/agents | python3 -c "import sys, json; agents = json.load(sys.stdin); agent = next((a for a in agents if a['id'] == '$agent'), None); print(agent['status'] if agent else 'not found')" 2>/dev/null || echo "error")
    TOOLS=$(curl -s http://localhost:8080/api/agents | python3 -c "import sys, json; agents = json.load(sys.stdin); agent = next((a for a in agents if a['id'] == '$agent'), None); print(len(agent.get('capabilities', {}).get('tools', [])) if agent else 0)" 2>/dev/null || echo "0")
    
    if [ "$STATUS" = "healthy" ] && [ "$TOOLS" -ge 10 ]; then
        echo -e "  ${GREEN}✅ $agent: $STATUS ($TOOLS tools)${NC}"
    else
        echo -e "  ${RED}❌ $agent: $STATUS ($TOOLS tools)${NC}"
        ALL_HEALTHY=false
    fi
done
echo ""

# Check frontend
echo "6️⃣  Checking frontend..."
if curl -s http://localhost:3000 | grep -q "html"; then
    echo -e "${GREEN}✅ Frontend is responding${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend may not be ready yet${NC}"
fi
echo ""

# Check local-tools
echo "7️⃣  Checking local-tools MCP server..."
if curl -s http://localhost:9000/health 2>/dev/null | grep -q "healthy"; then
    echo -e "${GREEN}✅ Local-tools is healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Local-tools health check not available${NC}"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$ALL_HEALTHY" = true ] && [ "$AGENT_COUNT" -eq 6 ]; then
    echo -e "${GREEN}✅ DEPLOYMENT VERIFIED - ALL SYSTEMS OPERATIONAL${NC}"
    echo ""
    echo "Access points:"
    echo "  • Frontend:     http://localhost:3000"
    echo "  • Gateway API:  http://localhost:8080"
    echo "  • Gateway Health: http://localhost:8080/health"
    echo "  • Agents API:   http://localhost:8080/api/agents"
    echo ""
    echo "Next steps:"
    echo "  1. Open http://localhost:3000 in your browser"
    echo "  2. Select a workflow (e.g., 'triage')"
    echo "  3. Start a conversation!"
else
    echo -e "${YELLOW}⚠️  DEPLOYMENT PARTIALLY VERIFIED${NC}"
    echo ""
    echo "Some services may need more time to start."
    echo "Wait 30 seconds and run this script again."
    echo ""
    echo "To check logs:"
    echo "  docker-compose -f docker-compose-unified.yml logs -f"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
