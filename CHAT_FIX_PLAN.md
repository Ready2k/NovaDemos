# Chat Interface Fix - Complete Plan

## Problem Statement
Agent receives messages but doesn't process them before WebSocket closes, resulting in no response to user.

## Root Cause
Messages are received but queued for async processing. Before processing completes, the WebSocket close event fires and triggers immediate disconnect, aborting all pending operations.

## Solution Strategy
**Hybrid Approach**: Combine immediate processing with graceful shutdown

### Part 1: Ensure Messages Are Processed (Agent Side)
- Make message handling truly async/await
- Ensure `handleMessage()` completes before moving to next message
- Add processing state tracking

### Part 2: Graceful Shutdown (Gateway Side)
- Add grace period before closing agent WebSocket
- Allow in-flight operations to complete
- Only close after timeout or completion signal

### Part 3: Connection Lifecycle Management
- Track active processing operations
- Signal when processing is complete
- Coordinate shutdown between gateway and agent

## Implementation Plan

### Step 1: Fix Agent Message Processing
**File**: `agents/src/agent-runtime-unified.ts`

**Changes**:
1. Track processing state per session
2. Ensure `handleMessage()` awaits completion
3. Add processing queue with proper async handling
4. Signal when processing is complete

### Step 2: Add Gateway Grace Period
**File**: `gateway/src/server.ts`

**Changes**:
1. Don't close agent WebSocket immediately when client closes
2. Add 10-second grace period for processing
3. Listen for completion signals from agent
4. Close early if agent signals completion

### Step 3: Add Processing State Tracking
**Both files**

**Changes**:
1. Track active operations per session
2. Send `processing_complete` message when done
3. Gateway listens for this signal

## Testing Plan

### Test 1: Simple Message Test
- Send single message
- Verify agent processes it
- Verify response received
- Verify graceful shutdown

### Test 2: Multiple Messages Test
- Send 3 messages in sequence
- Verify all processed
- Verify all responses received

### Test 3: Playwright GUI Test
- Open browser
- Connect via GUI
- Send message via chat
- Verify response appears in UI

### Test 4: IDV Flow Test
- Request balance check
- Verify IDV agent triggers
- Provide credentials
- Verify handoff to banking
- Verify balance returned

## Success Criteria
- ✅ Agent processes all received messages
- ✅ Responses sent back to client
- ✅ No premature disconnections
- ✅ Graceful shutdown after processing
- ✅ GUI chat interface functional
- ✅ IDV flow works end-to-end

## Rollback Plan
If issues occur:
1. Revert gateway changes
2. Revert agent changes
3. Rebuild containers
4. Restart services

## Estimated Time
- Implementation: 30 minutes
- Testing: 20 minutes
- Total: 50 minutes
