# Gateway Toggle Implementation - Agent Test Page

## Summary

I've successfully implemented a Gateway Routing toggle for the agent-test page that allows switching between:
- **Gateway Mode ON**: Agents communicate via gateway with full handoff support (Triage → IDV → Banking)
- **Gateway Mode OFF**: Direct agent connection with no handoffs (each agent works independently)

## Changes Made

### File Modified: `frontend-v2/app/agent-test/page.tsx`

#### 1. Added State Variables
```typescript
const [useGateway, setUseGateway] = useState(true); // Gateway mode toggle
const [currentAgent, setCurrentAgent] = useState<string>('triage'); // Track current agent in gateway mode
```

#### 2. Updated Connection Logic
The `connect()` function now handles two modes:

**Gateway Mode (useGateway = true):**
- Connects to: `ws://gateway:8080/sonic`
- Sends `select_workflow` message to choose initial agent
- Gateway handles all agent-to-agent handoffs
- Tracks current agent via `handoff_event` messages

**Direct Mode (useGateway = false):**
- Connects to: `ws://agent-{id}:{port}/session`
- Sends `session_init` with memory
- No handoffs - agent works independently

#### 3. Added Handoff Event Handler
```typescript
case 'handoff_event':
  // Gateway mode: Track agent handoffs
  if (useGateway && message.target) {
    setCurrentAgent(message.target);
    setMessages(prev => [...prev, {
      role: 'system',
      content: `🔄 Handoff: Transferred to ${message.target.toUpperCase()} agent`,
      timestamp: Date.now()
    }]);
  }
  break;
```

#### 4. Added UI Toggle
```typescript
<div className="p-4 bg-gray-700 rounded-lg">
  <div className="flex items-center justify-between mb-2">
    <label htmlFor="gateway-toggle" className="font-semibold text-sm">
      Gateway Routing
    </label>
    <button
      id="gateway-toggle"
      onClick={() => {
        if (isConnected) disconnect();
        setUseGateway(!useGateway);
      }}
      disabled={isConnected}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        useGateway ? "bg-green-600" : "bg-gray-600",
        isConnected && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          useGateway ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  </div>
  <p className="text-xs text-gray-400">
    {useGateway 
      ? "✅ Agents can hand off to each other via Gateway" 
      : "❌ Direct connection - no agent handoffs"}
  </p>
</div>
```

#### 5. Updated Architecture Display
The architecture section now dynamically shows:
- Gateway Routing status (✅ or ❌)
- Current agent when in gateway mode
- Helpful description of each mode

## How to Deploy

### Option 1: Rebuild Docker Image (Recommended)
```bash
# Rebuild frontend image
docker-compose build frontend

# Restart frontend
docker-compose up -d frontend
```

### Option 2: Copy Build Files (Quick Test)
```bash
# Build frontend
cd frontend-v2
npm run build

# Copy all build files to container
docker cp .next/server/app/agent-test voice_s2s-frontend-1:/app/.next/server/app/agent-test
docker cp .next/server/chunks voice_s2s-frontend-1:/app/.next/server/chunks

# Restart frontend
docker restart voice_s2s-frontend-1
```

### Option 3: Development Mode (Fastest for Testing)
```bash
# Stop Docker frontend
docker stop voice_s2s-frontend-1

# Run frontend locally
cd frontend-v2
npm run dev

# Access at http://localhost:3000/agent-test
```

## Testing Instructions

### Test 1: Gateway Mode ON (Default)
1. Open http://192.168.5.190:3000/agent-test
2. Verify toggle is ON (green)
3. Select "Triage Agent"
4. Click "Connect"
5. Type: "What's my balance?"
6. **Expected Result:**
   - Triage calls `transfer_to_idv` ✅
   - UI shows: "🔄 Handoff: Transferred to IDV agent" ✅
   - IDV asks for account details ✅
   - After verification, UI shows: "🔄 Handoff: Transferred to BANKING agent" ✅
   - Banking returns balance ✅
   - Current Agent indicator shows: "BANKING" ✅

### Test 2: Gateway Mode OFF
1. Disconnect if connected
2. Toggle Gateway Routing OFF (gray)
3. Select "Triage Agent"
4. Click "Connect"
5. Type: "What's my balance?"
6. **Expected Result:**
   - Triage calls `transfer_to_idv` ✅
   - Circuit breaker blocks `transfer_to_banking` ✅
   - Agent says it needs verification but can't actually transfer ✅
   - No handoff events occur ✅
   - Agent stays in Triage (no routing) ✅

### Test 3: Direct Banking Access (Gateway OFF)
1. Toggle Gateway Routing OFF
2. Select "Banking Agent"
3. Click "Connect"
4. Type: "What's my balance?"
5. **Expected Result:**
   - Banking agent works directly ✅
   - Calls `perform_idv_check` if not verified ✅
   - Then calls `agentcore_balance` ✅
   - Returns balance ✅
   - No handoffs (working independently) ✅

## Architecture Comparison

### Gateway Mode ON
```
Browser → Gateway (ws://gateway:8080/sonic)
            ↓
         Triage Agent
            ↓ (transfer_to_idv)
         IDV Agent
            ↓ (auto-route after verification)
         Banking Agent
            ↓
         Balance Result
```

### Gateway Mode OFF
```
Browser → Triage Agent (ws://agent-triage:8081/session)
            ↓
         Calls transfer_to_idv
            ↓
         ❌ Circuit Breaker Blocks
            ↓
         Stays in Triage (no routing)
```

## Benefits of This Implementation

1. **Demonstrates Gateway Value**: Users can see the difference between gateway routing and direct access
2. **Educational**: Shows how agents work together vs independently
3. **Testing Tool**: Allows testing both modes without code changes
4. **Clear Visualization**: UI clearly shows current agent and handoff events
5. **Production Ready**: Toggle can be hidden in production or used for admin testing

## Next Steps

1. **Deploy Changes**: Use one of the deployment options above
2. **Test Both Modes**: Verify gateway routing works correctly
3. **Add Voice**: Once chat is working, add Nova Sonic voice wrapper
4. **Documentation**: Update user guide with gateway mode explanation

## Known Issues

- Frontend Docker build may timeout on slow connections
- Need to rebuild Docker image for permanent deployment
- Circuit breaker in direct mode prevents multiple handoff attempts (this is correct behavior)

## Files Changed

- `frontend-v2/app/agent-test/page.tsx` - Added gateway toggle and routing logic

## Files to Review

- `gateway/src/server.ts` - Gateway handoff interception (already fixed)
- `agents/src/text-adapter.ts` - Skip follow-up after handoffs (already fixed)
- `agents/src/voice-sidecar.ts` - Needs same fix as text-adapter (TODO)
