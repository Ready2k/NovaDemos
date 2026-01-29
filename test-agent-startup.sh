#!/bin/bash

# Test Agent Startup Script
# Verifies agent starts correctly with handoff tools

echo "🔍 Testing Agent Startup..."
echo ""

# Kill existing agent process
echo "1. Stopping existing agent..."
pkill -f "node dist/agent-runtime-s2s.js" || echo "   No existing agent process"
sleep 2

# Start agent in background
echo "2. Starting agent..."
cd agents
AGENT_ID=triage \
AGENT_PORT=8081 \
AGENT_HOST=localhost \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
GATEWAY_URL=http://localhost:8080 \
node dist/agent-runtime-s2s.js > /tmp/agent-test.log 2>&1 &

AGENT_PID=$!
echo "   Agent started with PID: $AGENT_PID"
sleep 3

# Check if agent is still running
if ps -p $AGENT_PID > /dev/null; then
    echo "   ✅ Agent is running"
else
    echo "   ❌ Agent crashed!"
    echo ""
    echo "📋 Last 50 lines of log:"
    tail -50 /tmp/agent-test.log
    exit 1
fi

# Check logs for handoff tools
echo ""
echo "3. Checking for handoff tools in logs..."
if grep -q "Generated.*handoff tools" /tmp/agent-test.log; then
    echo "   ✅ Handoff tools generated"
    grep "Generated.*handoff tools" /tmp/agent-test.log | tail -1
else
    echo "   ❌ Handoff tools NOT found in logs"
fi

if grep -q "Handoff tools configured" /tmp/agent-test.log; then
    echo "   ✅ Handoff tools configured"
    grep "Handoff tools configured" /tmp/agent-test.log | tail -1
else
    echo "   ❌ Handoff tools NOT configured"
fi

# Check for errors
echo ""
echo "4. Checking for errors..."
if grep -i "error" /tmp/agent-test.log | grep -v "ERROR_LEVEL" | grep -v "FASTMCP_LOG_LEVEL"; then
    echo "   ⚠️  Errors found (see above)"
else
    echo "   ✅ No errors found"
fi

# Show last 20 lines
echo ""
echo "📋 Last 20 lines of log:"
tail -20 /tmp/agent-test.log

# Keep agent running or kill it
echo ""
read -p "Keep agent running? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Stopping agent..."
    kill $AGENT_PID
    echo "Agent stopped"
else
    echo "Agent still running with PID: $AGENT_PID"
    echo "To stop: kill $AGENT_PID"
    echo "To view logs: tail -f /tmp/agent-test.log"
fi
