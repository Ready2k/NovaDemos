# Scripts Summary

All available scripts for the Voice-Agnostic Agent Architecture.

## 🚀 Production Scripts (Start Services)

### 1. `start-unified-docker.sh` - Docker Mode
**Start all services in Docker containers (production-like)**

```bash
./start-unified-docker.sh
```

- ✅ Gateway, Local Tools, 6 Agents, Frontend, Redis
- ✅ Isolated containers
- ✅ Production environment
- 📋 Requires: `.env` file with AWS credentials
- 🛑 Stop: `docker-compose -f docker-compose-unified.yml down`

---

### 2. `start-unified-local.sh` - Local Mode
**Start all services locally (development)**

```bash
./start-unified-local.sh [voice|text|hybrid]
```

- ✅ Gateway, Local Tools, 6 Agents, Frontend
- ✅ Local Node.js processes
- ✅ Supports all modes
- 📋 Requires: `backend/.env` file with AWS credentials
- 🛑 Stop: Press `Ctrl+C`

---

## 🧪 Test Scripts

### 3. `run-unified-tests.sh` - Automated Tests
**Run all unit, property-based, and integration tests**

```bash
./run-unified-tests.sh
```

- ✅ 257 tests across 18 test suites
- ✅ 100% core component coverage
- 📊 Unit + Property-based + Integration tests

---

### 4. `quick-test-unified.sh` - Quick Test
**Quick test with single agent (Triage)**

```bash
./quick-test-unified.sh [voice|text|hybrid]
```

- ✅ Gateway + Triage Agent only
- ✅ Fast validation
- ✅ Mode switching test
- 🛑 Stop: Press `Ctrl+C`

---

### 5. `test-unified-architecture.sh` - Full E2E Test
**Complete end-to-end test with all 6 agents**

```bash
./test-unified-architecture.sh [voice|text|hybrid]
```

- ✅ All 6 agents + Gateway + Local Tools
- ✅ Multi-agent handoffs
- ✅ Tool execution
- ✅ Session memory preservation
- 🛑 Stop: Press `Ctrl+C`

---

## 📊 Quick Comparison

| Script | Services | Mode | Use Case |
|--------|----------|------|----------|
| `start-unified-docker.sh` | All (Docker) | voice | Production |
| `start-unified-local.sh` | All (Local) | voice/text/hybrid | Development |
| `run-unified-tests.sh` | None | N/A | Automated testing |
| `quick-test-unified.sh` | Gateway + 1 Agent | voice/text/hybrid | Quick validation |
| `test-unified-architecture.sh` | Gateway + 6 Agents | voice/text/hybrid | Full E2E testing |

---

## 🎯 Which Script Should I Use?

### For Production Deployment
```bash
./start-unified-docker.sh
```

### For Development
```bash
./start-unified-local.sh
```

### For Testing Code Changes
```bash
./run-unified-tests.sh
```

### For Quick Validation
```bash
./quick-test-unified.sh
```

### For Full System Test
```bash
./test-unified-architecture.sh
```

---

## 📝 See Also

- **`SCRIPTS_README.md`** - Detailed documentation for all scripts
- **`TESTING_GUIDE.md`** - Comprehensive testing guide
- **`VOICE_AGNOSTIC_ARCHITECTURE_SUMMARY.md`** - Architecture overview
- **`docs/DEVELOPER_GUIDE.md`** - Developer guide

---

**All scripts are executable and ready to use!**
