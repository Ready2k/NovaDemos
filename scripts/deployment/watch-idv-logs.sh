#!/bin/bash

echo "👀 Watching Gateway and IDV logs for credential tracking..."
echo "Press Ctrl+C to stop"
echo ""
echo "=== GATEWAY LOGS (Credential Extraction) ==="
echo ""

# Watch both logs simultaneously
docker logs voice_s2s-gateway-1 -f 2>&1 | grep --line-buffered -E "Extracted|PARTIAL|COMPLETE|graphState|text_input" &
GATEWAY_PID=$!

echo ""
echo "=== IDV AGENT LOGS (System Prompt Context) ==="
echo ""

docker logs voice_s2s-agent-idv-1 -f 2>&1 | grep --line-buffered -E "Account Details|CRITICAL INSTRUCTION|account|sort code|graphState" &
IDV_PID=$!

# Wait for Ctrl+C
trap "kill $GATEWAY_PID $IDV_PID 2>/dev/null; exit" INT

wait
