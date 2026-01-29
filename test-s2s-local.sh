#!/bin/bash

# Local S2S test - no Docker needed
# Tests just the agent with S2S integration

set -e

echo "🧪 S2S Local Test (No Docker)"
echo "=============================="
echo ""

# Check backend/.env exists
if [ ! -f "backend/.env" ]; then
    echo "❌ ERROR: backend/.env not found"
    exit 1
fi

# Load environment variables from backend/.env
export $(cat backend/.env | grep -v '^#' | xargs)

# Verify AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "❌ ERROR: AWS_ACCESS_KEY_ID not set in backend/.env"
    exit 1
fi

if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ ERROR: AWS_SECRET_ACCESS_KEY not set in backend/.env"
    exit 1
fi

echo "✅ AWS credentials loaded from backend/.env"
echo "   Region: ${AWS_REGION:-us-east-1}"
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

# Start the agent
echo "🚀 Starting Triage Agent with S2S..."
echo ""
echo "Configuration:"
echo "  Agent ID: triage"
echo "  Port: 8081"
echo "  Workflow: backend/workflows/workflow_triage.json"
echo "  S2S Mode: ENABLED"
echo ""
echo "The agent will start and wait for connections."
echo "You can test it by:"
echo "  1. Starting the gateway separately"
echo "  2. Or connecting directly to ws://localhost:8081/session"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd agents

AGENT_ID=triage \
AGENT_PORT=8081 \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
GATEWAY_URL=http://localhost:8080 \
LOCAL_TOOLS_URL=http://localhost:9000 \
node dist/agent-runtime-s2s.js
