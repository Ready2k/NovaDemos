#!/bin/bash

echo "🚀 AgentCore Capability Checker"
echo "==============================="
echo ""
echo "This script will check what built-in tools your AgentCore Runtime has access to."
echo "It performs the definitive Tool Handshake (tools/list) to scan for capabilities."
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    exit 1
fi

# Check if we're in the tests directory
if [ ! -f "check-agentcore-capabilities.js" ]; then
    echo "❌ Please run this script from the tests/ directory"
    echo "   cd tests && ./run-capability-check.sh"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check credentials are present in environment (set by start-dev.sh via STS)
if [ -z "$AWS_ACCESS_KEY_ID" ] && [ -z "$NOVA_AWS_ACCESS_KEY_ID" ]; then
    echo "❌ AWS credentials not found in environment."
    echo "   Run: cd .. && ./start-dev.sh"
    echo "   This assumes the VoiceS2S-Bedrock role and exports temp credentials."
    exit 1
fi

if [ -n "$AWS_SESSION_TOKEN" ]; then
    echo "🔑 Using STS assumed-role credentials"
else
    echo "🔑 Using static IAM credentials"
fi
echo ""

echo "🔍 Running capability check..."
echo ""

# Run the capability checker
node check-agentcore-capabilities.js

echo ""
echo "✅ Check completed!"