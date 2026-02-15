#!/bin/bash
# Prepare Docker build by copying backend resources into service directories

set -e

echo "Preparing Docker build contexts..."

# Copy backend resources to gateway
echo "  → Copying backend resources to gateway/"
mkdir -p gateway/workflows gateway/tools gateway/prompts gateway/history
cp -r backend/workflows/* gateway/workflows/ 2>/dev/null || true
cp -r backend/tools/* gateway/tools/ 2>/dev/null || true
cp -r backend/prompts/* gateway/prompts/ 2>/dev/null || true
cp backend/knowledge_bases.json gateway/ 2>/dev/null || true

# Copy backend resources to agents
echo "  → Copying backend resources to agents/"
mkdir -p agents/backend/workflows agents/backend/tools agents/backend/prompts agents/backend/personas
cp -r backend/workflows/* agents/backend/workflows/ 2>/dev/null || true
cp -r backend/tools/* agents/backend/tools/ 2>/dev/null || true
cp -r backend/prompts/* agents/backend/prompts/ 2>/dev/null || true
cp -r backend/personas/* agents/backend/personas/ 2>/dev/null || true

# Copy backend tools to local-tools
echo "  → Copying backend tools to local-tools/"
mkdir -p local-tools/tools
cp -r backend/tools/* local-tools/tools/ 2>/dev/null || true

echo "✓ Docker build contexts prepared successfully!"
echo ""
echo "You can now run: docker compose -f docker-compose-a2a.yml up --build"
