# A2A Multi-Agent Architecture

## Overview

This is an enterprise-grade, agent-per-workflow architecture with Agent-to-Agent (A2A) communication. Each workflow runs in its own isolated container, enabling independent scaling, deployment, and fault tolerance.

## Architecture

```
┌─────────────┐
│   Frontend  │
│  (Port 3000)│
└──────┬──────┘
       │ WebSocket
       ▼
┌─────────────┐
│   Gateway   │  ◄── Session Routing & Agent Discovery
│  (Port 8080)│
└──────┬──────┘
       │
       ├─────────► Triage Agent (8081)    ◄─┐
       ├─────────► Banking Agent (8082)     │
       ├─────────► Mortgage Agent (8083)    │ A2A
       ├─────────► IDV Agent (8084)         │ Handoff
       └─────────► Disputes Agent (8085)  ◄─┘
                         │
                         ▼
              ┌──────────────────┐
              │  Local Tools MCP │
              │   (Port 9000)    │
              └──────────────────┘
```

## Components

### Gateway (Port 8080)
- **Purpose**: WebSocket entry point for all client connections
- **Responsibilities**:
  - Accept WebSocket connections from frontend
  - Route sessions to appropriate agents
  - Maintain agent registry (via Redis)
  - Handle agent health checks

### Agents (Ports 8081-8085)
Each agent is a specialized workflow executor:

- **Triage Agent (8081)**: Entry point, determines user intent, routes to specialized agents
- **Banking Agent (8082)**: Handles banking operations (balance, transactions, etc.)
- **Mortgage Agent (8083)**: Handles mortgage applications and inquiries
- **IDV Agent (8084)**: Identity verification and authentication
- **Disputes Agent (8085)**: Handles transaction disputes and escalations

### Local Tools MCP Server (Port 9000)
- **Purpose**: Centralized tool execution following Model Context Protocol
- **Built-in Tools**:
  - `calculator`: Basic arithmetic operations
  - `string_formatter`: String manipulation
  - `date_formatter`: Date/time formatting

### Redis (Port 6379)
- **Purpose**: Distributed state store
- **Stores**:
  - Agent registry (health, capabilities, URLs)
  - Session state (current agent, context, history)
  - Session routing information

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- 8GB+ RAM recommended

### Quick Start

```bash
# Build all services
./a2a.sh build

# Start the system
./a2a.sh start

# Check health
./a2a.sh test

# View logs
./a2a.sh logs

# Stop the system
./a2a.sh stop
```

### Access Points
- **Frontend**: http://localhost:3000
- **Gateway Health**: http://localhost:8080/health
- **Agent Health**: http://localhost:808{1-5}/health
- **Tools Health**: http://localhost:9000/health

## A2A Communication Protocol

### Agent Registration
When an agent starts, it registers with the gateway:

```http
POST http://gateway:8080/api/agents/register
{
  "id": "banking",
  "url": "http://agent-banking:8082",
  "capabilities": ["account_management", "transactions"],
  "port": 8082
}
```

### Session Handoff
Agents can transfer sessions to other agents:

```json
{
  "type": "a2a_handoff",
  "from_agent": "triage",
  "to_agent": "banking",
  "session_id": "abc-123",
  "context": {
    "user_intent": "check_balance",
    "conversation_history": [...],
    "extracted_entities": {
      "account_number": "12345678"
    }
  },
  "reason": "User intent matched banking domain"
}
```

### Heartbeat
Agents send periodic heartbeats to maintain health status:

```http
POST http://gateway:8080/api/agents/heartbeat
{
  "agentId": "banking"
}
```

## Development

### Adding a New Agent

1. **Create workflow definition**:
   ```bash
   cp backend/workflows/workflow_template.json backend/workflows/workflow_myagent.json
   ```

2. **Add to docker-compose-a2a.yml**:
   ```yaml
   agent-myagent:
     build:
       context: ./agents
       dockerfile: Dockerfile.agent
     ports:
       - "8086:8086"
     environment:
       - AGENT_ID=myagent
       - AGENT_PORT=8086
       - WORKFLOW_FILE=/app/workflow.json
     volumes:
       - ./backend/workflows/workflow_myagent.json:/app/workflow.json:ro
   ```

3. **Rebuild and restart**:
   ```bash
   ./a2a.sh build
   ./a2a.sh restart
   ```

### Adding a New Tool

1. **Create tool definition**:
   ```bash
   cat > local-tools/src/tools/mytool.json << EOF
   {
     "name": "mytool",
     "description": "My custom tool",
     "inputSchema": {
       "type": "object",
       "properties": {
         "input": { "type": "string" }
       }
     }
   }
   EOF
   ```

2. **Implement tool logic** in `local-tools/src/server.ts`:
   ```typescript
   case 'mytool':
     return executeMyTool(input);
   ```

3. **Rebuild local-tools**:
   ```bash
   docker-compose -f docker-compose-a2a.yml build local-tools
   docker-compose -f docker-compose-a2a.yml restart local-tools
   ```

## Monitoring

### Health Checks
All services expose `/health` endpoints:

```bash
# Check all services
./a2a.sh test

# Check specific service
curl http://localhost:8080/health
```

### Logs
```bash
# All services
./a2a.sh logs

# Specific service
docker-compose -f docker-compose-a2a.yml logs -f agent-banking
```

### Redis Inspection
```bash
# Connect to Redis
docker exec -it voice_s2s-redis-1 redis-cli

# View agent registry
HGETALL agent:registry

# View sessions
KEYS session:*
```

## Troubleshooting

### Agent not registering
- Check gateway is running: `curl http://localhost:8080/health`
- Check agent logs: `docker-compose -f docker-compose-a2a.yml logs agent-triage`
- Verify network connectivity: `docker network inspect voice_s2s_agent-network`

### Session not routing
- Check Redis: `docker exec -it voice_s2s-redis-1 redis-cli KEYS session:*`
- Check agent registry: `curl http://localhost:8080/health`
- Verify agent health: `./a2a.sh test`

### Tool execution failing
- Check local-tools health: `curl http://localhost:9000/health`
- List available tools: `curl http://localhost:9000/tools/list`
- Check agent logs for tool errors

## Migration from Legacy Backend

The legacy monolithic backend is still available via `docker-compose.yml`. To migrate:

1. **Test A2A system**: Ensure all agents work correctly
2. **Compare behavior**: Run same scenarios on both systems
3. **Switch frontend**: Update `NEXT_PUBLIC_WS_URL` to point to gateway
4. **Deprecate legacy**: Once validated, remove old backend

## Performance

### Resource Usage (Approximate)
- Gateway: 100MB RAM, 0.1 CPU
- Each Agent: 150MB RAM, 0.2 CPU
- Local Tools: 50MB RAM, 0.05 CPU
- Redis: 50MB RAM, 0.05 CPU
- **Total**: ~1GB RAM, 1.2 CPU for 5 agents

### Scaling
- **Horizontal**: Add more agent instances via docker-compose `deploy.replicas`
- **Vertical**: Increase container resources via `deploy.resources`
- **Load Balancing**: Gateway automatically routes to healthy agents

## Future Enhancements

- [ ] gRPC for A2A communication (lower latency)
- [ ] Kubernetes deployment manifests
- [ ] Prometheus metrics
- [ ] Grafana dashboards
- [ ] Agent auto-scaling based on load
- [ ] Circuit breakers for fault tolerance
- [ ] Distributed tracing (OpenTelemetry)

## License

Proprietary - All Rights Reserved
