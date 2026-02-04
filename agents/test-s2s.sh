#!/bin/bash

# Test script for S2S integration in agents

echo "🧪 Testing S2S Integration in Agent Runtime"
echo "==========================================="
echo ""

# Check if AWS credentials are set
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ ERROR: AWS credentials not set"
    echo "Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
    exit 1
fi

echo "✅ AWS credentials configured"
echo "   Region: ${AWS_REGION:-us-east-1}"
echo ""

# Check if workflow file exists
WORKFLOW_FILE="${WORKFLOW_FILE:-./workflows/workflow_triage.json}"
if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "❌ ERROR: Workflow file not found: $WORKFLOW_FILE"
    exit 1
fi

echo "✅ Workflow file found: $WORKFLOW_FILE"
echo ""

# Build the agent
echo "📦 Building agent..."
cd "$(dirname "$0")"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""

# Start the agent with S2S runtime
echo "🚀 Starting agent with Unified Runtime (voice mode)..."
echo "   Agent ID: ${AGENT_ID:-triage}"
echo "   Port: ${AGENT_PORT:-8081}"
echo ""

AGENT_ID="${AGENT_ID:-triage}" \
AGENT_PORT="${AGENT_PORT:-8081}" \
MODE=voice \
WORKFLOW_FILE="$WORKFLOW_FILE" \
AWS_REGION="${AWS_REGION:-us-east-1}" \
AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
GATEWAY_URL="${GATEWAY_URL:-http://gateway:8080}" \
node dist/agent-runtime-unified.js

