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

# 1b. Kill existing process on port 3001
echo "[1/3] Cleaning up port 3001..."
PID=$(lsof -t -i :3001 || true)
if [ -n "$PID" ]; then
  echo "Killing process $PID"
  kill -9 $PID
else
  echo "No process found on port 3001."
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
# 3. Start Servers
echo "[3/3] Starting servers..."
# Ensure logs directory exists
mkdir -p "$TESTS_DIR/logs"

# Start Frontend
echo "Starting Frontend on port 3001..."
cd "$PROJECT_ROOT/frontend-v2"
nohup npm run dev -- --port 3001 > "$TESTS_DIR/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID $FRONTEND_PID"

# Start Backend
echo "Starting Backend on port 8080..."
cd "$BACKEND_DIR"
if [ "$BG_MODE" = "true" ]; then
    echo "Starting server in background..."
    nohup npm start > "$TESTS_DIR/logs/server.log" 2>&1 &
    echo $! > "$TESTS_DIR/server.pid"
    echo "Server started in background with PID $(cat "$TESTS_DIR/server.pid")"
else
    # In foreground mode, we run backend in foreground but maybe we want to see logs?
    # actually, usually restart.sh behaves as "start and stay running".
    # User was seeing "npm start" output.
    # To keep previous behavior but also run frontend, we can run backend in fg.
    npm start 2>&1 | tee "$TESTS_DIR/logs/server.log"
    
    # If backend stops, kill frontend
    kill $FRONTEND_PID
fi
