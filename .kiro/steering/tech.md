# Tech Stack

## Frontend

- **Framework**: Next.js 16.1.3 with React 19.2.3
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **UI Components**: Shadcn UI, Lucide React icons
- **3D Visualization**: Three.js with @react-three/fiber and @react-three/drei
- **Charts**: Recharts for sentiment visualization
- **State Management**: Zustand
- **WebSocket**: Native WebSocket API for binary audio streaming

## Backend

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5
- **Server**: WebSocket Server (ws library)
- **AWS SDK**: 
  - @aws-sdk/client-bedrock-runtime (Nova Sonic)
  - @aws-sdk/client-bedrock-agentcore (Agent workflows)
  - @aws-sdk/client-bedrock-agent-runtime (Knowledge bases)
  - @aws-sdk/client-polly (Text-to-speech)
  - @aws-sdk/client-transcribe-streaming (Speech-to-text)
- **Observability**: Langfuse for tracing and prompt management
- **Environment**: dotenv for configuration

## Audio Specifications

- Format: PCM16 (16-bit signed integer, little-endian)
- Sample Rate: 16,000 Hz
- Channels: 1 (mono)
- Chunk Size: 4,096 samples

## Common Commands

### Installation
```bash
# Install all dependencies (root, frontend, backend)
npm run install:all
```

### Build
```bash
# Build both frontend and backend
npm run build

# Build frontend only
npm run build:frontend

# Build backend only
npm run build:backend
```

### Development
```bash
# Start backend server (production mode)
npm start

# Start backend in dev mode (compile + run)
npm run dev --prefix backend

# Start frontend dev server
npm run dev --prefix frontend-v2
```

### Testing
```bash
# Run E2E tests
node tests/test-complete-native.js
```

## Configuration

### Environment Variables (.env in backend/)
- `NOVA_AWS_REGION`: AWS region (default: us-east-1)
- `NOVA_AWS_ACCESS_KEY_ID`: AWS access key
- `NOVA_AWS_SECRET_ACCESS_KEY`: AWS secret key
- `NOVA_AWS_SESSION_TOKEN`: Optional session token for SSO
- `NOVA_SONIC_MODEL_ID`: Model ID (default: amazon.nova-2-sonic-v1:0)
- `AGENT_CORE_RUNTIME_ARN`: Optional ARN for agent workflows
- `LANGFUSE_PUBLIC_KEY`: Optional Langfuse public key
- `LANGFUSE_SECRET_KEY`: Optional Langfuse secret key
- `LANGFUSE_HOST`: Optional Langfuse host URL

### TypeScript Configuration
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Output: backend/dist/

## Deployment

- Backend runs on port 8080
- Frontend served by backend in production
- Access via http://localhost:8080 (not file:// to avoid CORS)
- Requires HTTPS in production for microphone access
