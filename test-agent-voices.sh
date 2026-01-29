#!/bin/bash

# Test Agent Voice Metadata
# Check if agents have voice configuration

echo "========================================="
echo "Testing Agent Voice Metadata"
echo "========================================="
echo ""

# Check Gateway agent registry
echo "1. Checking Gateway Agent Registry..."
curl -s http://localhost:8080/health | jq '.agents'
echo ""

# Check if agents endpoint exists
echo "2. Checking if agents endpoint exists..."
curl -s http://localhost:8080/api/agents 2>&1 | head -5
echo ""

# Check workflow files for voice metadata
echo "3. Checking workflow files for voice metadata..."
for file in backend/workflows/workflow_*.json; do
    if grep -q "voice" "$file"; then
        echo "✅ Found voice in: $file"
        jq '.voice // .voiceId // .metadata.voice' "$file" 2>/dev/null
    fi
done

if ! grep -r "voice" backend/workflows/workflow_*.json > /dev/null 2>&1; then
    echo "❌ No voice metadata found in any workflow files"
fi
echo ""

# Check agent types
echo "4. Checking agent types definition..."
grep -A 5 "interface AgentInfo" gateway/src/agent-registry.ts
echo ""

echo "========================================="
echo "FINDINGS:"
echo "========================================="
echo ""
echo "Current State:"
echo "- AgentInfo interface: id, url, status, capabilities, lastHeartbeat, port"
echo "- Missing: voiceId, metadata, persona config"
echo ""
echo "What's Needed:"
echo "1. Add voice metadata to AgentInfo interface"
echo "2. Add voice config to workflow JSON files"
echo "3. Update agent registration to include voice"
echo "4. Update Gateway to expose agent metadata via API"
echo ""
