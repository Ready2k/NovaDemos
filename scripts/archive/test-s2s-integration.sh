#!/bin/bash

# One-command S2S integration test
# Assumes AWS credentials are in backend/.env

set -e

echo "🧪 S2S Integration Test"
echo "======================="
echo ""

# Check backend/.env exists
if [ ! -f "backend/.env" ]; then
    echo "❌ ERROR: backend/.env not found"
    echo "Please create backend/.env with AWS credentials"
    exit 1
fi

# Check AWS credentials in .env
if ! grep -q "AWS_ACCESS_KEY_ID" backend/.env; then
    echo "❌ ERROR: AWS_ACCESS_KEY_ID not found in backend/.env"
    exit 1
fi

if ! grep -q "AWS_SECRET_ACCESS_KEY" backend/.env; then
    echo "❌ ERROR: AWS_SECRET_ACCESS_KEY not found in backend/.env"
    exit 1
fi

echo "✅ AWS credentials found in backend/.env"
echo ""

# Check if agents are built
if [ ! -d "agents/dist" ]; then
    echo "📦 Building agents..."
    cd agents
    npm install
    npm run build
    cd ..
    echo "✅ Build complete"
    echo ""
fi

# Start the test stack
echo "🚀 Starting S2S test stack..."
echo ""
echo "Services starting:"
echo "  - Gateway (port 8080)"
echo "  - Triage Agent with S2S (port 8081)"
echo "  - Redis"
echo "  - Local Tools"
echo "  - Frontend (port 3000)"
echo ""
echo "Once started, open: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

docker-compose -f docker-compose-s2s-test.yml up --build
