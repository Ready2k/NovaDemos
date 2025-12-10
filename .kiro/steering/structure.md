# Project Structure & Organization

## Directory Layout

```
Voice_S2S/
├── frontend/                    # Vanilla JS frontend (no build tools)
│   ├── index.html              # Main UI with controls and visualizer
│   ├── main.js                 # WebSocket connection and state management
│   ├── audio.js                # Audio capture, PCM16 conversion, playback
│   └── index.css               # Styling for the interface
├── backend/                     # Node.js TypeScript backend
│   ├── src/
│   │   ├── server.ts           # Main WebSocket server with dual architecture
│   │   ├── sonic-client.ts     # Nova Sonic integration and streaming
│   │   ├── bedrock-agent-client.ts # Banking Bot and agent workflows
│   │   ├── transcribe-client.ts    # Audio transcription for agent mode
│   │   ├── agentcore-gateway-client.ts # AgentCore tool execution
│   │   ├── debug-tools.ts      # Debug utilities and logging
│   │   └── test-*.ts           # Backend test utilities
│   ├── prompts/                # External LLM prompt files
│   │   ├── core-*.txt          # Platform/system prompts
│   │   └── persona-*.txt       # Character/role prompts
│   ├── dist/                   # Compiled TypeScript output
│   ├── package.json            # Backend dependencies and scripts
│   ├── tsconfig.json           # TypeScript configuration
│   ├── .env.example            # Environment template
│   └── .env                    # AWS credentials (gitignored)
├── tools/                       # Tool definitions for AgentCore
│   ├── time_tool.json          # Time query tool definition
│   ├── agentcore_*.json        # Banking and transaction tools
│   └── *_agent.json            # Agent-specific tool configurations
├── tests/                       # All test files and scripts
│   ├── logs/                   # Test execution logs
│   ├── *.js                    # JavaScript test clients
│   ├── *.ts                    # TypeScript test files
│   ├── *.sh                    # Shell scripts for testing
│   └── README.md               # Test documentation
├── .kiro/                       # Kiro IDE configuration
│   └── steering/               # AI assistant guidance documents
├── node_modules/               # Root level dependencies (minimal)
├── package.json                # Root project configuration
└── *.md                        # Documentation files
```

## File Naming Conventions

### Prompt Files (`backend/prompts/`)
- **Core prompts**: `core-{functionality}.txt` (e.g., `core-guardrails.txt`)
- **Persona prompts**: `persona-{character}.txt` (e.g., `persona-pirate.txt`)
- **Purpose**: External prompt files loaded via `loadPrompt()` function calls

### Tool Definitions (`tools/`)
- **Format**: JSON files with tool schemas for AgentCore
- **Naming**: `{service}_{function}.json` or `{agent}_agent.json`
- **Structure**: Contains `name`, `description`, `input_schema`, and `agentCoreToolName`

### Test Files (`tests/`)
- **JavaScript clients**: `test-{feature}.js` (e.g., `test-native-client.js`)
- **TypeScript tests**: `test-{component}.ts` (e.g., `test-agent-core.ts`)
- **Shell scripts**: `run-{test-type}.sh` (e.g., `run-native-test.sh`)
- **Logs**: Stored in `tests/logs/` with descriptive names

## Code Organization Patterns

### Backend Architecture
- **server.ts**: Main entry point, WebSocket handling, routing between modes
- **sonic-client.ts**: Nova Sonic streaming, tool detection, audio processing
- **bedrock-agent-client.ts**: Agent workflows, transcription integration
- **agentcore-gateway-client.ts**: Tool execution orchestration
- **Separation**: Each client handles one specific AWS service integration

### Frontend Architecture
- **index.html**: Complete UI definition, no templating
- **main.js**: WebSocket communication, state management, UI updates
- **audio.js**: Audio capture/playback, PCM16 conversion, visualization
- **Modularity**: Each file has a single responsibility

### Configuration Management
- **Environment**: `.env` files for AWS credentials and configuration
- **Runtime**: GUI-based AWS configuration stored in sessionStorage
- **Persistence**: Settings saved to localStorage for user preferences
- **Prompts**: External files for easy modification without code changes

## Development Guidelines

### Adding New Features
1. **Tools**: Add JSON definition to `tools/` directory
2. **Prompts**: Create external `.txt` file in `backend/prompts/`
3. **Tests**: Add test file to `tests/` with appropriate naming
4. **Documentation**: Update relevant `.md` files

### File Modifications
- **Backend**: Always rebuild with `npm run build` after TypeScript changes
- **Frontend**: Direct file editing, no build step required
- **Prompts**: Hot-reloadable, no server restart needed
- **Tools**: Require server restart to pick up new definitions

### Logging and Debugging
- **Backend logs**: Timestamped console output with structured levels
- **Test logs**: Stored in `tests/logs/` for analysis
- **Debug mode**: Frontend debug panel for real-time metrics
- **Error handling**: Graceful degradation with user feedback