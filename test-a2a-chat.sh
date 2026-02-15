#!/bin/bash

# Test A2A System via Chat Interface
# This script tests the A2A system by sending text messages to the gateway

echo "🧪 Testing A2A System - Chat Interface"
echo "========================================"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "⚠️  jq is not installed. Install it for better JSON formatting:"
    echo "   brew install jq"
    echo ""
fi

# Gateway URL
GATEWAY_URL="http://localhost:8080"

# Test 1: Check Gateway Health
echo "1️⃣  Testing Gateway Health..."
curl -s "${GATEWAY_URL}/health" | jq '.' || curl -s "${GATEWAY_URL}/health"
echo ""
echo ""

# Test 2: Check Registered Agents
echo "2️⃣  Checking Registered Agents..."
curl -s "${GATEWAY_URL}/api/agents" | jq '.' || curl -s "${GATEWAY_URL}/api/agents"
echo ""
echo ""

# Test 3: Check Local Tools Health
echo "3️⃣  Testing Local Tools Service..."
curl -s "http://localhost:9000/health" | jq '.' || curl -s "http://localhost:9000/health"
echo ""
echo ""

# Test 4: List Available Tools
echo "4️⃣  Listing Available Tools..."
curl -s "http://localhost:9000/tools/list" | jq '.tools[] | {name: .name, description: .description}' || curl -s "http://localhost:9000/tools/list"
echo ""
echo ""

# Test 5: Test IDV Check Directly
echo "5️⃣  Testing IDV Check Tool Directly..."
echo "   Account: 12345678, Sort Code: 112233"
curl -s -X POST "http://localhost:9000/tools/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "perform_idv_check",
    "input": {
      "accountNumber": "12345678",
      "sortCode": "112233"
    }
  }' | jq '.' || curl -s -X POST "http://localhost:9000/tools/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "perform_idv_check",
    "input": {
      "accountNumber": "12345678",
      "sortCode": "112233"
    }
  }'
echo ""
echo ""

# Test 6: Test Balance Check Directly
echo "6️⃣  Testing Balance Check Tool Directly..."
echo "   Account: 12345678, Sort Code: 112233"
curl -s -X POST "http://localhost:9000/tools/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agentcore_balance",
    "input": {
      "accountNumber": "12345678",
      "sortCode": "112233"
    }
  }' | jq '.' || curl -s -X POST "http://localhost:9000/tools/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agentcore_balance",
    "input": {
      "accountNumber": "12345678",
      "sortCode": "112233"
    }
  }'
echo ""
echo ""

echo "✅ Direct tool tests complete!"
echo ""
echo "📝 Next Steps:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Connect to the gateway"
echo "   3. Send message: 'I need to check my balance'"
echo "   4. When asked, provide: 'account 12345678 sort code 112233'"
echo "   5. Expected balance: £1200"
echo ""
echo "   To check for disputes, after balance check say:"
echo "   'Show me my recent transactions'"
echo "   Expected: 3 transactions with disputes"
echo ""
