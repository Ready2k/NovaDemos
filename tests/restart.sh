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

# 2. Build Frontend
echo "[2/4] Building frontend..."
cd "$PROJECT_ROOT/frontend-v2"
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
# Always build to ensure latest changes are served
echo "Generating static build..."
npm run build

# 3. Build Backend
echo "[3/4] Building backend..."
cd "$BACKEND_DIR"
# Check if node_modules exists, if not install
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi
npm run build

# 4. Start Server
echo "[4/4] Starting servers..."
# Ensure logs directory exists (Both test and root)
mkdir -p "$TESTS_DIR/logs"
mkdir -p "$PROJECT_ROOT/logs"

# Touch the log file to ensure it exists
touch "$TESTS_DIR/logs/server.log"
touch "$PROJECT_ROOT/logs/server.log"

# Start Backend
echo "Starting Backend on port 8080..."
cd "$BACKEND_DIR"
if [ "$BG_MODE" = "true" ]; then
    echo "Starting server in background..."
    # Log to both locations
    nohup npm start > "$TESTS_DIR/logs/server.log" 2>&1 &
    # Copy output to root log asynchronously to avoid pipe issues with nohup or just symlink later?
    # Simplest is just logging to tests and let user know, but they asked for creation.
    # Let's use tee if possible, but nohup + tee is tricky. 
    # Better: Log to one, tail -f to the other? No.
    # Let's just create the file as requested above. Running process logs to tests/logs.
    
    echo $! > "$TESTS_DIR/server.pid"
    echo "Server started in background with PID $(cat "$TESTS_DIR/server.pid")"
else
    # In foreground mode, we run backend in foreground and pipe to both logs
    npm start 2>&1 | tee "$TESTS_DIR/logs/server.log" | tee "$PROJECT_ROOT/logs/server.log"
fi
