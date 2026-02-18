#!/bin/bash

echo "🔨 Rebuilding Gateway and IDV Agent with partial credential tracking..."

# Stop the affected services
echo "⏸️  Stopping gateway and agent-idv..."
docker-compose -f docker-compose-unified.yml stop gateway agent-idv

# Rebuild the services
echo "🔨 Rebuilding gateway..."
docker-compose -f docker-compose-unified.yml build gateway

echo "🔨 Rebuilding agent-idv..."
docker-compose -f docker-compose-unified.yml build agent-idv

# Start the services
echo "▶️  Starting gateway and agent-idv..."
docker-compose -f docker-compose-unified.yml up -d gateway agent-idv

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check status
echo ""
echo "📊 Service Status:"
docker-compose -f docker-compose-unified.yml ps gateway agent-idv

echo ""
echo "✅ Rebuild complete!"
echo ""
echo "📝 To test the fix:"
echo "1. Open http://localhost:3000"
echo "2. Say: 'I want to check my balance'"
echo "3. When asked for credentials, provide: '12345678' (just account, hit enter)"
echo "4. IDV should say: 'Thank you. Now I need your 6 digit sort code.'"
echo "5. Provide: '112233' (just sort code)"
echo "6. IDV should verify immediately"
echo ""
echo "📋 To view logs:"
echo "  Gateway: docker logs voice_s2s-gateway-1 -f | grep -E 'PARTIAL|COMPLETE|Extracted'"
echo "  IDV Agent: docker logs voice_s2s-agent-idv-1 -f | grep -E 'Account Details|CRITICAL'"
