#!/bin/bash

# Test LangGraph State Synchronization
# This script tests that workflow state updates are properly synchronized with GraphExecutor

set -e

echo "🧪 Testing LangGraph State Synchronization"
echo "=========================================="
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
node dist/agent-runtime-s2s.js > /tmp/agent-langgraph-test.log 2>&1 &
AGENT_PID=$!
cd ..

echo "   Agent PID: $AGENT_PID"
sleep 3

# Check if agent is running
if ! ps -p $AGENT_PID > /dev/null; then
    echo "❌ Agent failed to start"
    cat /tmp/agent-langgraph-test.log
    exit 1
fi

echo "✅ Agent started"
echo ""

# Test WebSocket connection and simulate workflow steps
echo "🔌 Testing workflow state transitions..."
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8081/session');

let sessionId = 'test-langgraph-' + Date.now();

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
            
            // Simulate Nova Sonic sending transcript with [STEP: tag]
            console.log('📨 Simulating workflow step: triage_start');
            ws.send(JSON.stringify({
                type: 'user_input',
                text: '[STEP: triage_start] Hello, I can help you today.'
            }));
            
            setTimeout(() => {
                console.log('📨 Simulating workflow step: check_vuln');
                ws.send(JSON.stringify({
                    type: 'user_input',
                    text: '[STEP: check_vuln] Let me check your account status.'
                }));
                
                setTimeout(() => {
                    console.log('📨 Simulating workflow step: triage_success');
                    ws.send(JSON.stringify({
                        type: 'user_input',
                        text: '[STEP: triage_success] Your account is in good standing.'
                    }));
                    
                    setTimeout(() => {
                        ws.close();
                        process.exit(0);
                    }, 1000);
                }, 1000);
            }, 1000);
        }
        
        if (msg.type === 'workflow_update') {
            console.log('');
            console.log('📊 Workflow Update Received:');
            console.log('   Current Step:', msg.currentStep);
            console.log('   Previous Step:', msg.previousStep);
            console.log('   Node Type:', msg.nodeType);
            console.log('   Node Label:', msg.nodeLabel);
            if (msg.nextSteps && msg.nextSteps.length > 0) {
                console.log('   Next Steps:', msg.nextSteps.map(n => n.id).join(', '));
            }
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
    console.error('❌ Timeout waiting for response');
    process.exit(1);
}, 10000);
"

# Cleanup
kill $AGENT_PID 2>/dev/null || true

echo ""
echo "📋 Agent logs (LangGraph state updates):"
echo "========================================"
cat /tmp/agent-langgraph-test.log | grep -E "(Graph state|Workflow transition|Next nodes|Node type)" || echo "No state update logs found"

echo ""
echo "🎉 LangGraph state synchronization test complete!"
