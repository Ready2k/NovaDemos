# Project Structure

## Monorepo Organization

Voice S2S is organized as a monorepo with separate frontend and backend packages, plus shared configuration and data directories.

```
Voice_S2S/
├── frontend-v2/          # Next.js frontend application
├── backend/              # TypeScript WebSocket server
├── tools/                # Tool definitions (JSON)
├── workflows/            # Workflow definitions (JSON)
├── prompts/              # System prompts and personas
├── docs/                 # Documentation
├── tests/                # E2E tests
└── [data directories]    # Runtime data
```

## Frontend Structure (`frontend-v2/`)

```
frontend-v2/
├── app/                  # Next.js App Router pages
├── components/           # React components
│   ├── ui/              # Shadcn UI components
│   └── [feature]/       # Feature-specific components
├── lib/                  # Utilities and hooks
│   ├── hooks/           # Custom React hooks
│   └── utils/           # Helper functions
├── public/              # Static assets
└── package.json
```

## Backend Structure (`backend/`)

```
backend/
├── src/
│   ├── server.ts                    # Main WebSocket server
│   ├── sonic-client.ts              # Nova Sonic integration
│   ├── bedrock-agent-client.ts      # Agent mode client
│   ├── agentcore-gateway-client.ts  # AgentCore gateway
│   ├── tool-manager.ts              # Tool loading and execution
│   ├── transcribe-client.ts         # Audio transcription
│   ├── voice-service.ts             # Voice management
│   ├── simulation-service.ts        # User simulation
│   ├── dialect-detector.ts          # Language detection
│   ├── transition-handler.ts        # State transitions
│   ├── phantom-action-watcher.ts    # Action monitoring
│   ├── services/
│   │   └── prompt-service.ts        # Prompt management
│   └── workflow-*.json              # Embedded workflows
├── prompts/                         # System prompts
│   ├── core-*.txt                   # Core system prompts
│   └── persona-*.txt                # Persona definitions
├── data/
│   └── presets.json                 # UI presets
├── history/                         # Session history (JSON)
├── dist/                            # Compiled output
└── package.json
```

## Tools Directory (`tools/`)

JSON files defining tool schemas with:
- `name`: Tool identifier
- `description`: What the tool does
- `input_schema`: JSON schema for parameters
- `instruction`: Usage instructions for LLM
- `category`: Banking, Mortgage, System, Other
- `gatewayTarget`: Optional gateway mapping

Categories:
- **Banking**: agentcore_balance, agentcore_transactions, create_dispute_case, update_dispute_case, lookup_merchant_alias
- **Mortgage**: calculate_max_loan, get_mortgage_rates, value_property, check_credit_score
- **Identity**: perform_idv_check
- **Knowledge**: search_knowledge_base, uk_branch_lookup
- **System**: get_server_time, manage_recent_interactions

## Workflows Directory (`workflows/`)

JSON files defining visual workflow graphs:
- Node-based structure with decision trees
- Linked to specific personas
- Auto-injected into system prompts
- Format: `workflow-{persona-name}.json`

## Prompts Directory (`prompts/`)

Text files containing system prompts:
- `core-system_default.txt`: Base system prompt
- `core-guardrails.txt`: Safety and quality rules
- `core-tool_access_assistant.txt`: Tool usage instructions
- `persona-*.txt`: Persona-specific behaviors
- `hidden-dialect_detection.txt`: Language detection prompt

## Data Directories

- `backend/history/`: Session JSON files with conversation logs
- `chat_history/`: Frontend chat history
- `logs/`: Application logs
- `knowledge_bases.json`: Knowledge base configurations

## Key Conventions

- **TypeScript everywhere**: Both frontend and backend use TS
- **JSON for configuration**: Tools, workflows, and data use JSON
- **Service pattern**: Backend uses service classes (SonicClient, ToolManager, etc.)
- **WebSocket binary frames**: Audio data transmitted as binary
- **Environment-based config**: AWS credentials and settings via .env
- **Modular tool system**: Tools loaded dynamically from JSON definitions
- **Prompt composition**: System prompts built from multiple files
