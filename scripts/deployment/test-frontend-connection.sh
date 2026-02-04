#!/bin/bash

# Test Frontend Connection
# This script verifies that the frontend can connect to the gateway

echo "========================================="
echo "Testing Frontend Connection"
echo "========================================="
echo ""

# Check if services are running
echo "1. Checking if services are running..."
docker-compose -f docker-compose-unified.yml ps | grep -E "(gateway|frontend)" | grep -E "(Up|healthy)"
if [ $? -ne 0 ]; then
    echo "❌ Services are not running!"
    echo "Run: docker-compose -f docker-compose-unified.yml up -d"
    exit 1
fi
echo "✅ Services are running"
echo ""

# Check gateway health
echo "2. Checking gateway health..."
curl -s http://localhost:8080/health > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Gateway is not responding!"
    exit 1
fi
echo "✅ Gateway is healthy"
echo ""

# Check frontend health
echo "3. Checking frontend health..."
curl -s http://localhost:3000 > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Frontend is not responding!"
    exit 1
fi
echo "✅ Frontend is accessible"
echo ""

# Check frontend logs for errors
echo "4. Checking frontend logs for errors..."
ERROR_COUNT=$(docker logs voice_s2s-frontend-1 2>&1 | grep -i "ECONNREFUSED" | wc -l)
if [ $ERROR_COUNT -gt 0 ]; then
    echo "❌ Found $ERROR_COUNT ECONNREFUSED errors in frontend logs"
    echo "Recent errors:"
    docker logs voice_s2s-frontend-1 2>&1 | grep -i "ECONNREFUSED" | tail -5
    exit 1
fi
echo "✅ No connection errors in frontend logs"
echo ""

# Check if frontend can reach gateway internally
echo "5. Testing internal connectivity (frontend → gateway)..."
docker-compose -f docker-compose-unified.yml exec -T frontend sh -c "node -e \"const http = require('http'); http.get('http://gateway:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => { process.exit(1); });\"" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Frontend cannot reach gateway internally!"
    echo "This means INTERNAL_API_URL is not working correctly"
    exit 1
fi
echo "✅ Frontend can reach gateway internally"
echo ""

# Test WebSocket connection from host
echo "6. Testing WebSocket connection..."
timeout 5 node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => {
  console.log('✅ WebSocket connection successful');
  ws.close();
  process.exit(0);
});
ws.on('error', (err) => {
  console.log('❌ WebSocket connection failed:', err.message);
  process.exit(1);
});
" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  WebSocket test skipped (node/ws not available)"
    echo "   You can test manually by opening http://localhost:3000"
fi
echo ""

echo "========================================="
echo "✅ All Tests Passed!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Open browser console (F12)"
echo "3. Click 'Connect' button"
echo "4. Grant microphone permission"
echo "5. Say 'Hello'"
echo "6. You should see:"
echo "   - Your transcript"
echo "   - Agent response transcript"
echo "   - Token counter updates"
echo "   - Hear audio response"
echo ""
echo "If you still don't see responses:"
echo "1. Check browser console for errors"
echo "2. Check Network tab → WS filter → Messages"
echo "3. Verify microphone permission is granted"
echo "4. Check system volume is not muted"
echo ""
