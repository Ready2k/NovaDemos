# Restart Local Services - Quick Guide

## You're Using Local Development (Not Docker)

The handoff code is already built and ready. Just restart the local services.

## Quick Restart

```bash
./restart-local-services.sh
```

This will:
1. ✅ Stop old processes
2. ✅ Rebuild agent & gateway with handoff code
3. ✅ Start all services
4. ✅ Verify health
5. ✅ Check handoff tools loaded

## Test Handoff

1. Open: http://localhost:3000
2. Select: "Triage Agent"
3. Say: "I need to check my balance"
4. Listen: Voice changes matthew → joanna

## Check Handoff Tools Loaded

```bash
# Start a session first, then check
tail -f logs/agent.log | grep "Generated.*handoff"
```

Should show:
```
[Agent:triage] Generated 5 handoff tools
```

## View Logs

```bash
# All logs
tail -f logs/*.log

# Just agent
tail -f logs/agent.log

# Watch for handoffs
tail -f logs/agent.log | grep HANDOFF
```

## What's Different from Docker?

- ✅ Local = Latest code, faster iteration
- ❌ Docker = Old code, needs image rebuild

**Stick with local for now!**

## Next Steps After Testing

Once you verify the basic handoff works (Triage → Banking), we can implement your full journey:
- Session memory (context passing)
- Return handoffs (Banking → Triage)
- Sub-agents (Balance, Transactions)
- Tools (verify_account, get_balance, get_transactions)

But first, let's test what we have! 🚀
