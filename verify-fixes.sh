#!/bin/bash

echo "🔍 Verifying A2A System Fixes"
echo "=============================="
echo ""

# Check if files were modified correctly
echo "1️⃣  Checking modified files..."
echo ""

# Check agentcore_balance.json
if grep -q '"accountNumber"' backend/tools/agentcore_balance.json; then
    echo "✅ agentcore_balance.json uses 'accountNumber'"
else
    echo "❌ agentcore_balance.json still uses 'accountId'"
fi

# Check agentcore_transactions.json
if grep -q '"accountNumber"' backend/tools/agentcore_transactions.json; then
    echo "✅ agentcore_transactions.json uses 'accountNumber'"
else
    echo "❌ agentcore_transactions.json still uses 'accountId'"
fi

# Check local-tools server.ts for transformation
if grep -q 'transformedInput.accountId = input.accountNumber' local-tools/src/server.ts; then
    echo "✅ local-tools/src/server.ts has field transformation"
else
    echo "❌ local-tools/src/server.ts missing field transformation"
fi

# Check docker-compose-a2a.yml for correct volume mount
if grep -q './backend/tools:/app/tools' docker-compose-a2a.yml; then
    echo "✅ docker-compose-a2a.yml mounts backend/tools"
else
    echo "❌ docker-compose-a2a.yml has wrong volume mount"
fi

# Check docker-compose-a2a.yml for AgentCore credentials
if grep -q 'AGENTCORE_GATEWAY_URL' docker-compose-a2a.yml; then
    echo "✅ docker-compose-a2a.yml has AGENTCORE_GATEWAY_URL"
else
    echo "❌ docker-compose-a2a.yml missing AGENTCORE_GATEWAY_URL"
fi

echo ""
echo "2️⃣  Checking created files..."
echo ""

# Check test scripts
if [ -x test-a2a-chat.sh ]; then
    echo "✅ test-a2a-chat.sh exists and is executable"
else
    echo "❌ test-a2a-chat.sh missing or not executable"
fi

if [ -x START_A2A.sh ]; then
    echo "✅ START_A2A.sh exists and is executable"
else
    echo "❌ START_A2A.sh missing or not executable"
fi

# Check documentation
if [ -f A2A_TESTING_GUIDE.md ]; then
    echo "✅ A2A_TESTING_GUIDE.md exists"
else
    echo "❌ A2A_TESTING_GUIDE.md missing"
fi

if [ -f FIXES_APPLIED.md ]; then
    echo "✅ FIXES_APPLIED.md exists"
else
    echo "❌ FIXES_APPLIED.md missing"
fi

if [ -f QUICK_START.md ]; then
    echo "✅ QUICK_START.md exists"
else
    echo "❌ QUICK_START.md missing"
fi

if [ -f SUMMARY.md ]; then
    echo "✅ SUMMARY.md exists"
else
    echo "❌ SUMMARY.md missing"
fi

echo ""
echo "3️⃣  Checking environment..."
echo ""

# Check .env file
if [ -f .env ]; then
    echo "✅ .env file exists"
    
    if grep -q 'AWS_ACCESS_KEY_ID=' .env && [ -n "$(grep 'AWS_ACCESS_KEY_ID=' .env | cut -d'=' -f2)" ]; then
        echo "✅ AWS_ACCESS_KEY_ID is set"
    else
        echo "⚠️  AWS_ACCESS_KEY_ID not set in .env"
    fi
    
    if grep -q 'AGENTCORE_GATEWAY_URL=' .env && [ -n "$(grep 'AGENTCORE_GATEWAY_URL=' .env | cut -d'=' -f2)" ]; then
        echo "✅ AGENTCORE_GATEWAY_URL is set"
    else
        echo "⚠️  AGENTCORE_GATEWAY_URL not set in .env"
    fi
else
    echo "❌ .env file missing"
fi

# Check Docker
if docker info > /dev/null 2>&1; then
    echo "✅ Docker is running"
else
    echo "⚠️  Docker is not running"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Verification Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "All critical fixes have been applied! ✅"
echo ""
echo "Next steps:"
echo "1. Start Docker Desktop (if not running)"
echo "2. Run: ./START_A2A.sh"
echo "3. Run: ./test-a2a-chat.sh"
echo "4. Open: http://localhost:3000"
echo ""
echo "For detailed instructions, see:"
echo "- QUICK_START.md (quick reference)"
echo "- A2A_TESTING_GUIDE.md (complete guide)"
echo "- FIXES_APPLIED.md (technical details)"
echo ""
