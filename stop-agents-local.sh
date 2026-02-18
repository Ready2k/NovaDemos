#!/bin/bash

# Stop All Local Agents Script
# Kills all locally running agent processes, gateway, local-tools, and frontend

echo "🛑 Stopping all local services..."

# Function to kill process on a specific port
kill_port() {
    local port=$1
    local service=$2
    local pid=$(lsof -ti:$port)
    
    if [ -n "$pid" ]; then
        echo "  Killing $service on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null
        sleep 0.5
    else
        echo "  No process found on port $port ($service)"
    fi
}

# Kill Gateway (port 8080)
echo ""
echo "📡 Stopping Gateway..."
kill_port 8080 "Gateway"

# Kill Local Tools Server (port 9000)
echo ""
echo "🔧 Stopping Local Tools Server..."
kill_port 9000 "Local-Tools"

# Kill Frontend (ports 3000 and 3001)
echo ""
echo "🌐 Stopping Frontend..."
kill_port 3000 "Frontend"
kill_port 3001 "Frontend (alt)"

# Kill all 6 agents
echo ""
echo "🤖 Stopping Agents..."
kill_port 8081 "Triage Agent"
kill_port 8082 "Banking Agent"
kill_port 8083 "Mortgage Agent"
kill_port 8084 "IDV Agent"
kill_port 8085 "Disputes Agent"
kill_port 8086 "Investigation Agent"

# Additional cleanup: Kill any remaining node processes running agent-runtime-unified.ts
echo ""
echo "🧹 Cleaning up any remaining agent processes..."
pkill -f "agent-runtime-unified" 2>/dev/null && echo "  Killed remaining agent-runtime processes" || echo "  No remaining agent-runtime processes"

# Kill any remaining ts-node processes in agents directory
pkill -f "ts-node.*agents/src" 2>/dev/null && echo "  Killed remaining ts-node processes" || echo "  No remaining ts-node processes"

# Kill any remaining npm run dev processes
pkill -f "npm run dev" 2>/dev/null && echo "  Killed remaining npm dev processes" || echo "  No remaining npm processes"

echo ""
echo "✅ All services stopped!"
echo ""
echo "To restart, run: ./start-agents-local.sh"
