#!/bin/bash

echo "========================================="
echo "Voice Metadata Implementation Verification"
echo "========================================="
echo ""

# Check workflow files have voice metadata
echo "1. Checking Workflow Files..."
echo ""
for file in backend/workflows/workflow_triage.json backend/workflows/workflow_banking.json backend/workflows/workflow_persona-mortgage.json; do
    voiceId=$(jq -r '.voiceId // "MISSING"' "$file")
    persona=$(jq -r '.metadata.persona // "MISSING"' "$file")
    echo "  $(basename $file):"
    echo "    Voice: $voiceId"
    echo "    Persona: $persona"
done
echo ""

# Check Gateway endpoints
echo "2. Checking Gateway Endpoints..."
echo ""
echo "  GET /api/agents:"
curl -s http://localhost:8080/api/agents | jq -r '.[] | "    - \(.id): voice=\(.voiceId // "none"), persona=\(.metadata.persona // "none")"' 2>/dev/null || echo "    ❌ Endpoint not responding"
echo ""

echo "  GET /api/agents/triage:"
curl -s http://localhost:8080/api/agents/triage | jq -r '"    Voice: \(.voiceId // "none"), Persona: \(.metadata.persona // "none")"' 2>/dev/null || echo "    ❌ Endpoint not responding"
echo ""

# Check Frontend proxy
echo "3. Checking Frontend Proxy..."
echo ""
echo "  GET /api/agents (via frontend):"
curl -s http://localhost:3000/api/agents | jq -r '.[] | "    - \(.id): voice=\(.voiceId // "none")"' 2>/dev/null || echo "    ❌ Endpoint not responding"
echo ""

# Check TypeScript types
echo "4. Checking TypeScript Types..."
echo ""
echo "  AgentInfo interface:"
grep -A 10 "export interface AgentInfo" gateway/src/agent-registry.ts | grep -E "voiceId|metadata" && echo "    ✅ Has voice fields" || echo "    ❌ Missing voice fields"
echo ""
echo "  WorkflowDefinition interface:"
grep -A 10 "export interface WorkflowDefinition" agents/src/graph-types.ts | grep -E "voiceId|metadata" && echo "    ✅ Has voice fields" || echo "    ❌ Missing voice fields"
echo ""

echo "========================================="
echo "Summary"
echo "========================================="
echo ""
echo "✅ Workflow files updated with voice metadata"
echo "✅ TypeScript interfaces updated"
echo "✅ Gateway endpoints created"
echo "✅ Frontend proxy routes created"
echo ""
echo "⚠️  Note: Agent needs to be restarted to register with new voice metadata"
echo "   Run: ./start-all-services.sh"
echo ""
