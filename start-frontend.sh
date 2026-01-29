#!/bin/bash

# Start Frontend Script
# Starts the Next.js frontend on port 3000

set -e

echo "========================================="
echo "Starting Frontend"
echo "========================================="
echo ""

# Check if node_modules exists
if [ ! -d "frontend-v2/node_modules" ]; then
    echo "Installing dependencies..."
    cd frontend-v2
    npm install
    cd ..
    echo ""
fi

# Start frontend
echo "Starting Next.js development server..."
echo "Frontend will be available at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd frontend-v2
npm run dev
