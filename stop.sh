#!/bin/bash
# Stop all Voice S2S local services.

stopped=0

kill_port() {
    local port=$1
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "Stopping process(es) on port $port (PID: $pids)"
        echo "$pids" | xargs kill -9 2>/dev/null
        stopped=$((stopped + 1))
    fi
}

kill_pattern() {
    local pattern=$1
    local pids
    pids=$(pgrep -f "$pattern" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "Stopping: $pattern (PID: $pids)"
        echo "$pids" | xargs kill -9 2>/dev/null
        stopped=$((stopped + 1))
    fi
}

kill_port 8080
kill_port 3000
kill_pattern "node dist/server.js"
kill_pattern "next dev"

# Clean up PID file if present
PID_FILE="$(dirname "$0")/server.pid"
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    kill -9 "$PID" 2>/dev/null && echo "Stopped background server (PID: $PID)"
    rm -f "$PID_FILE"
fi

if [ "$stopped" -eq 0 ]; then
    echo "No services were running."
else
    echo "Done."
fi
