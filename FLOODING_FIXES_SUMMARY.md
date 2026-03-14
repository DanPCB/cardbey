# Backend Flooding Fixes Summary

## Issues Identified

### 1. **Duplicate `runJob` Execution**
**Problem**: When `/api/mi/orchestra/start` is called:
- Backend auto-triggers `runJob` asynchronously (line 3384 in `miRoutes.js`)
- Frontend ALSO calls `/api/mi/orchestra/job/:id/run` explicitly (line 720 in `quickStart.ts`)
- This causes duplicate execution attempts, even though `/run` endpoint checks for RUNNING status

**Fix**: Added concurrent execution guard in `runJob()`:
- In-memory `runningJobs` Map tracks active executions
- If job is already running, return existing promise instead of starting new execution
- Always clean up from map in `finally` block

### 2. **Duplicate SSE Broadcasts**
**Problem**: 
- `/start` endpoint calls `broadcastSse` twice (lines 3376-3377) for `orchestra_job_progress`
- `emitJobEvent` also broadcasts to both keys
- This causes duplicate progress events

**Fix**: 
- Replaced direct `broadcastSse` calls in `/start` with `emitJobEvent` (which has dedupe + throttle)
- `emitJobEvent` now has dedupe (skip if payload unchanged) and throttle (300ms minimum interval)
- Terminal events (FAILED/COMPLETED/BLOCKED) always emit immediately (no throttle)

### 3. **No Guard Against Concurrent Execution**
**Problem**: Multiple `runJob` calls can run simultaneously for the same job

**Fix**: Added `runningJobs` Map to track active executions:
```javascript
const runningJobs = new Map(); // Key: jobId, Value: Promise<result>

if (runningJobs.has(jobId)) {
  return runningJobs.get(jobId); // Return existing promise
}

const executionPromise = (async () => {
  // ... execution logic ...
  finally {
    runningJobs.delete(jobId); // Always cleanup
  }
})();

runningJobs.set(jobId, executionPromise);
return executionPromise;
```

## Files Changed

1. **`apps/core/cardbey-core/src/services/orchestra/stageRunner.js`**
   - Added `runningJobs` Map for concurrent execution guard
   - Wrapped `runJob` body in async IIFE to track promise
   - Added cleanup in `finally` block

2. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Replaced direct `broadcastSse` calls with `emitJobEvent` (uses dedupe + throttle)

## Testing

To verify fixes work:
1. Create a store via QuickStart
2. Check backend logs - should see:
   - Only ONE `runJob started` log per job
   - `Job already running, returning existing promise` if duplicate call attempted
   - No duplicate `orchestra_job_progress` events (throttled/deduped)
3. Network tab should show:
   - Only ONE `/api/mi/orchestra/job/:id/run` call (or it returns 202 "already running")
   - No duplicate SSE events

## Expected Behavior

- **Before**: Multiple `runJob` calls → duplicate execution attempts → flooding
- **After**: First `runJob` call executes, subsequent calls return existing promise → no flooding

- **Before**: Multiple SSE broadcasts → duplicate progress events → flooding
- **After**: Dedupe + throttle prevents duplicate events → clean logs




