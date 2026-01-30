#!/bin/bash

echo "Stopping frontend service..."
pkill -f "next dev" || pkill -f "node.*frontend" || true

echo "Clearing cache..."
rm -rf frontend-v2/.next frontend-v2/dist frontend-v2/node_modules/.cache

echo "Rebuilding frontend..."
cd frontend-v2
npm run build

echo "Starting frontend..."
npm run dev &

echo "Frontend restarted!"
echo "Open http://localhost:3000 in your browser"
