#!/bin/bash

echo "==================================="
echo "Testing Memory Fix - Verified User Context"
echo "==================================="
echo ""
echo "This test verifies that:"
echo "1. IDV agent stores verified user in session memory"
echo "2. Gateway updates Redis with verified user data"
echo "3. Banking agent receives and uses verified user context"
echo ""
echo "Expected Journey:"
echo "  User → Triage → IDV (verify) → Banking (with name) → Triage"
echo ""
echo "==================================="
echo ""

# Clear old logs
echo "Clearing old logs..."
rm -f logs/*.log

# Start services
echo "Starting services..."
./restart-local-services.sh

echo ""
echo "==================================="
echo "Services started. Now test in the frontend:"
echo ""
echo "1. Open http://localhost:3000"
echo "2. Say: 'I want to check my balance'"
echo "3. Provide: Account 12345678, Sort Code 112233"
echo "4. Banking agent should greet you as 'Sarah'"
echo ""
echo "==================================="
echo ""
echo "To check logs for memory passing:"
echo ""
echo "  # IDV agent storing verified user:"
echo "  tail -f logs/agent-idv.log | grep 'Stored verified user'"
echo ""
echo "  # Gateway updating memory:"
echo "  tail -f logs/gateway.log | grep 'Updating session memory'"
echo ""
echo "  # Banking agent restoring user:"
echo "  tail -f logs/agent-banking.log | grep 'Restored verified user'"
echo ""
echo "==================================="
