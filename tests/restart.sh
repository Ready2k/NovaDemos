#!/bin/bash
set -e

# Define paths
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TESTS_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "=========================================="
echo "Restarting Voice S2S Service"
echo "=========================================="

# 1. Kill existing process on port 8080
echo "[1/3] Cleaning up port 8080..."
PID=$(lsof -t -i :8080 || true)
if [ -n "$PID" ]; then
  echo "Killing process $PID"
  kill -9 $PID
else
  echo "No process found on port 8080."
fi

# 2. Build Backend
echo "[2/3] Building backend..."
cd "$BACKEND_DIR"
# Check if node_modules exists, if not install
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi
npm run build

# 3. Start Server
echo "[3/3] Starting server..."
# Ensure logs directory exists
mkdir -p "$TESTS_DIR/logs"
# Create server.log if it doesn't exist
touch "$TESTS_DIR/logs/server.log"
# Check if running in background mode
if [ "$BG_MODE" = "true" ]; then
    echo "Starting server in background..."
    nohup npm start > "$TESTS_DIR/logs/server.log" 2>&1 &
    echo $! > "$TESTS_DIR/server.pid"
    echo "Server started in background with PID $(cat "$TESTS_DIR/server.pid")"
else
    npm start > "$TESTS_DIR/logs/server.log" 2>&1
fi
