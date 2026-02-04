# Testing Guide: Voice-Agnostic Agent Architecture

This guide explains how to test the unified voice-agnostic agent architecture using the provided test scripts.

## 🎯 Quick Start

### Option 1: Start Services (Production-like)

```bash
# Start all services in Docker (recommended for production)
./start-unified-docker.sh

# OR start all services locally (recommended for development)
./start-unified-local.sh [voice|text|hybrid]
```

### Option 2: Run Tests

```bash
# 1. Run all unit and integration tests
./run-unified-tests.sh

# 2. Quick test with single agent (voice mode)
./quick-test-unified.sh

# 3. Full E2E test with all 6 agents (voice mode)
./test-unified-architecture.sh
```

## 🚀 Startup Scripts (Production Services)

### `start-unified-docker.sh` - Docker Mode (Production)

**Purpose**: Start all services in Docker containers

**What it does**:
- ✅ Builds Docker images for all services
- ✅ Starts Gateway, Local Tools, 6 Agents, Frontend, Redis
- ✅ All services isolated in containers
- ✅ Production-like environment

**Usage**:
```bash
./start-unified-docker.sh
```

**Services Started**:
- Gateway (port 8080)
- Local Tools (port 9000)
- Frontend (port 3000)
- All 6 agents (ports 8081-8086)
- Redis (port 6379)

**When to use**:
- Production deployment
- Isolated testing environment
- CI/CD pipelines
- When you want consistent environment

**Requirements**:
- Docker and Docker Compose installed
- `.env` file with AWS credentials in project root

**Stop Services**:
```bash
docker-compose -f docker-compose-unified.yml down
```

---

### `start-unified-local.sh` - Local Mode (Development)

**Purpose**: Start all services locally (no Docker except Redis)

**What it does**:
- ✅ Builds all services locally
- ✅ Starts Gateway, Local Tools, 6 Agents, Frontend
- ✅ Uses local Node.js processes
- ✅ Supports all modes (voice/text/hybrid)

**Usage**:
```bash
# Start in voice mode (default)
./start-unified-local.sh

# Start in text mode
./start-unified-local.sh text

# Start in hybrid mode
./start-unified-local.sh hybrid
```

**Services Started**:
- Gateway (port 8080)
- Local Tools (port 9000)
- Frontend (port 3000)
- All 6 agents (ports 8081-8086)
- Redis (Docker, port 6379)

**When to use**:
- Development and debugging
- Rapid iteration
- Testing mode switching
- When you need to modify code frequently

**Requirements**:
- Node.js 18+ installed
- `backend/.env` file with AWS credentials

**Stop Services**:
- Press `Ctrl+C` in the terminal

---

## 📋 Available Test Scripts

### 1. `run-unified-tests.sh` - Unit & Integration Tests

**Purpose**: Runs all automated tests (unit, property-based, integration)

**What it tests**:
- ✅ 30 unit tests (Agent Core, Voice Side-Car, Text Adapter)
- ✅ 26 property-based tests (2,600+ test cases)
- ✅ 25 integration test scenarios (voice, text, hybrid modes)
- ✅ Total: 257 tests across 18 test suites

**Usage**:
```bash
./run-unified-tests.sh
```

**Expected Output**:
```
✅ All Tests Passed!
257 tests passing
18 test suites
100% core component coverage
```

**When to use**:
- Before committing code changes
- After modifying core components
- To verify architecture integrity
- As part of CI/CD pipeline

---

### 2. `quick-test-unified.sh` - Rapid Single Agent Test

**Purpose**: Quickly test a single agent (Triage) in any mode

**What it tests**:
- ✅ Unified runtime initialization
- ✅ Mode selection (voice/text/hybrid)
- ✅ Gateway registration
- ✅ Agent health checks
- ✅ Basic functionality

**Usage**:
```bash
# Test voice mode (default)
./quick-test-unified.sh

# Test text mode
./quick-test-unified.sh text

# Test hybrid mode
./quick-test-unified.sh hybrid
```

**Services Started**:
- Gateway (port 8080)
- Triage Agent (port 8081)
- Redis (Docker)

**When to use**:
- Quick validation after code changes
- Testing mode switching
- Debugging single agent issues
- Rapid iteration during development

**Next Steps After Running**:
```bash
# In another terminal, start frontend
cd frontend-v2
npm run dev

# Open http://localhost:3000 and test
```

---

### 3. `test-unified-architecture.sh` - Full E2E Test

**Purpose**: Complete end-to-end test with all 6 agents

**What it tests**:
- ✅ All 6 agents using unified runtime
- ✅ Agent-to-agent handoffs
- ✅ Tool execution across agents
- ✅ Session memory preservation
- ✅ Mode selection for all agents
- ✅ Gateway orchestration

**Usage**:
```bash
# Test all agents in voice mode (default)
./test-unified-architecture.sh

# Test all agents in text mode
./test-unified-architecture.sh text

# Test all agents in hybrid mode
./test-unified-architecture.sh hybrid
```

**Services Started**:
- Gateway (port 8080)
- Local Tools (port 9000)
- Triage Agent (port 8081)
- IDV Agent (port 8082)
- Banking Agent (port 8083)
- Mortgage Agent (port 8084)
- Disputes Agent (port 8085)
- Investigation Agent (port 8086)
- Redis (Docker)

**When to use**:
- Full system validation
- Testing multi-agent handoffs
- Verifying backward compatibility
- Pre-production testing
- Demonstrating architecture benefits

**Expected Journey**:
1. User: "I want to check my balance"
2. Triage → IDV (for verification)
3. IDV → Banking (after verification)
4. Banking → Triage (after balance check)

**Next Steps After Running**:
```bash
# In another terminal, start frontend
cd frontend-v2
npm run dev

# Open http://localhost:3000 and test multi-agent flow
```

---

## 🧪 Test Modes Explained

### Voice Mode (`MODE=voice`)
- Uses Voice Side-Car wrapper
- Requires AWS credentials
- Streams audio via SonicClient
- Full voice interaction with TTS/STT

**Test Command**:
```bash
./test-unified-architecture.sh voice
```

### Text Mode (`MODE=text`)
- Uses Text Adapter wrapper
- No AWS credentials required
- WebSocket text messages only
- Faster for development/testing

**Test Command**:
```bash
./test-unified-architecture.sh text
```

### Hybrid Mode (`MODE=hybrid`)
- Uses both Voice Side-Car and Text Adapter
- Requires AWS credentials
- Supports voice AND text simultaneously
- Tests mode switching

**Test Command**:
```bash
./test-unified-architecture.sh hybrid
```

---

## 📊 Test Coverage

### Unit Tests (30 tests)

**Agent Core (15 tests)**
- Session management
- Message processing
- Tool execution
- Handoff management
- Session memory

**Voice Side-Car (12 tests)**
- Session lifecycle
- Audio streaming
- Event translation
- Error handling

**Text Adapter (10 tests)**
- Session lifecycle
- Message forwarding
- Response handling
- Tool execution

### Property-Based Tests (26 properties, 2,600+ cases)

**Agent Core (5 properties)**
- Session lifecycle consistency
- Tool execution determinism
- Handoff detection accuracy
- Memory preservation
- Error recovery

**Voice Side-Car (6 properties)**
- Audio forwarding consistency
- Transcript forwarding consistency
- Tool delegation consistency
- Metadata forwarding consistency
- Error forwarding consistency
- Mixed event sequence handling

**Text Adapter (4 properties)**
- Message forwarding consistency
- Response forwarding consistency
- Session lifecycle consistency
- Concurrent session handling

**Tool Execution (4 properties)**
- Tool execution consistency
- Tool error handling
- Tool result caching
- Tool timeout handling

**Handoff Detection (7 properties)**
- Handoff tool detection accuracy
- Context extraction completeness
- Return handoff detection
- Transfer handoff detection
- Invalid handoff rejection
- Concurrent handoff handling
- Handoff state preservation

### Integration Tests (25 scenarios)

**Voice Mode (8 scenarios)**
- Session initialization
- Audio input/output
- Tool execution
- Handoffs
- Session cleanup
- Error handling
- Interruption handling
- Sentiment analysis

**Text Mode (8 scenarios)**
- Session initialization
- Text input/output
- Tool execution
- Handoffs
- Session cleanup
- Error handling
- Multi-session handling
- Memory preservation

**Hybrid Mode (9 scenarios)**
- Session initialization (voice + text)
- Mode switching (voice ↔ text)
- Tool execution in both modes
- Handoffs in both modes
- Session cleanup
- Error handling
- State preservation across modes
- Concurrent voice and text sessions
- Memory preservation across modes

---

## 🔍 Monitoring & Debugging

### View Logs

**All logs**:
```bash
tail -f logs/*.log
```

**Specific service**:
```bash
tail -f logs/gateway.log
tail -f logs/agent-triage.log
tail -f logs/agent-banking.log
```

**Watch handoffs**:
```bash
tail -f logs/gateway.log | grep -E 'handoff|HANDOFF'
```

### Check Service Health

```bash
# Gateway
curl http://localhost:8080/health

# Triage Agent
curl http://localhost:8081/health

# List registered agents
curl http://localhost:8080/api/agents | jq
```

### Common Issues

**Issue**: Agent won't start
```bash
# Check logs
tail -f logs/agent-triage.log

# Verify workflow file exists
ls -la backend/workflows/workflow_triage.json

# Check environment variables
env | grep AGENT
```

**Issue**: AWS credentials error (voice mode)
```bash
# Verify credentials in backend/.env
cat backend/.env | grep AWS

# Test AWS access
aws sts get-caller-identity
```

**Issue**: Redis connection error
```bash
# Check Redis is running
docker ps | grep redis

# Test Redis connection
redis-cli ping
```

**Issue**: Tests failing
```bash
# Clean and rebuild
cd agents
rm -rf node_modules dist
npm install
npm run build
npm test
```

---

## 🎯 Testing Checklist

### Before Committing Code

- [ ] Run `./run-unified-tests.sh` - all tests pass
- [ ] Run `./quick-test-unified.sh` - agent starts successfully
- [ ] Check logs for errors: `tail -f logs/*.log`
- [ ] Verify no TypeScript errors: `cd agents && npm run build`

### Before Deploying

- [ ] Run `./test-unified-architecture.sh voice` - full E2E test
- [ ] Test all 6 agents start successfully
- [ ] Verify agent-to-agent handoffs work
- [ ] Test tool execution across agents
- [ ] Check session memory preservation
- [ ] Review all logs for warnings/errors

### Testing New Features

- [ ] Write unit tests for new functionality
- [ ] Add property-based tests for invariants
- [ ] Create integration test scenarios
- [ ] Test in all modes (voice, text, hybrid)
- [ ] Verify backward compatibility
- [ ] Update documentation

---

## 📚 Additional Resources

- **Architecture Summary**: `VOICE_AGNOSTIC_ARCHITECTURE_SUMMARY.md`
- **Developer Guide**: `docs/DEVELOPER_GUIDE.md`
- **Requirements**: `.kiro/specs/voice-agnostic-agent-architecture/requirements.md`
- **Design**: `.kiro/specs/voice-agnostic-agent-architecture/design.md`
- **Tasks**: `.kiro/specs/voice-agnostic-agent-architecture/tasks.md`

---

## 🚀 Quick Reference

### Start Services (Production)

```bash
# Docker mode (production-like)
./start-unified-docker.sh

# Local mode (development)
./start-unified-local.sh [voice|text|hybrid]

# Stop Docker services
docker-compose -f docker-compose-unified.yml down
```

### Run Tests

```bash
# Run all automated tests
./run-unified-tests.sh

# Quick test single agent
./quick-test-unified.sh [voice|text|hybrid]

# Full E2E test all agents
./test-unified-architecture.sh [voice|text|hybrid]
```

### Monitor Services

```bash
# View logs (Docker)
docker-compose -f docker-compose-unified.yml logs -f

# View logs (Local)
tail -f logs/*.log

# Check health
curl http://localhost:8080/health
curl http://localhost:8081/health
```

### Common Commands

```bash
# Rebuild Docker images
docker-compose -f docker-compose-unified.yml build

# Restart specific agent (Docker)
docker-compose -f docker-compose-unified.yml restart agent-triage

# View registered agents
curl http://localhost:8080/api/agents | jq
```

---

**Built with ❤️ for voice-agnostic agent testing**
