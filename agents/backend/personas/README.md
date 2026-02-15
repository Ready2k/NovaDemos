# Persona Configuration Files

This directory contains persona configuration files that link together:
- System prompts (from `backend/prompts/`)
- Workflows (from `backend/workflows/`)
- Tools (from `backend/tools/`)

## Structure

Each persona config file defines:

```json
{
  "id": "persona-BankingDisputes",
  "name": "Banking Disputes Agent",
  "description": "Professional banking agent handling disputes...",
  "promptFile": "persona-BankingDisputes.txt",
  "workflows": ["banking", "disputes"],
  "allowedTools": [
    "perform_idv_check",
    "create_dispute_case",
    ...
  ],
  "voiceId": "tiffany",
  "metadata": {
    "language": "en-US",
    "region": "UK",
    "tone": "professional-friendly",
    "specializations": ["disputes", "transactions"]
  }
}
```

## Fields

- **id**: Unique identifier for the persona (matches filename without .json)
- **name**: Human-readable name
- **description**: What this persona does
- **promptFile**: Filename in `backend/prompts/` (or null if no prompt)
- **workflows**: Array of workflow IDs this persona can use
- **allowedTools**: Array of tool names this persona can access
- **voiceId**: AWS Nova Sonic voice ID (e.g., "tiffany", "matthew", "amy")
- **metadata**: Additional configuration (language, region, tone, etc.)

## How It Works

1. **Workflow files** reference a persona via `personaId` field
2. **Agent runtime** loads the persona config on startup
3. **Persona loader** loads the prompt file and combines it with workflow instructions
4. **Tool filtering** restricts which tools the agent can use
5. **Voice configuration** is taken from persona config

## Available Personas

- **persona-BankingDisputes**: Full-featured banking agent with disputes handling
- **persona-SimpleBanking**: Basic banking queries (balance, transactions)
- **persona-mortgage**: Mortgage specialist with loan calculations
- **triage**: Initial routing agent (no tools, just routing logic)

## Creating a New Persona

1. Create a new JSON file: `backend/personas/persona-YourName.json`
2. Create a prompt file: `backend/prompts/persona-YourName.txt`
3. Define allowed tools and workflows
4. Update workflow files to reference the new persona
5. Restart agent to load the new configuration

## Tool Security

The `allowedTools` array provides security by restricting which tools an agent can access:
- Prevents accidental tool usage
- Isolates sensitive operations
- Makes it clear what each persona can do

## Example: Adding a New Persona

```json
{
  "id": "persona-CustomerService",
  "name": "Customer Service Agent",
  "description": "General customer service queries",
  "promptFile": "persona-CustomerService.txt",
  "workflows": ["customer-service"],
  "allowedTools": [
    "search_knowledge_base",
    "uk_branch_lookup"
  ],
  "voiceId": "matthew",
  "metadata": {
    "language": "en-US",
    "region": "UK",
    "tone": "friendly-helpful"
  }
}
```

Then create `backend/prompts/persona-CustomerService.txt` with the system prompt.
