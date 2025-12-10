#!/bin/bash

echo "🚀 Starting Nova 2 Sonic NATIVE Tool Test"
echo "=========================================="
echo ""
echo "This test will determine if Nova 2 Sonic can achieve 100% native tool capability"
echo ""
echo "Watch for:"
echo "  ✅ Native toolUse events (indicates true native capability)"
echo "  ❌ Spoken JSON or tool names (indicates fallback behavior)"
echo "  ❌ Heuristic filler phrases (indicates heuristic detection)"
echo ""
echo "Press Ctrl+C to stop the test"
echo ""

node test-native-client.js