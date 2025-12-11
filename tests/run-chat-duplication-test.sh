#!/bin/bash

# Chat Duplication Test Runner
# Tests the Nova Sonic chat deduplication system

echo "🧪 Starting Chat Duplication Test..."
echo "This test will send multiple text messages and check for response duplication"

# Check if server is running
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "❌ Server is not running. Please start the backend server first."
    echo "Run: cd backend && npm start"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Run the test
node test-chat-duplication.js

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Chat duplication test PASSED!"
else
    echo ""
    echo "❌ Chat duplication test FAILED!"
    exit 1
fi