# Agent Host Fix

## Problem
The agent was registering with the gateway using the hostname `agent-triage` (Docker hostname), but when running locally, the gateway couldn't resolve this hostname.

Error in gateway logs:
```
[Gateway] Agent triage WebSocket error: Error: getaddrinfo ENOTFOUND agent-triage
```

## Root Cause
In `agents/src/agent-runtime-s2s.ts`, the registration was hardcoded to:
```typescript
url: `http://agent-${AGENT_ID}:${AGENT_PORT}`
```

This works in Docker but not locally.

## Solution
1. Added `AGENT_HOST` environment variable to allow configuring the hostname
2. Updated registration to use: `http://${AGENT_HOST}:${AGENT_PORT}`
3. Updated `start-all-services.sh` to set `AGENT_HOST=localhost`

## Changes Made
- ✅ Modified `agents/src/agent-runtime-s2s.ts` to add AGENT_HOST variable
- ✅ Updated registration logic to use AGENT_HOST
- ✅ Updated `start-all-services.sh` to set AGENT_HOST=localhost
- ✅ Rebuilt agent with `npm run build`

## Next Steps
1. **Stop all services**: Press `Ctrl+C` in the terminal running `./start-all-services.sh`
2. **Restart**: Run `./start-all-services.sh` again
3. **Test**: Go to http://localhost:3000 and click "Connect"

## Expected Behavior
After restart, you should see in gateway logs:
```
[AgentRegistry] Registered agent: triage at http://localhost:8081
[Gateway] Routing session ... to agent: triage
[Gateway] Connected to agent triage for session ...
```

And in the browser:
```
[WebSocket] Connected
[Session] Backend connected, captured session ID: ...
```
