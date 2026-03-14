# Code Audit Report: useJobPoll.ts

## Issues Found

### 1. **Circular Dependency Risk** ⚠️
- `cleanup` is in the dependency array of the main `useEffect`
- `startPolling` depends on `cleanup`
- `startPolling` is in the dependency array of the main `useEffect`
- This could cause unnecessary re-renders or infinite loops

**Fix**: Remove `cleanup` and `startPolling` from dependencies, or use refs for stable references.

### 2. **Missing Dependency in useCallback**
- `cleanup` useCallback has no dependencies but uses `setSseConnected` (state setter - stable)
- `startPolling` depends on `cleanup`, `handleJobProgress`, `setFailed`, `timeout`
- These should be stable, but the chain creates potential issues

### 3. **Potential Memory Leak**
- `intervalRef` is used but also `pollTimerRef` - need to ensure both are cleared
- SSE event listeners might not be properly removed

### 4. **Initial Progress Not Set**
- When jobId is first set, progress should be set to 1% immediately
- Currently waits for first SSE event or poll response

## Recommended Fixes

1. **Stabilize cleanup function**: Use refs or ensure it's truly stable
2. **Remove cleanup from effect deps**: Use ref pattern instead
3. **Set initial progress**: Call `updateProgress(0.01, null)` when jobId is first set
4. **Ensure proper cleanup**: Make sure all timers and connections are cleared

## Status

✅ No TypeScript errors
✅ No linting errors  
⚠️ Potential runtime issues with dependency cycles
⚠️ Progress might not update immediately on jobId change
