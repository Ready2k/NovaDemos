# Tech Stack & Build System

## Core Technologies

### Frontend
- **Framework**: Next.js 14+ with React 18+
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn UI components
- **Visualization**: Recharts (sentiment), Three.js/Canvas (audio)
- **WebSocket**: Custom binary frame handling
- **State**: React hooks + localStorage persistence

### Backend
- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Server**: Express.js + WebSocket (ws library)
- **AWS SDK**: Bedrock Runtime, Bedrock Agent Runtime, Polly, Transcribe Streaming
- **Orchestration**: LangChain + LangGraph
- **Observability**: Langfuse
- **Validation**: Zod

### Agent System
- **Runtime**: Node.js with Express
- **Orchestration**: LangChain + LangGraph
- **Communication**: WebSocket + Redis
- **AWS Integration**: Bedrock Runtime, Transcribe Streaming
- **Observability**: Langfuse

### Infrastructure
- **Audio Format**: PCM16 (16-bit signed integer), 16kHz mono
- **Streaming**: WebSocket binary frames
- **Caching**: In-memory with TTL (tool-specific)
- **Deployment**: Docker-ready (Dockerfiles provided)

## Build & Development Commands

### Frontend
```bash
cd frontend-v2

# Install dependencies
npm install

# Development server (with hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Linting
npm run lint
```

### Backend
```bash
cd backend

# Install dependencies
npm install

# Build TypeScript
npm run build

# Development (compile + run)
npm run dev

# Production start
npm start
```

### Agents
```bash
cd agents

# Install dependencies
npm install

# Build TypeScript
npm run build

# Development with ts-node
npm run dev

# Production start
npm start
```

## Key Dependencies

### Backend Core
- `@aws-sdk/client-bedrock-runtime`: Nova Sonic model invocation
- `@aws-sdk/client-bedrock-agentcore`: Agent runtime
- `@aws-sdk/client-polly`: Text-to-speech
- `@aws-sdk/client-transcribe-streaming`: Speech-to-text
- `@langchain/langgraph`: Workflow orchestration
- `ws`: WebSocket server
- `express`: HTTP server
- `langfuse`: Observability

### Frontend Core
- `next`: React framework
- `react`: UI library
- `recharts`: Sentiment visualization
- `shadcn/ui`: Component library
- `tailwindcss`: Styling

## Environment Configuration

### Backend (.env)
```
NOVA_AWS_REGION=us-east-1
NOVA_AWS_ACCESS_KEY_ID=xxx
NOVA_AWS_SECRET_ACCESS_KEY=xxx
NOVA_AWS_SESSION_TOKEN=xxx (optional)
NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0
AGENT_CORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:...
LANGFUSE_PUBLIC_KEY=xxx (optional)
LANGFUSE_SECRET_KEY=xxx (optional)
LANGFUSE_HOST=https://cloud.langfuse.com (optional)
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## Testing

### Unit Tests
- Located in `/tests` directory
- Run with: `npm test` (if configured)

### Integration Tests
- E2E test harness: `/tests/test-complete-native.js`
- Tests full voice flow with tool execution

### Manual Testing
- Use browser DevTools for WebSocket inspection
- Check server logs for tool execution details
- Verify sentiment parsing in console

## Code Style & Conventions

### TypeScript
- Strict mode enabled
- Type all function parameters and returns
- Use interfaces for object shapes
- Avoid `any` type

### File Organization
- Source code in `src/` directories
- Compiled output in `dist/`
- Tests co-located with source or in `/tests`
- Configuration files at root

### Naming Conventions
- Files: kebab-case (e.g., `sonic-client.ts`)
- Classes: PascalCase (e.g., `SonicClient`)
- Functions: camelCase (e.g., `handleAudioFrame`)
- Constants: UPPER_SNAKE_CASE (e.g., `CHUNK_SIZE`)

### Error Handling
- Use try-catch for async operations
- Log errors with context
- Return meaningful error messages to clients
- Validate all external inputs

## Performance Considerations

- **Tool Caching**: Reduces API calls by 60-80%
- **Binary Streaming**: Efficient WebSocket frames
- **Lazy Loading**: Tools loaded on-demand
- **Connection Pooling**: Reuse AWS SDK clients
- **Chunk Optimization**: 4,096 samples per frame

## Deployment

### Docker
```bash
# Backend
docker build -t voice-s2s-backend ./backend
docker run -p 8080:8080 -e NOVA_AWS_REGION=us-east-1 ... voice-s2s-backend

# Frontend
docker build -t voice-s2s-frontend ./frontend-v2
docker run -p 3000:3000 voice-s2s-frontend
```

### Production Checklist
- [ ] Environment variables set securely
- [ ] HTTPS enabled with valid SSL
- [ ] CORS configured for production domain
- [ ] Monitoring and logging enabled
- [ ] Rate limiting configured
- [ ] All tools tested in production
- [ ] Backup and disaster recovery setup
