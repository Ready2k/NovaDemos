# Docker Runtime Issues & Improvements

## Problem Summary

Based on code review, there are **6 critical issues** causing problems:

### 1. **Frontend API Routes Failing with 500 Errors**
**Location**: `frontend-v2/app/api/voices/route.ts`, `frontend-v2/app/api/history/route.ts`

**Issue**: Frontend Next.js API routes are trying to call `http://localhost:8080` from inside the Docker container, but they should use the internal Docker network URL `http://gateway:8080`.

**Error Messages**:
```
GET http://localhost:3000/api/voices 500 (Internal Server Error)
GET http://localhost:3000/api/history 500 (Internal Server Error)
```

**Root Cause**: The API routes use `process.env.NEXT_PUBLIC_API_URL` which is meant for browser-side requests. Server-side API routes need to use `process.env.INTERNAL_API_URL` to reach the gateway service within the Docker network.

**Current Code**:
```typescript
export async function GET() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    const response = await fetch(`${apiUrl}/api/voices`);
    // ...
  }
}
```

**Problem**: Inside the Docker container, `localhost:8080` doesn't exist. The gateway service is at `gateway:8080` on the Docker network.

### 2. **Auto-Trigger Logic Causing Loops**
**Location**: `agents/src/agent-runtime-unified.ts` lines 572-623

**Issue**: The banking agent has auto-trigger logic that fires when a session is initialized with memory containing verified user and intent. This can cause:
- Repeated triggering if session is re-initialized
- Excessive activity if memory state isn't properly managed
- Speaking over itself if timing isn't perfect

**Current Code**:
```typescript
// CRITICAL: Auto-trigger banking agent with verified user and intent
if (this.config.agentId === 'banking' && memory) {
    const hasVerifiedUser = memory.verified && memory.userName;
    const hasIntent = memory.userIntent;
    const hasAccountDetails = memory.account && memory.sortCode;

    if (hasVerifiedUser && (hasIntent || hasAccountDetails)) {
        console.log(`[UnifiedRuntime:${this.config.agentId}] 🚀 Auto-triggering Banking agent...`);
        // Sends automatic message after 1 second
        setTimeout(() => {
            this.voiceSideCar!.handleTextInput(sessionId, triggerMessage, true)
        }, 1000);
    }
}
```

**Problems**:
- No guard against multiple triggers
- No check if session was already auto-triggered
- Fires on every session_init, even reconnections

### 2. **AgentCore ARN Configuration Issues**
**Location**: `local-tools/src/server.ts` and docker-compose files

**Issue**: The `AGENTCORE_URL` environment variable is being set but not properly validated or used:

**In docker-compose-unified.yml**:
```yaml
- AGENTCORE_URL=${AGENTCORE_GATEWAY_URL}
```

**In .env**:
```
AGENTCORE_GATEWAY_URL=https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp
```

**Problems**:
- Variable name mismatch: `AGENTCORE_URL` vs `AGENTCORE_GATEWAY_URL`
- The agents receive `AGENTCORE_URL` but local-tools uses `AGENTCORE_GATEWAY_URL`
- No validation that the URL is accessible
- Errors logged but not properly handled

### 3. **Session Re-initialization Without Cleanup**
**Location**: `agents/src/agent-runtime-unified.ts` lines 540-545

**Issue**: When a session already exists, it logs a warning but the cleanup might not be complete before re-initializing:

```typescript
if (this.sessions.has(sessionId)) {
    console.warn(`[UnifiedRuntime:${this.config.agentId}] Session ${sessionId} already exists. Cleaning up stale session.`);
    await this.handleDisconnect(sessionId);
}
```

**Problems**:
- Async cleanup might not complete before new session starts
- Could leave orphaned voice/text sessions
- May cause duplicate message handlers

### 4. **Excessive Logging in Production**
**Location**: Throughout `agent-runtime-unified.ts`

**Issue**: Every message type is logged, creating noise:
```typescript
console.log(`[UnifiedRuntime:${this.config.agentId}] 📨 Received message type: ${message.type}, sessionId=${sessionId}`);
```

This creates excessive log output, especially with:
- Audio chunks (binary data)
- Heartbeats every 15 seconds
- Memory updates
- Tool executions

### 5. **Missing Error Boundaries**
**Location**: `agents/src/agent-runtime-unified.ts` handleMessage method

**Issue**: Errors in message handling are caught but session continues:
```typescript
catch (error: any) {
    console.error(`[UnifiedRuntime:${this.config.agentId}] Error handling message: ${error.message}`);
    ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing message',
        details: error.message
    }));
}
```

**Problems**:
- Session continues in potentially broken state
- No circuit breaker for repeated errors
- Could cause infinite error loops

## Recommended Improvements

### Priority 1: Fix Auto-Trigger Logic

**File**: `agents/src/agent-runtime-unified.ts`

**Changes**:
1. Add session flag to track if auto-trigger already fired
2. Add guard to prevent multiple triggers
3. Make auto-trigger opt-in via environment variable

```typescript
// Add to RuntimeSession interface
interface RuntimeSession {
    sessionId: string;
    ws: WebSocket;
    mode: 'voice' | 'text' | 'hybrid';
    startTime: number;
    memory?: any;
    traceId?: string;
    autoTriggered?: boolean; // NEW: Track if auto-trigger fired
}

// Update auto-trigger logic
private async initializeSession(sessionId: string, ws: WebSocket, memory?: any, traceId?: string): Promise<void> {
    // ... existing code ...

    // Store session
    const session: RuntimeSession = {
        sessionId,
        ws,
        mode: this.config.mode,
        startTime: Date.now(),
        memory,
        traceId,
        autoTriggered: false // Initialize flag
    };
    this.sessions.set(sessionId, session);

    // ... adapter initialization ...

    // IMPROVED: Auto-trigger with guards
    const AUTO_TRIGGER_ENABLED = process.env.AUTO_TRIGGER_ENABLED !== 'false';
    
    if (AUTO_TRIGGER_ENABLED && !session.autoTriggered) {
        if (this.config.agentId === 'banking' && memory) {
            const hasVerifiedUser = memory.verified && memory.userName;
            const hasIntent = memory.userIntent;
            const hasAccountDetails = memory.account && memory.sortCode;

            if (hasVerifiedUser && (hasIntent || hasAccountDetails)) {
                console.log(`[UnifiedRuntime:${this.config.agentId}] 🚀 Auto-triggering Banking agent (first time only)`);
                
                session.autoTriggered = true; // Mark as triggered
                
                const intent = memory.userIntent || 'check my balance';
                const triggerMessage = `I want to ${intent}`;

                if (this.voiceSideCar) {
                    setTimeout(() => {
                        this.voiceSideCar!.handleTextInput(sessionId, triggerMessage, true).catch(error => {
                            console.error(`[UnifiedRuntime:${this.config.agentId}] Error sending auto-trigger: ${error.message}`);
                        });
                    }, 1500); // Increased delay for safety
                }
            }
        }
    }
}
```

### Priority 2: Fix Environment Variable Consistency

**File**: `docker-compose-unified.yml`

**Changes**: Standardize on `AGENTCORE_GATEWAY_URL` everywhere

```yaml
# For all agents
environment:
  - AGENTCORE_GATEWAY_URL=${AGENTCORE_GATEWAY_URL}  # Changed from AGENTCORE_URL
  
# For local-tools (already correct)
environment:
  - AGENTCORE_GATEWAY_URL=${AGENTCORE_GATEWAY_URL}
```

**File**: `agents/src/agent-runtime-unified.ts`

**Changes**: Update to use consistent variable name

```typescript
const config: UnifiedRuntimeConfig = {
    // ... other config ...
    agentCoreUrl: process.env.AGENTCORE_GATEWAY_URL  // Changed from AGENTCORE_URL
};
```

### Priority 3: Add Session Cleanup Guards

**File**: `agents/src/agent-runtime-unified.ts`

**Changes**: Ensure complete cleanup before re-initialization

```typescript
private async initializeSession(sessionId: string, ws: WebSocket, memory?: any, traceId?: string): Promise<void> {
    console.log(`[UnifiedRuntime:${this.config.agentId}] Initializing session: ${sessionId}`);

    try {
        // If session already exists, ensure complete cleanup
        if (this.sessions.has(sessionId)) {
            console.warn(`[UnifiedRuntime:${this.config.agentId}] Session ${sessionId} already exists. Performing full cleanup...`);
            
            // Wait for cleanup to complete
            await this.handleDisconnect(sessionId);
            
            // Add small delay to ensure cleanup is complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verify session is gone
            if (this.sessions.has(sessionId)) {
                throw new Error(`Failed to cleanup existing session: ${sessionId}`);
            }
        }

        // ... rest of initialization ...
    } catch (error: any) {
        console.error(`[UnifiedRuntime:${this.config.agentId}] Failed to initialize session: ${error.message}`);
        
        // Ensure cleanup on error
        this.sessions.delete(sessionId);
        
        // Close WebSocket if still open
        if (ws.readyState === ws.OPEN) {
            ws.close(1011, 'Session initialization failed');
        }
        
        throw error;
    }
}
```

### Priority 4: Reduce Logging Noise

**File**: `agents/src/agent-runtime-unified.ts`

**Changes**: Add log level control

```typescript
// Add at top of file
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error
const DEBUG = LOG_LEVEL === 'debug';

// Update logging throughout
public handleConnection(ws: WebSocket): void {
    if (DEBUG) {
        console.log(`[UnifiedRuntime:${this.config.agentId}] New WebSocket connection`);
    }

    // ... existing code ...

    ws.on('message', async (data: Buffer) => {
        try {
            const isBinary = Buffer.isBuffer(data) && data.length > 0 && data[0] !== 0x7B;

            if (isBinary) {
                // Don't log binary audio chunks unless in debug mode
                if (DEBUG && sessionId) {
                    console.log(`[UnifiedRuntime:${this.config.agentId}] 🎤 Audio chunk: ${data.length} bytes`);
                }
                
                if (sessionId && (this.config.mode === 'voice' || this.config.mode === 'hybrid')) {
                    await this.handleMessage(sessionId, data, true);
                }
            } else {
                const message = JSON.parse(data.toString());

                // Only log important message types in production
                if (DEBUG || ['session_init', 'error', 'handoff'].includes(message.type)) {
                    console.log(`[UnifiedRuntime:${this.config.agentId}] 📨 Message: ${message.type}`);
                }

                // ... rest of message handling ...
            }
        } catch (error: any) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Error handling message: ${error.message}`);
            // ... error handling ...
        }
    });
}
```

### Priority 5: Add Error Circuit Breaker

**File**: `agents/src/agent-runtime-unified.ts`

**Changes**: Add error tracking and circuit breaker

```typescript
// Add to RuntimeSession interface
interface RuntimeSession {
    sessionId: string;
    ws: WebSocket;
    mode: 'voice' | 'text' | 'hybrid';
    startTime: number;
    memory?: any;
    traceId?: string;
    autoTriggered?: boolean;
    errorCount?: number; // NEW: Track errors
    lastError?: number;  // NEW: Timestamp of last error
}

// Add circuit breaker logic
private async handleMessage(sessionId: string, data: Buffer, isBinary: boolean): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
        console.warn(`[UnifiedRuntime:${this.config.agentId}] Message for unknown session: ${sessionId}`);
        return;
    }

    // Circuit breaker: Check error rate
    const MAX_ERRORS = 5;
    const ERROR_WINDOW_MS = 10000; // 10 seconds
    
    if (session.errorCount && session.errorCount >= MAX_ERRORS) {
        const timeSinceLastError = Date.now() - (session.lastError || 0);
        
        if (timeSinceLastError < ERROR_WINDOW_MS) {
            console.error(`[UnifiedRuntime:${this.config.agentId}] Circuit breaker: Too many errors for session ${sessionId}`);
            
            // Close session
            await this.handleDisconnect(sessionId);
            
            // Send error to client
            if (session.ws.readyState === session.ws.OPEN) {
                session.ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Session terminated due to repeated errors',
                    fatal: true
                }));
            }
            
            return;
        } else {
            // Reset error count after window expires
            session.errorCount = 0;
        }
    }

    try {
        // ... existing message handling logic ...
        
    } catch (error: any) {
        console.error(`[UnifiedRuntime:${this.config.agentId}] Error handling message: ${error.message}`);
        
        // Track error
        session.errorCount = (session.errorCount || 0) + 1;
        session.lastError = Date.now();
        
        // Send error to client
        session.ws.send(JSON.stringify({
            type: 'error',
            message: 'Error processing message',
            details: error.message,
            errorCount: session.errorCount
        }));
    }
}
```

## Environment Variable Updates

**File**: `.env`

Add these new variables:

```bash
# Agent Runtime Configuration
AUTO_TRIGGER_ENABLED=true          # Enable/disable auto-trigger for banking/IDV agents
LOG_LEVEL=info                     # debug, info, warn, error
MAX_SESSION_ERRORS=5               # Circuit breaker threshold
ERROR_WINDOW_MS=10000              # Circuit breaker time window (ms)

# Standardize AgentCore URL (remove AGENTCORE_URL if present)
AGENTCORE_GATEWAY_URL=https://agentcore-gateway-lambda-rsxfef9nbr.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp
```

## Testing Recommendations

### 1. Test Auto-Trigger Behavior
```bash
# Disable auto-trigger
export AUTO_TRIGGER_ENABLED=false
docker-compose -f docker-compose-unified.yml up agent-banking

# Enable debug logging
export LOG_LEVEL=debug
docker-compose -f docker-compose-unified.yml up agent-banking
```

### 2. Test Session Cleanup
```bash
# Monitor logs for session re-initialization
docker-compose -f docker-compose-unified.yml logs -f agent-banking | grep "Session.*already exists"
```

### 3. Test Circuit Breaker
```bash
# Send malformed messages to trigger errors
# Should see circuit breaker activate after 5 errors
```

### 4. Validate AgentCore Connection
```bash
# Check local-tools can reach AgentCore
docker-compose -f docker-compose-unified.yml exec local-tools curl -v $AGENTCORE_GATEWAY_URL
```

## Deployment Steps

1. **Update code files** (in order):
   - `agents/src/agent-runtime-unified.ts` (all Priority 1-5 changes)
   - `docker-compose-unified.yml` (Priority 2 changes)
   - `.env` (add new variables)

2. **Rebuild containers**:
   ```bash
   docker-compose -f docker-compose-unified.yml build agent-banking agent-triage
   ```

3. **Test with debug logging**:
   ```bash
   LOG_LEVEL=debug docker-compose -f docker-compose-unified.yml up agent-banking
   ```

4. **Monitor for improvements**:
   - Check log volume decreased
   - Verify no "Session already exists" warnings
   - Confirm AgentCore errors are gone
   - Test banking flow end-to-end

5. **Switch to production logging**:
   ```bash
   LOG_LEVEL=info docker-compose -f docker-compose-unified.yml up -d
   ```

## Success Criteria

- ✅ Banking agent logs show <10 lines per minute in idle state
- ✅ No "AgentCore ARN is not known" errors
- ✅ No "Session already exists" warnings
- ✅ Auto-trigger fires exactly once per session
- ✅ Circuit breaker activates on repeated errors
- ✅ Banking flow completes without hanging

## Additional Recommendations

### 1. Add Health Checks to Docker Compose
```yaml
agent-banking:
  # ... existing config ...
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8082/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

### 2. Add Resource Limits
```yaml
agent-banking:
  # ... existing config ...
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 1G
      reservations:
        cpus: '0.5'
        memory: 512M
```

### 3. Add Restart Policy
```yaml
agent-banking:
  # ... existing config ...
  restart: unless-stopped
```

## Summary

The main issues are:
1. **Auto-trigger logic** causing repeated activations
2. **Environment variable inconsistency** for AgentCore URL
3. **Session cleanup** not completing before re-initialization
4. **Excessive logging** creating noise
5. **No error boundaries** allowing broken sessions to continue

All fixes are backward compatible and can be deployed incrementally. Start with Priority 1 (auto-trigger) as it's likely causing the most visible issues.
