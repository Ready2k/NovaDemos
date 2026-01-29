#!/bin/bash

# Diagnostic and Quick Fix Script for Voice S2S Backend Issues
# This script diagnoses the 7 critical issues and applies immediate fixes

echo "🔍 Voice S2S Backend Diagnostic Tool"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check function
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1"
        return 1
    fi
}

# 1. Check Tools Directory
echo "1️⃣  Checking Tools..."
TOOL_COUNT=$(ls -1 backend/tools/*.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$TOOL_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $TOOL_COUNT tools in backend/tools/"
else
    echo -e "${RED}✗${NC} No tools found in backend/tools/"
fi

# 2. Check Workflows Directory
echo ""
echo "2️⃣  Checking Workflows..."
WORKFLOW_COUNT=$(ls -1 backend/workflows/workflow_*.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$WORKFLOW_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $WORKFLOW_COUNT workflows in backend/workflows/"
else
    echo -e "${RED}✗${NC} No workflows found in backend/workflows/"
fi

# 3. Check Prompts Directory
echo ""
echo "3️⃣  Checking Prompts/Personas..."
PROMPT_COUNT=$(ls -1 backend/prompts/*.txt 2>/dev/null | wc -l | tr -d ' ')
if [ "$PROMPT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $PROMPT_COUNT prompts in backend/prompts/"
    PERSONA_COUNT=$(ls -1 backend/prompts/persona-*.txt 2>/dev/null | wc -l | tr -d ' ')
    echo -e "   ${GREEN}→${NC} $PERSONA_COUNT personas found"
else
    echo -e "${RED}✗${NC} No prompts found in backend/prompts/"
fi

# 4. Check Langfuse Configuration
echo ""
echo "4️⃣  Checking Langfuse Configuration..."
if grep -q "LANGFUSE_PUBLIC_KEY=pk-lf-" backend/.env 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Langfuse public key configured"
else
    echo -e "${RED}✗${NC} Langfuse public key missing"
fi

if grep -q "LANGFUSE_SECRET_KEY=sk-lf-" backend/.env 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Langfuse secret key configured"
else
    echo -e "${RED}✗${NC} Langfuse secret key missing"
fi

# 5. Check History Directory
echo ""
echo "5️⃣  Checking Chat History..."
if [ -d "backend/history" ]; then
    HISTORY_COUNT=$(ls -1 backend/history/session_*.json 2>/dev/null | wc -l | tr -d ' ')
    echo -e "${GREEN}✓${NC} History directory exists"
    echo -e "   ${GREEN}→${NC} $HISTORY_COUNT session files found"
else
    echo -e "${YELLOW}⚠${NC}  History directory missing (will be created on first session)"
fi

# 6. Check Backend Build
echo ""
echo "6️⃣  Checking Backend Build..."
if [ -d "backend/dist" ]; then
    echo -e "${GREEN}✓${NC} Backend dist directory exists"
    if [ -f "backend/dist/server.js" ]; then
        echo -e "${GREEN}✓${NC} server.js compiled"
    else
        echo -e "${RED}✗${NC} server.js not found - run 'npm run build' in backend/"
    fi
else
    echo -e "${RED}✗${NC} Backend not built - run 'npm run build' in backend/"
fi

# 7. Check if backend is running
echo ""
echo "7️⃣  Checking Backend Server..."
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend server is running on port 8080"
else
    echo -e "${YELLOW}⚠${NC}  Backend server not responding on port 8080"
fi

# Summary
echo ""
echo "===================================="
echo "📊 Summary"
echo "===================================="
echo "Tools:     $TOOL_COUNT files"
echo "Workflows: $WORKFLOW_COUNT files"
echo "Prompts:   $PROMPT_COUNT files ($PERSONA_COUNT personas)"
echo "History:   ${HISTORY_COUNT:-0} sessions"
echo ""

# Recommendations
echo "🔧 Recommended Actions:"
echo ""

if [ ! -d "backend/dist" ] || [ ! -f "backend/dist/server.js" ]; then
    echo "1. Build the backend:"
    echo "   cd backend && npm run build"
    echo ""
fi

if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "2. Start the backend server:"
    echo "   cd backend && npm start"
    echo ""
fi

echo "3. Test the API endpoints:"
echo "   curl http://localhost:8080/api/tools | jq"
echo "   curl http://localhost:8080/api/workflows | jq"
echo "   curl http://localhost:8080/api/prompts | jq"
echo "   curl http://localhost:8080/api/voices | jq"
echo ""

echo "4. Check backend logs for errors:"
echo "   tail -f backend/logs/*.log"
echo ""

echo "5. Review the detailed fix document:"
echo "   cat CRITICAL_FIXES_NEEDED.md"
echo ""

# Offer to apply quick fixes
echo "===================================="
echo "Would you like to apply quick fixes? (y/n)"
read -r APPLY_FIXES

if [ "$APPLY_FIXES" = "y" ] || [ "$APPLY_FIXES" = "Y" ]; then
    echo ""
    echo "🔧 Applying Quick Fixes..."
    echo ""
    
    # Create missing directories
    mkdir -p backend/history
    mkdir -p backend/test_logs
    echo -e "${GREEN}✓${NC} Created missing directories"
    
    # Rebuild backend
    echo "Building backend..."
    cd backend && npm run build
    check_status "Backend built successfully"
    cd ..
    
    echo ""
    echo -e "${GREEN}✓${NC} Quick fixes applied!"
    echo ""
    echo "Next steps:"
    echo "1. Start the backend: cd backend && npm start"
    echo "2. Test the endpoints using the curl commands above"
    echo "3. Check CRITICAL_FIXES_NEEDED.md for remaining issues"
fi

echo ""
echo "Done! 🎉"
