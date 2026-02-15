# Fix Plan - Duplicate Messages & IDV Issues

**Date**: February 15, 2026  
**Priority**: P0 - CRITICAL

## Issues to Fix

### 1. Duplicate Messages (CRITICAL)
**Symptom**: Agent sends same message 3 times
**Root Cause**: Need to investigate - likely multiple transcript events or frontend rendering issue

### 2. IDV Audio Timeout
**Symptom**: "Timed out waiting for audio bytes (59 seconds)"
**Root Cause**: IDV agent MODE=text not set in docker-compose

### 3. Blocked Handoff
**Symptom**: "Multiple handoff calls blocked: Already called transfer_to_idv"
**Root Cause**: IDV agent has transfer_to_banking tool but shouldn't use it

## Fix Steps

### Step 1: Fix IDV Agent Mode Configuration
**File**: `docker-compose-a2a.yml`
**Change**: Ensure IDV agent has `MODE=text` explicitly set

### Step 2: Remove transfer_to_banking from IDV Tools
**File**: `backend/workflows/workflow_idv-simple.json`
**Change**: Ensure only `perform_idv_check` tool is available

### Step 3: Investigate Duplicate Messages
**Actions**:
1. Check IDV agent logs for multiple transcript emissions
2. Check frontend rendering logic
3. Check gateway message forwarding
4. Add deduplication if needed

### Step 4: Test Complete Flow
**Test**: Full user journey with visual inspection
- Connect → Balance request → IDV → Credentials → Balance received
- Verify NO duplicate messages
- Verify clean handoff to banking

## Expected Outcome

- ✅ Single message per agent response
- ✅ No audio timeout errors
- ✅ Clean handoff: triage → IDV → banking
- ✅ Professional user experience

