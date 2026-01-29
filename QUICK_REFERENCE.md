# Quick Reference Card

## What Was Implemented

✅ **Workflow Selection** - Users can choose which persona to connect to
✅ **Triage Prompt** - Triage agent now has detailed instructions
✅ **Dynamic Routing** - Gateway routes to selected agent
✅ **Backward Compatible** - Defaults to triage if no selection

---

## Quick Start

```bash
# 1. Restart services
./start-all-services.sh

# 2. Open frontend
open http://localhost:3000

# 3. Select workflow from dropdown
# 4. Click Connect
# 5. Test conversation
```

---

## User Flow

1. **Disconnected** → Workflow dropdown appears
2. **Select workflow** → Choose persona (Triage, Banking, Mortgage, Disputes)
3. **Click Connect** → Routes to selected agent
4. **Connected** → Agent uses selected persona
5. **Disconnect** → Dropdown reappears

---

## Key Files

### Frontend
- `frontend-v2/app/page.tsx` - Workflow selection state
- `frontend-v2/components/chat/CommandBar.tsx` - Dropdown UI
- `frontend-v2/lib/hooks/useWebSocket.ts` - Workflow parameter

### Backend
- `gateway/src/server.ts` - Dynamic routing
- `backend/personas/*.json` - Persona configs
- `backend/prompts/*.txt` - Persona prompts

---

## Testing

```bash
# Check Gateway health
curl http://localhost:8080/health

# List personas
curl http://localhost:8080/api/personas | jq

# List agents
curl http://localhost:8080/api/agents | jq
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dropdown doesn't appear | Check `/api/personas` returns data |
| Selection doesn't work | Check WebSocket connection |
| Triage doesn't use new prompt | Restart agent |
| Agent uses wrong persona | Check agent logs for persona loading |

---

## Documentation

| File | Purpose |
|------|---------|
| `IMPLEMENTATION_COMPLETE_SUMMARY.md` | Complete overview |
| `YOUR_QUESTIONS_ANSWERED.md` | Answers to your questions |
| `TEST_WORKFLOW_SELECTION.md` | Testing guide |
| `WORKFLOW_SELECTION_IMPLEMENTED.md` | Implementation details |
| `JOURNEY_CONFIGURATION_EXPLAINED.md` | Multi-agent journey design |
| `SYSTEM_FLOW_DIAGRAM.md` | Visual diagrams |
| `QUICK_REFERENCE.md` | This file |

---

## What's Missing

❌ Multi-agent journeys (Triage → Banking → Resolution)
❌ Automatic handoffs between agents
❌ Journey configuration files
❌ Journey state tracking

See `JOURNEY_CONFIGURATION_EXPLAINED.md` for implementation guide.

---

## Success Criteria

✅ Dropdown appears when disconnected
✅ All personas show in dropdown
✅ Selecting workflow routes to correct agent
✅ Agent uses correct persona (voice, prompt, tools)
✅ Triage uses new greeting
✅ Dropdown hides when connected
✅ No console errors

---

## Next Steps

1. ✅ Test workflow selection
2. ✅ Verify triage prompt
3. ✅ Test all personas
4. ⏭️ Consider multi-agent journeys (if needed)

---

## Quick Commands

```bash
# Restart agent
./start-all-services.sh

# View Gateway logs
docker logs gateway -f

# View Agent logs
docker logs agent-s2s -f

# Check Redis
redis-cli ping

# Test API
curl http://localhost:8080/api/personas | jq
```

---

## Your Questions

### Q: How do I select the experience?
**A:** Use the workflow dropdown when disconnected.

### Q: How do I configure multi-agent journeys?
**A:** Not yet implemented. See `JOURNEY_CONFIGURATION_EXPLAINED.md`.

### Q: How does Triage know what to say?
**A:** Triage now has a detailed prompt file (`persona-triage.txt`).

---

## Support

If you need help:
1. Check documentation files
2. Review troubleshooting section
3. Check logs (frontend, Gateway, agent)
4. Verify files exist and are correct

---

## Summary

**What you can do now:**
- Select workflow before connecting
- Connect directly to any persona
- Each persona has unique behavior
- Triage has proper instructions

**What you need for multi-agent journeys:**
- Journey configuration files
- JourneyRouter class
- Handoff detection
- Journey state tracking

**Ready to test!** 🚀
