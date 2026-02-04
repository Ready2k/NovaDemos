# Scripts Guide: Voice-Agnostic Agent Architecture

Quick reference for all available scripts to start, test, and manage the unified architecture.

## 🚀 Production Scripts (Start Services)

### Docker Mode (Recommended for Production)

```bash
./start-unified-docker.sh
```

**What it does:**
- Builds and starts all services in Docker containers
- Gateway, Local Tools, 6 Agents, Frontend, Redis
- Production-like isolated environment

**Requirements:**
- Docker and Docker Compose
- `.env` file in project root with AWS credentials

**Stop:**
```bash
docker-compose -f docker-compose-unified.yml down
```

---

### Local Mode (Recommended for Development)

```bash
# Voice mode (default)
./start-unified-local.sh

# Text mode (no AWS required)
./start-unified-local.sh text

# Hybrid mode (voice + text)
./start-unified-local.sh hybrid
```

**What it does:**
- Builds and starts all services locally
- Gateway, Local Tools, 6 Agents, Frontend
- Fast iteration, easy debugging

**Requirements:**
- Node.js 18+
- `backend/.env` file with AWS credentials

**Stop:**
- Press `Ctrl+C`

---

## 🧪 Test Scripts

### 1. Run All Automated Tests

```bash
./run-unified-tests.sh
```

**What it tests:**
- 30 unit tests
- 26 property-based tests (2,600+ cases)
- 25 integration test scenarios
- Total: 257 tests

**When to use:**
- Before committing code
- After modifying core components
- As part of CI/CD

---

### 2. Quick Test (Single Agent)

```bash
# Voice mode
./quick-test-unified.sh

# Text mode
./quick-test-unified.sh text

# Hybrid mode
./quick-test-unified.sh hybrid
```

**What it tests:**
- Starts Gateway + Triage Agent only
- Quick validation of mode switching
- Rapid iteration during development

**When to use:**
- Quick validation after code changes
- Testing mode switching
- Debugging single agent issues

---

### 3. Full E2E Test (All 6 Agents)

```bash
# Voice mode
./test-unified-architecture.sh

# Text mode
./test-unified-architecture.sh text

# Hybrid mode
./test-unified-architecture.sh hybrid
```

**What it tests:**
- All 6 agents using unified runtime
- Agent-to-agent handoffs
- Tool execution across agents
- Session memory preservation

**When to use:**
- Full system validation
- Testing multi-agent handoffs
- Pre-production testing

---

## 📊 Script Comparison

| Script | Purpose | Services | Mode | Best For |
|--------|---------|----------|------|----------|
| `start-unified-docker.sh` | Production | All (Docker) | voice | Production, CI/CD |
| `start-unified-local.sh` | Development | All (Local) | voice/text/hybrid | Development, debugging |
| `run-unified-tests.sh` | Unit/Integration Tests | None | N/A | Code validation |
| `quick-test-unified.sh` | Quick Test | Gateway + 1 Agent | voice/text/hybrid | Rapid iteration |
| `test-unified-architecture.sh` | Full E2E Test | Gateway + 6 Agents | voice/text/hybrid | System validation |

---

## 🔧 Common Workflows

### Development Workflow

```bash
# 1. Start services locally
./start-unified-local.sh

# 2. Make code changes
# ... edit files ...

# 3. Run tests
./run-unified-tests.sh

# 4. Quick test
./quick-test-unified.sh

# 5. Stop services (Ctrl+C)
```

---

### Testing Workflow

```bash
# 1. Run all automated tests
./run-unified-tests.sh

# 2. Test voice mode
./test-unified-architecture.sh voice

# 3. Test text mode
./test-unified-architecture.sh text

# 4. Test hybrid mode
./test-unified-architecture.sh hybrid
```

---

### Production Deployment Workflow

```bash
# 1. Run all tests
./run-unified-tests.sh

# 2. Start in Docker
./start-unified-docker.sh

# 3. Verify all services
curl http://localhost:8080/health
curl http://localhost:8081/health

# 4. Test E2E
# Open http://localhost:3000 and test

# 5. Monitor logs
docker-compose -f docker-compose-unified.yml logs -f
```

---

## 📝 Environment Setup

### For Docker Mode

Create `.env` in project root:

```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1

# Optional
LANGFUSE_PUBLIC_KEY=your_public_key
LANGFUSE_SECRET_KEY=your_secret_key
LANGFUSE_HOST=https://cloud.langfuse.com
```

### For Local Mode

Create `backend/.env`:

```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1

# Optional
LANGFUSE_PUBLIC_KEY=your_public_key
LANGFUSE_SECRET_KEY=your_secret_key
LANGFUSE_HOST=https://cloud.langfuse.com
```

---

## 🔍 Monitoring & Debugging

### View Logs

**Docker Mode:**
```bash
# All services
docker-compose -f docker-compose-unified.yml logs -f

# Specific service
docker-compose -f docker-compose-unified.yml logs -f agent-triage
docker-compose -f docker-compose-unified.yml logs -f gateway
```

**Local Mode:**
```bash
# All services
tail -f logs/*.log

# Specific service
tail -f logs/agent-triage.log
tail -f logs/gateway.log
```

### Check Health

```bash
# Gateway
curl http://localhost:8080/health

# Agents
curl http://localhost:8081/health  # Triage
curl http://localhost:8082/health  # IDV
curl http://localhost:8083/health  # Banking

# List registered agents
curl http://localhost:8080/api/agents | jq
```

### Restart Services

**Docker Mode:**
```bash
# Restart specific agent
docker-compose -f docker-compose-unified.yml restart agent-triage

# Restart all
docker-compose -f docker-compose-unified.yml restart

# Rebuild and restart
docker-compose -f docker-compose-unified.yml up -d --build
```

**Local Mode:**
```bash
# Stop (Ctrl+C) and restart
./start-unified-local.sh
```

---

## ❓ Troubleshooting

### Issue: Script won't execute

```bash
# Make script executable
chmod +x start-unified-docker.sh
chmod +x start-unified-local.sh
chmod +x run-unified-tests.sh
chmod +x quick-test-unified.sh
chmod +x test-unified-architecture.sh
```

### Issue: AWS credentials error

```bash
# Verify credentials in .env
cat .env | grep AWS

# Test AWS access
aws sts get-caller-identity
```

### Issue: Port already in use

```bash
# Find process using port
lsof -i :8080
lsof -i :8081

# Kill process
kill -9 <PID>

# Or stop Docker services
docker-compose -f docker-compose-unified.yml down
```

### Issue: Redis connection error

```bash
# Check Redis is running
docker ps | grep redis

# Start Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Test connection
redis-cli ping
```

### Issue: Build errors

```bash
# Clean and rebuild (Local)
cd agents
rm -rf node_modules dist
npm install
npm run build

# Clean and rebuild (Docker)
docker-compose -f docker-compose-unified.yml build --no-cache
```

---

## 📚 Additional Resources

- **Testing Guide**: `TESTING_GUIDE.md` - Comprehensive testing documentation
- **Architecture Summary**: `VOICE_AGNOSTIC_ARCHITECTURE_SUMMARY.md` - Implementation details
- **Developer Guide**: `docs/DEVELOPER_GUIDE.md` - Development guide
- **Requirements**: `.kiro/specs/voice-agnostic-agent-architecture/requirements.md`
- **Design**: `.kiro/specs/voice-agnostic-agent-architecture/design.md`

---

## 🎯 Quick Command Reference

```bash
# Start services
./start-unified-docker.sh                    # Docker mode
./start-unified-local.sh [voice|text|hybrid] # Local mode

# Run tests
./run-unified-tests.sh                       # All automated tests
./quick-test-unified.sh [mode]               # Quick test
./test-unified-architecture.sh [mode]        # Full E2E test

# Monitor
docker-compose -f docker-compose-unified.yml logs -f  # Docker logs
tail -f logs/*.log                                     # Local logs

# Health checks
curl http://localhost:8080/health            # Gateway
curl http://localhost:8081/health            # Triage Agent

# Stop
docker-compose -f docker-compose-unified.yml down     # Docker
# Ctrl+C                                               # Local
```

---

**Built with ❤️ for voice-agnostic agent development**
