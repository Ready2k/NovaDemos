#!/bin/bash
set -e

# Define paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend-v2"

echo "=========================================="
echo "Starting Visualizer Test Harness"
echo "=========================================="

# 1. Kill existing Next.js process on port 3000
echo "[1/2] Cleaning up port 3000..."
PID=$(lsof -t -i :3000 || true)
if [ -n "$PID" ]; then
  echo "Killing process $PID"
  kill -9 $PID
else
  echo "No process found on port 3000."
fi

# 2. Start Frontend in Dev Mode
echo "[2/2] Starting Frontend (Dev Mode)..."
echo "URL: http://localhost:3000/visualizer-test"

cd "$FRONTEND_DIR"
# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run dev server
npm run dev
