# WebSocket Connection Fix

## Problem
Frontend was trying to connect to `ws://localhost:3000/sonic` but the WebSocket server is actually running on the gateway at `ws://localhost:8080/sonic`.

## Root Cause
The frontend code in `frontend-v2/app/page.tsx` was using `window.location.host` to construct the WebSocket URL, which meant it was using the frontend's port (3000) instead of the gateway's port (8080).

## Solution
Created `frontend-v2/.env.local` with:
```
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

This tells the frontend to connect to the correct WebSocket endpoint.

## How to Apply
1. **Stop all services**: Press `Ctrl+C` in the terminal running `./start-all-services.sh`
2. **Restart**: Run `./start-all-services.sh` again
3. **Test**: Go to http://localhost:3000 and click "Connect"

## Verification
After restarting, you should see:
- Browser console: `[WebSocket] Connecting to ws://localhost:8080/sonic`
- Gateway logs: Connection accepted messages
- Frontend: Connection status changes to "Connected"

## Service Ports
- Frontend: http://localhost:3000
- Gateway: http://localhost:8080
- WebSocket: ws://localhost:8080/sonic
- Agent: http://localhost:8081
- Redis: localhost:6379
