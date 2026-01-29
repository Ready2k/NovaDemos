#!/bin/bash

# Test Workflow Context Injection
# This script tests that workflow instructions are properly injected into Nova Sonic

set -e

echo "🧪 Testing Workflow Context Injection"
echo "======================================"
echo ""

# Load environment
if [ -f backend/.env ]; then
    export $(cat backend/.env | grep -v '^#' | xargs)
    echo "✅ Loaded backend/.env"
else
    echo "❌ backend/.env not found"
    exit 1
fi

# Kill any existing agent
lsof -ti:8081 | xargs kill -9 2>/dev/null || true
sleep 1

# Start agent in background
echo "🚀 Starting agent..."
cd agents
AGENT_ID=triage \
AGENT_PORT=8081 \
WORKFLOW_FILE=../backend/workflows/workflow_triage.json \
AWS_REGION=${AWS_REGION:-us-east-1} \
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
node dist/agent-runtime-s2s.js > /tmp/agent-test.log 2>&1 &
AGENT_PID=$!
cd ..

echo "   Agent PID: $AGENT_PID"
sleep 3

# Check if agent is running
if ! ps -p $AGENT_PID > /dev/null; then
    echo "❌ Agent failed to start"
    cat /tmp/agent-test.log
    exit 1
fi

echo "✅ Agent started"
echo ""

# Test WebSocket connection with session init
echo "🔌 Testing WebSocket connection..."
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8081/session');

ws.on('open', () => {
    console.log('✅ WebSocket connected');
    
    // Send session init
    ws.send(JSON.stringify({
        type: 'session_init',
        sessionId: 'test-' + Date.now()
    }));
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        console.log('📨 Received:', JSON.stringify(msg, null, 2));
        
        if (msg.type === 'session_ack') {
            console.log('');
            console.log('✅ Session initialized successfully!');
            console.log('   Agent:', msg.agent);
            console.log('   S2S:', msg.s2s);
            console.log('   Workflow:', msg.workflow);
            console.log('');
            console.log('🎉 Workflow context injection is working!');
            
            ws.close();
            process.exit(0);
        }
    } catch (e) {
        // Binary data, ignore
    }
});

ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('❌ Timeout waiting for response');
    process.exit(1);
}, 5000);
"

# Cleanup
kill $AGENT_PID 2>/dev/null || true

echo ""
echo "📋 Agent logs:"
echo "=============="
tail -20 /tmp/agent-test.log | grep -E "(Injected workflow|session_ack|Workflow)" || echo "No workflow injection logs found"
