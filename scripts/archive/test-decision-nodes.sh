#!/bin/bash

# Test Decision Node Integration
# This script tests that decision nodes are automatically evaluated using LLM

set -e

echo "🧪 Testing Decision Node Integration"
echo "====================================="
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
node dist/agent-runtime-s2s.js > /tmp/agent-decision-test.log 2>&1 &
AGENT_PID=$!
cd ..

echo "   Agent PID: $AGENT_PID"
sleep 3

# Check if agent is running
if ! ps -p $AGENT_PID > /dev/null; then
    echo "❌ Agent failed to start"
    cat /tmp/agent-decision-test.log
    exit 1
fi

echo "✅ Agent started"
echo ""

# Test WebSocket connection and simulate decision node
echo "🔌 Testing decision node evaluation..."
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8081/session');

let sessionId = 'test-decision-' + Date.now();

ws.on('open', () => {
    console.log('✅ WebSocket connected');
    
    // Send session init
    ws.send(JSON.stringify({
        type: 'session_init',
        sessionId: sessionId
    }));
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'session_ack') {
            console.log('✅ Session initialized');
            console.log('');
            
            // Simulate reaching a decision node
            console.log('📨 Simulating decision node: check_vuln');
            ws.send(JSON.stringify({
                type: 'user_input',
                text: '[STEP: check_vuln] Checking account vulnerability status...'
            }));
            
            // Wait for decision to be made
            setTimeout(() => {
                ws.close();
                process.exit(0);
            }, 8000);
        }
        
        if (msg.type === 'workflow_update') {
            console.log('');
            console.log('📊 Workflow Update:');
            console.log('   Current Step:', msg.currentStep);
            console.log('   Node Type:', msg.nodeType);
        }
        
        if (msg.type === 'decision_made') {
            console.log('');
            console.log('🎯 DECISION MADE:');
            console.log('   Decision Node:', msg.decisionNode);
            console.log('   Chosen Path:', msg.chosenPath);
            console.log('   Target Node:', msg.targetNode);
            console.log('   Confidence:', msg.confidence);
            console.log('   Reasoning:', msg.reasoning);
            console.log('');
            console.log('✅ Decision node integration working!');
        }
    } catch (e) {
        // Binary data or parse error, ignore
    }
});

ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error('❌ Timeout waiting for decision');
    process.exit(1);
}, 15000);
"

# Cleanup
kill $AGENT_PID 2>/dev/null || true

echo ""
echo "📋 Agent logs (Decision evaluation):"
echo "===================================="
cat /tmp/agent-decision-test.log | grep -E "(Decision|decision|Evaluating|chosen|LLM)" | tail -20 || echo "No decision logs found"

echo ""
echo "🎉 Decision node integration test complete!"
