#!/bin/bash

# Simplest possible test - just verify the agent can start

set -e

echo "🧪 Simple S2S Test"
echo "=================="
echo ""

# Load env
if [ -f "backend/.env" ]; then
    # Source the file to export variables
    set -a
    source backend/.env
    set +a
    echo "✅ Loaded backend/.env"
    echo "   AWS_REGION: ${AWS_REGION:-not set}"
    echo "   AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:0:10}... (${#AWS_ACCESS_KEY_ID} chars)"
else
    echo "❌ backend/.env not found"
    exit 1
fi

# Verify credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ AWS credentials not found in backend/.env"
    echo ""
    echo "Please add to backend/.env:"
    echo "  AWS_ACCESS_KEY_ID=your-key"
    echo "  AWS_SECRET_ACCESS_KEY=your-secret"
    echo "  AWS_REGION=us-east-1"
    exit 1
fi

# Build if needed
if [ ! -d "agents/dist" ]; then
    echo "📦 Building..."
    cd agents && npm install && npm run build && cd ..
fi

echo "✅ Build ready"
echo ""

# Just start it
echo "🚀 Starting agent..."
echo "   If you see 'S2S Mode: ENABLED' - it works!"
echo ""

cd agents
AGENT_ID=triage \
AGENT_PORT=8081 \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
GATEWAY_URL=http://localhost:8080 \
node dist/agent-runtime-s2s.js
