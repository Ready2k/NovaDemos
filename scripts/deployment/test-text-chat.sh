#!/bin/bash

# Test Text Chat - Verify isFinal flag fix
# This script tests that text messages are properly displayed in the frontend

echo "🧪 Testing Text Chat with isFinal Flag Fix"
echo "=========================================="
echo ""

# Check if services are running
echo "1️⃣ Checking if services are running..."
if ! docker-compose -f docker-compose-unified.yml ps | grep -q "Up"; then
    echo "❌ Services are not running. Please start them first:"
    echo "   ./start-unified-docker.sh"
    exit 1
fi
echo "✅ Services are running"
echo ""

# Check agent logs for initialization
echo "2️⃣ Checking agent initialization..."
if docker-compose -f docker-compose-unified.yml logs agent-triage | grep -q "✅ Started successfully"; then
    echo "✅ Agent triage initialized"
else
    echo "⚠️  Agent triage may not be fully initialized"
fi
echo ""

# Check gateway logs
echo "3️⃣ Checking gateway status..."
if docker-compose -f docker-compose-unified.yml logs gateway | grep -q "Gateway server listening"; then
    echo "✅ Gateway is running"
else
    echo "⚠️  Gateway may not be fully initialized"
fi
echo ""

# Instructions for manual testing
echo "4️⃣ Manual Testing Instructions:"
echo "================================"
echo ""
echo "1. Open http://localhost:3000 in your browser"
echo "2. Open browser DevTools (F12) and go to Console tab"
echo "3. Type 'Hello' in the chat input and press Send"
echo ""
echo "Expected Results:"
echo "  ✅ Your message 'Hello' appears in chat"
echo "  ✅ Agent response appears in chat"
echo "  ✅ Console shows: [WebSocket] Received message: transcript"
echo "  ✅ Console shows: isFinal: true"
echo "  ✅ Token counter updates"
echo ""
echo "If you see 'Message received and processed':"
echo "  ❌ The fix didn't work - check agent logs"
echo ""
echo "If you see no response at all:"
echo "  ❌ Check browser console for errors"
echo "  ❌ Check gateway logs: docker-compose -f docker-compose-unified.yml logs gateway"
echo ""

# Check recent agent logs for any errors
echo "5️⃣ Recent agent logs (last 20 lines):"
echo "======================================"
docker-compose -f docker-compose-unified.yml logs --tail=20 agent-triage | grep -E "(Error|error|Failed|failed|✅|❌)" || echo "No errors found"
echo ""

echo "✅ Test setup complete!"
echo ""
echo "📝 To view live logs while testing:"
echo "   docker-compose -f docker-compose-unified.yml logs -f agent-triage gateway"
echo ""
