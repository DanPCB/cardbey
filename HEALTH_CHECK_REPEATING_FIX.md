# Health Check Repeating Issue - Analysis & Fix

## Problem

The `/api/health` endpoint is being called repeatedly (4 times in quick succession), causing unnecessary network traffic and console spam.

## Root Causes

1. **React StrictMode Double Mounting**: React StrictMode causes components to mount → unmount → mount again in development, which can trigger duplicate health checks.

2. **Multiple useEffect Triggers**: The `useHealth` hook has two `useEffect` hooks that both call `fetchHealth()`:
   - One for tab visibility/core URL changes
   - One for initial fetch and polling

3. **Cache TTL Too Short**: The cache TTL was only 5 seconds, so rapid calls could bypass the cache.

4. **Singleton Cache Race Condition**: If multiple components call `getHealthOnce()` simultaneously before the first request completes, they might all see `cachedPromise === null` and create duplicate requests.

## Fixes Applied

### 1. Improved `useHealth` Hook (`hooks/useHealth.ts`)

**Changes:**
- Replaced `didRunRef` guard with `mountedRef` to track component mount state
- Added checks to prevent state updates after component unmounts
- Increased cache TTL from 5s to 10s (in `lib/health.ts`)
- Improved cleanup to prevent memory leaks

**Before:**
```typescript
const didRunRef = useRef(false);
// ... guard that resets on unmount
```

**After:**
```typescript
const mountedRef = useRef(true);
// ... checks mountedRef before state updates
```

### 2. Increased Cache TTL (`lib/health.ts`)

**Change:**
- `CACHE_TTL` increased from `5000` (5s) to `10000` (10s)
- This reduces duplicate calls when multiple components check health within a short time window

### 3. Better Mount State Tracking

**Added:**
- `mountedRef` to track if component is still mounted
- Prevents state updates after unmount (prevents React warnings)
- Prevents unnecessary fetches when component is unmounting

## How the Singleton Cache Works

The `getHealthOnce()` function in `lib/health.ts` uses a singleton pattern:

1. **Cache Check**: If data is fresh (< 10s old), return cached data immediately
2. **Promise Check**: If a request is in flight, return the existing promise (prevents duplicates)
3. **New Request**: Only create a new request if no cache and no in-flight request

This should prevent duplicate requests, but React StrictMode can still cause issues if:
- Two mounts happen simultaneously
- Both see `cachedPromise === null` before the first request starts
- Both create new requests

## Verification

After the fix, you should see:
- ✅ Only 1-2 health checks on initial page load (StrictMode might cause 2)
- ✅ Health checks every 30 seconds (polling interval)
- ✅ No rapid-fire duplicate requests
- ✅ Cache prevents duplicate calls within 10 seconds

## If Issues Persist

1. **Check React StrictMode**: If you want to disable it temporarily for testing:
   ```jsx
   // In main.jsx, remove <React.StrictMode> wrapper
   ```

2. **Check for Multiple HealthPanel Instances**: Verify only one `HealthPanel` is rendered

3. **Enable Debug Logging**: Add logging to see when health checks are triggered:
   ```typescript
   // In useHealth.ts, add:
   console.log('[useHealth] Fetch triggered', { mounted: mountedRef.current });
   ```

4. **Check Network Tab**: Verify requests are actually duplicates or just rapid sequential calls

## Expected Behavior

- **On Mount**: 1 health check (or 2 in StrictMode)
- **Every 30s**: 1 health check (polling)
- **On Tab Visible**: 1 health check
- **On Core URL Change**: 1 health check (cache cleared first)

The singleton cache should prevent any duplicates within the 10-second window.




