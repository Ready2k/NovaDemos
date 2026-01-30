# Project Structure

## Directory Organization

```
Voice_S2S/
├── frontend-v2/                    # Next.js frontend application
│   ├── app/                        # Next.js App Router pages
│   │   ├── page.tsx               # Main chat interface
│   │   ├── layout.tsx             # Root layout
│   │   └── api/                   # API routes (if any)
│   ├── components/                # React components
│   │   ├── chat/                  # Chat UI components
│   │   ├── audio/                 # Audio visualization
│   │   ├── workflow/              # Workflow editor
│   │   ├── settings/              # Settings panels
│   │   └── ui/                    # Shadcn UI components
│   ├── lib/                       # Utilities and hooks
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── utils/                 # Helper functions
│   │   └── types.ts               # TypeScript types
│   ├── public/                    # Static assets
│   ├── next.config.ts             # Next.js configuration
│   ├── tsconfig.json              # TypeScript config
│   └── package.json
│
├── backend/                        # Express.js backend server
│   ├── src/
│   │   ├── server.ts              # Main WebSocket server
│   │   ├── sonic-client.ts        # Nova Sonic integration
│   │   ├── bedrock-agent-client.ts # Bedrock Agent mode
│   │   ├── transcribe-client.ts   # Speech-to-text
│   │   ├── voice-service.ts       # Voice processing
│   │   ├── types.ts               # TypeScript types
│   │   ├── services/              # Business logic services
│   │   ├── utils/                 # Helper utilities
│   │   ├── graph/                 # LangGraph workflows
│   │   ├── prompts/               # System prompts
│   │   │   ├── core_guardrails.txt
│   │   │   └── agent_echo.txt
│   │   └── workflow-*.json        # Workflow definitions
│   ├── dist/                      # Compiled JavaScript
│   ├── tsconfig.json              # TypeScript config
│   ├── package.json
│   └── .env                       # Environment variables (not in git)
│
├── agents/                         # Multi-agent runtime system
│   ├── src/
│   │   ├── agent-runtime.ts       # Main agent runtime
│   │   ├── types.ts               # Type definitions
│   │   └── services/              # Agent services
│   ├── dist/                      # Compiled JavaScript
│   ├── tsconfig.json
│   └── package.json
│
├── tools/                          # Tool definitions (JSON)
│   ├── agentcore_balance.json     # Banking: check balance
│   ├── agentcore_transactions.json # Banking: transactions
│   ├── create_dispute_case.json   # Banking: disputes
│   ├── calculate_max_loan.json    # Mortgage: loan calculation
│   ├── get_mortgage_rates.json    # Mortgage: rates
│   ├── perform_idv_check.json     # Identity verification
│   ├── search_knowledge_base.json # Knowledge base RAG
│   ├── get_server_time.json       # System: time
│   └── *.json                     # Additional tools
│
├── workflows/                      # Workflow definitions
│   ├── workflow-banking.json      # Banking workflow
│   ├── workflow-mortgage.json     # Mortgage workflow
│   ├── workflow-triage.json       # Triage workflow
│   └── workflow-*.json            # Persona-specific workflows
│
├── docs/                           # Documentation
│   ├── USER_GUIDE.md              # Comprehensive user manual
│   ├── getting_started.md         # Setup guide
│   ├── tool_management.md         # Tool configuration
│   ├── knowledge_bases.md         # KB integration
│   ├── workflows.md               # Workflow design
│   └── images/                    # Screenshots
│
├── tests/                          # Test files
│   ├── test-complete-native.js    # E2E test harness
│   └── *.test.ts                  # Unit tests
│
├── chat_history/                   # Session history (runtime)
│   └── session_*.json             # Individual sessions
│
├── docker-compose.yml             # Docker orchestration
├── docker-compose-s2s-test.yml    # S2S testing compose
├── docker-compose-a2a.yml         # A2A testing compose
├── Dockerfile                     # Backend Dockerfile
├── .env                           # Root environment (not in git)
├── .gitignore                     # Git ignore rules
├── README.md                      # Main documentation
├── CHANGELOG.md                   # Version history
└── LICENSE                        # MIT License

```

## Key Directories Explained

### `/frontend-v2`
Next.js React application serving the web UI. Contains all client-side code for voice interaction, workflow editing, and settings management.

**Key Files:**
- `app/page.tsx` - Main chat interface
- `components/` - Reusable React components
- `lib/hooks/` - Custom hooks for WebSocket, audio, etc.

### `/backend`
Express.js WebSocket server handling real-time voice streaming, tool execution, and AWS Bedrock integration.

**Key Files:**
- `server.ts` - WebSocket server setup
- `sonic-client.ts` - Nova Sonic model integration
- `bedrock-agent-client.ts` - Agent mode implementation
- `transcribe-client.ts` - Speech-to-text streaming
- `services/` - Business logic (tool execution, caching, etc.)

### `/agents`
Multi-agent runtime system for complex orchestration scenarios. Handles agent-to-agent communication and workflow execution.

**Key Files:**
- `agent-runtime.ts` - Main runtime loop
- `services/` - Agent-specific services

### `/tools`
JSON definitions for all available tools. Each tool specifies:
- Name, description, category
- Input parameters with types
- Output format
- Tool-specific metadata

### `/workflows`
JSON workflow definitions for different personas and use cases. Defines:
- Node-based flow structure
- Decision logic and branching
- Tool integration points
- Persona associations

### `/docs`
Comprehensive documentation including user guides, setup instructions, and architecture details.

## File Naming Conventions

- **TypeScript Files**: `kebab-case.ts` (e.g., `sonic-client.ts`)
- **React Components**: `PascalCase.tsx` (e.g., `ChatWindow.tsx`)
- **JSON Configs**: `kebab-case.json` (e.g., `workflow-banking.json`)
- **Test Files**: `*.test.ts` or `test-*.js`
- **Environment**: `.env` (not in git), `.env.example` (template)

## Important Patterns

### Backend Architecture
1. **WebSocket Server** (`server.ts`) - Handles client connections
2. **Client Handlers** (`sonic-client.ts`, `bedrock-agent-client.ts`) - AWS integration
3. **Services** (`services/`) - Business logic and tool execution
4. **Types** (`types.ts`) - Shared TypeScript interfaces

### Frontend Architecture
1. **Pages** (`app/`) - Next.js routes
2. **Components** (`components/`) - Reusable UI pieces
3. **Hooks** (`lib/hooks/`) - Custom React hooks for state
4. **Utils** (`lib/utils/`) - Helper functions

### Tool System
- Tools are JSON definitions in `/tools`
- Loaded dynamically by backend
- Executed via tool execution engine
- Results cached with TTL

### Workflow System
- Workflows are JSON node graphs in `/workflows`
- Injected into system prompts dynamically
- Tied to personas for context
- Edited via visual workflow editor

## Build Output

- **Frontend**: Compiled to `/frontend-v2/.next` and `/frontend-v2/out`
- **Backend**: Compiled to `/backend/dist`
- **Agents**: Compiled to `/agents/dist`

## Runtime Directories

- **Chat History**: `/chat_history/` - Session JSON files
- **Logs**: `/logs/` - Server logs (if configured)
- **Data**: `/backend/data/` - Persistent data storage

## Configuration Files

- `.env` - Backend environment variables (not in git)
- `.env.local` - Frontend environment variables (not in git)
- `.env.example` - Template for environment setup
- `tsconfig.json` - TypeScript configuration per package
- `next.config.ts` - Next.js configuration
- `docker-compose.yml` - Docker orchestration

## Development Workflow

1. **Frontend Changes**: Edit in `/frontend-v2`, hot reload via `npm run dev`
2. **Backend Changes**: Edit in `/backend/src`, rebuild with `npm run build`
3. **Tool Changes**: Update JSON in `/tools`, restart backend
4. **Workflow Changes**: Edit JSON in `/workflows`, reload in UI
5. **Documentation**: Update `/docs` and root `README.md`

## Testing Structure

- Unit tests co-located with source or in `/tests`
- E2E tests in `/tests/test-complete-native.js`
- Manual testing via browser DevTools
- Server logs for debugging
