#!/bin/bash

echo "🚀 Starting A2A System"
echo "====================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create it from .env.example"
    exit 1
fi

echo "✅ .env file found"
echo ""

# Start the system
echo "🔧 Building and starting services..."
echo "   This may take a few minutes on first run..."
echo ""

docker-compose -f docker-compose-a2a.yml up --build -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

echo ""
echo "🔍 Checking service health..."
echo ""

# Check Gateway
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "✅ Gateway is running (port 8080)"
else
    echo "⚠️  Gateway not responding yet (port 8080)"
fi

# Check Local Tools
if curl -s http://localhost:9000/health > /dev/null 2>&1; then
    echo "✅ Local Tools is running (port 9000)"
else
    echo "⚠️  Local Tools not responding yet (port 9000)"
fi

# Check Frontend
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend is running (port 3000)"
else
    echo "⚠️  Frontend not responding yet (port 3000)"
fi

echo ""
echo "📊 Checking agent registration..."
AGENTS=$(curl -s http://localhost:8080/api/agents 2>/dev/null)
if [ -n "$AGENTS" ]; then
    echo "$AGENTS" | jq -r '.[] | "✅ \(.id) agent registered (port \(.port))"' 2>/dev/null || echo "$AGENTS"
else
    echo "⚠️  No agents registered yet (they may still be starting)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 A2A System Started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Run health checks:"
echo "   ./test-a2a-chat.sh"
echo ""
echo "2. Open browser:"
echo "   http://localhost:3000"
echo ""
echo "3. Test conversation:"
echo "   You: 'I need to check my balance'"
echo "   Provide: 'account 12345678 sort code 112233'"
echo "   Expected: Balance of £1200"
echo ""
echo "4. View logs:"
echo "   docker-compose -f docker-compose-a2a.yml logs -f gateway"
echo "   docker-compose -f docker-compose-a2a.yml logs -f agent-triage"
echo "   docker-compose -f docker-compose-a2a.yml logs -f local-tools"
echo ""
echo "5. Stop system:"
echo "   docker-compose -f docker-compose-a2a.yml down"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
