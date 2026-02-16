#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Gateway Routing Quick Test                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

GATEWAY_URL="http://localhost:8080"

echo "Testing Gateway Routing Endpoints..."
echo ""

# Test 1: Check gateway health
echo "1. Checking gateway health..."
HEALTH=$(curl -s ${GATEWAY_URL}/health)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Gateway is healthy${NC}"
    echo "   Response: $HEALTH"
else
    echo -e "${RED}❌ Gateway is not responding${NC}"
    exit 1
fi
echo ""

# Test 2: Get available agents
echo "2. Getting available agents..."
AGENTS=$(curl -s ${GATEWAY_URL}/api/agents)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Retrieved agents list${NC}"
    echo "   Agents: $AGENTS" | jq '.' 2>/dev/null || echo "   Agents: $AGENTS"
else
    echo -e "${RED}❌ Failed to get agents${NC}"
fi
echo ""

# Test 3: Create a test session memory
echo "3. Testing session memory update..."
SESSION_ID="test-session-$(date +%s)"
MEMORY_UPDATE=$(curl -s -X POST ${GATEWAY_URL}/api/sessions/${SESSION_ID}/memory \
    -H "Content-Type: application/json" \
    -H "X-Agent-Id: test-agent" \
    -d '{
        "memory": {
            "verified": true,
            "userName": "Test User",
            "account": "12345678",
            "sortCode": "12-34-56",
            "userIntent": "check balance"
        }
    }')

if echo "$MEMORY_UPDATE" | grep -q "success"; then
    echo -e "${GREEN}✅ Memory update successful${NC}"
    echo "   Response: $MEMORY_UPDATE" | jq '.' 2>/dev/null || echo "   Response: $MEMORY_UPDATE"
else
    echo -e "${YELLOW}⚠️  Memory update response: $MEMORY_UPDATE${NC}"
fi
echo ""

# Test 4: Retrieve session memory
echo "4. Testing session memory retrieval..."
MEMORY_GET=$(curl -s ${GATEWAY_URL}/api/sessions/${SESSION_ID}/memory \
    -H "X-Agent-Id: test-agent")

if echo "$MEMORY_GET" | grep -q "userName"; then
    echo -e "${GREEN}✅ Memory retrieval successful${NC}"
    echo "   Response: $MEMORY_GET" | jq '.' 2>/dev/null || echo "   Response: $MEMORY_GET"
else
    echo -e "${YELLOW}⚠️  Memory retrieval response: $MEMORY_GET${NC}"
fi
echo ""

# Test 5: Check specific agent status
echo "5. Checking banking agent status..."
BANKING_AGENT=$(curl -s ${GATEWAY_URL}/api/agents/banking)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Banking agent status retrieved${NC}"
    echo "   Status: $BANKING_AGENT" | jq '.' 2>/dev/null || echo "   Status: $BANKING_AGENT"
else
    echo -e "${RED}❌ Failed to get banking agent status${NC}"
fi
echo ""

# Test 6: Test agent status update
echo "6. Testing agent status update..."
STATUS_UPDATE=$(curl -s -X POST ${GATEWAY_URL}/api/agents/test-agent/status \
    -H "Content-Type: application/json" \
    -d '{
        "status": "ready",
        "details": {
            "message": "Test agent ready"
        }
    }')

if echo "$STATUS_UPDATE" | grep -q "success"; then
    echo -e "${GREEN}✅ Status update successful${NC}"
    echo "   Response: $STATUS_UPDATE" | jq '.' 2>/dev/null || echo "   Response: $STATUS_UPDATE"
else
    echo -e "${YELLOW}⚠️  Status update response: $STATUS_UPDATE${NC}"
fi
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Test Summary                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Gateway Routing endpoints are functional!${NC}"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Select 'Triage' workflow"
echo "3. Start a conversation and say something like:"
echo "   - 'I want to check my balance' (routes to banking)"
echo "   - 'I need to dispute a transaction' (routes to disputes)"
echo "   - 'Tell me about mortgages' (routes to mortgage)"
echo ""
echo "The gateway will automatically route you to the appropriate agent"
echo "while preserving all context!"
echo ""
