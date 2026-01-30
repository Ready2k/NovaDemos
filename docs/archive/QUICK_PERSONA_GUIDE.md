# Quick Persona Configuration Guide

## TL;DR

**Where to configure agent behavior:**

1. **Agent instructions:** `backend/prompts/persona-BankingDisputes.txt`
2. **Workflow logic:** `backend/workflows/workflow_banking.json`
3. **Allowed tools:** `backend/personas/persona-BankingDisputes.json`
4. **Voice:** `backend/personas/persona-BankingDisputes.json`

## Quick Edits

### Change What Agent Says
Edit: `backend/prompts/persona-BankingDisputes.txt`
```
You are the Barclays Banking Assistant...
[Your instructions here]
```

### Change Workflow Logic
Edit: `backend/workflows/workflow_banking.json`
```json
{
  "nodes": [...],
  "edges": [...]
}
```

### Change Allowed Tools
Edit: `backend/personas/persona-BankingDisputes.json`
```json
{
  "allowedTools": [
    "perform_idv_check",
    "create_dispute_case"
  ]
}
```

### Change Voice
Edit: `backend/personas/persona-BankingDisputes.json`
```json
{
  "voiceId": "tiffany"
}
```

## Available Voices

- `matthew` - US Male, Polyglot
- `tiffany` - US Female, Polyglot
- `amy` - UK Female
- `ruth` - US Female
- `stephen` - US Male

## File Structure

```
backend/
├── personas/              # Persona configs (links everything)
│   ├── persona-BankingDisputes.json
│   ├── persona-SimpleBanking.json
│   └── persona-mortgage.json
│
├── prompts/              # Agent instructions
│   ├── persona-BankingDisputes.txt
│   ├── persona-SimpleBanking.txt
│   └── persona-mortgage.txt
│
├── workflows/            # Workflow logic
│   ├── workflow_banking.json
│   ├── workflow_triage.json
│   └── workflow_disputes.json
│
└── tools/                # Tool definitions
    ├── perform_idv_check.json
    ├── create_dispute_case.json
    └── agentcore_balance.json
```

## How They Connect

```
workflow_banking.json
  ↓ (personaId: "persona-BankingDisputes")
persona-BankingDisputes.json
  ↓ (promptFile: "persona-BankingDisputes.txt")
persona-BankingDisputes.txt
  ↓ (allowedTools: [...])
Tools: perform_idv_check, create_dispute_case, etc.
```

## After Making Changes

```bash
# Restart services
./start-all-services.sh

# Or just rebuild agent
cd agents && npm run build
docker-compose up -d --build agent-banking
```

## Common Tasks

### Add a New Tool to Persona
1. Edit `backend/personas/persona-BankingDisputes.json`
2. Add tool name to `allowedTools` array
3. Restart agent

### Create New Persona
1. Create `backend/personas/persona-YourName.json`
2. Create `backend/prompts/persona-YourName.txt`
3. Update workflow to use new persona
4. Restart agent

### Change Agent Tone
1. Edit `backend/prompts/persona-BankingDisputes.txt`
2. Modify instructions (e.g., "Be more casual" or "Be more formal")
3. Restart agent

### Debug Persona Loading
Check agent logs for:
```
[Agent:banking] ✅ Persona loaded: Banking Disputes Agent
[Agent:banking]    Voice: tiffany
[Agent:banking]    Allowed tools: 8
[Agent:banking]    Prompt length: 3456 chars
```

## That's It!

The persona system is now your single source of truth for agent configuration.
