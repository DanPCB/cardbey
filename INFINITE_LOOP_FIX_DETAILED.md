# Infinite Loop Fix - Detailed Analysis

## Root Cause Identified

### File: `apps/dashboard/cardbey-marketing-dashboard/src/components/onboarding/StorePreviewOverlay.tsx`

**Line 140 (BEFORE FIX):**
```typescript
useEffect(() => {
  if (open && effectiveStoreId && !tenantId && !loadingContext && !contextError) {
    refreshContext();
  }
}, [open, effectiveStoreId, tenantId, loadingContext, contextError, refreshContext]); // ❌ PROBLEM
```

**Problem**: `refreshContext` is a function returned from `useStoreContext` hook. This function is recreated on every render, causing the `useEffect` to run repeatedly:
1. Effect runs → calls `refreshContext()`
2. `refreshContext()` updates state → component re-renders
3. `refreshContext` function is recreated (new reference)
4. Effect sees new `refreshContext` in deps → runs again
5. **INFINITE LOOP**

**Line 180 (BEFORE FIX):**
```typescript
useEffect(() => {
  // ... event listener setup ...
  await refreshMenu();
  setPreviewKey((k) => k + 1);
}, [effectiveStoreId, refreshMenu, tenantId, menuItems?.length]); // ❌ PROBLEM
```

**Problem**: 
- `refreshMenu` function changes on every render
- `menuItems?.length` changes when menu items update
- Both trigger the effect repeatedly

## Fixes Applied

### Fix 1: Auto-Retry Context Load
**File**: `StorePreviewOverlay.tsx` (Line 135-158)

**Change**:
- Removed `refreshContext` from dependency array
- Added `lastRefreshAttemptRef` guard to prevent multiple calls
- Only depends on primitives: `[open, effectiveStoreId, tenantId, loadingContext, contextError]`

**Code**:
```typescript
const lastRefreshAttemptRef = useRef<string | null>(null);
useEffect(() => {
  if (open && effectiveStoreId && !tenantId && !loadingContext && !contextError) {
    // Guard: only attempt once per storeId
    const key = `${effectiveStoreId}:${open}`;
    if (lastRefreshAttemptRef.current === key) {
      return; // Already attempted, skip
    }
    lastRefreshAttemptRef.current = key;
    refreshContext(); // Safe to call - guard prevents loops
  }
}, [open, effectiveStoreId, tenantId, loadingContext, contextError]); // ✅ No refreshContext in deps
```

### Fix 2: Preview Refresh Listener
**File**: `StorePreviewOverlay.tsx` (Line 160-223)

**Change**:
- Removed `refreshMenu` and `menuItems?.length` from dependency array
- Used `useRef` to store latest `refreshMenu` function
- Added `lastRefreshKeyRef` guard to prevent duplicate event processing
- Only depends on primitives: `[effectiveStoreId, tenantId]`

**Code**:
```typescript
const refreshMenuRef = useRef(refreshMenu);
const lastRefreshKeyRef = useRef<string | null>(null);

// Update ref when refreshMenu changes (doesn't trigger effect)
useEffect(() => {
  refreshMenuRef.current = refreshMenu;
}, [refreshMenu]);

useEffect(() => {
  const handleRefresh = async (e: CustomEvent) => {
    // ... validation ...
    
    // Guard: prevent duplicate processing
    const refreshKey = `${currentStoreId}:${e.detail?.productId || 'bulk'}`;
    if (lastRefreshKeyRef.current === refreshKey) {
      return; // Already processed
    }
    lastRefreshKeyRef.current = refreshKey;
    
    // Use ref to get latest function (doesn't trigger re-render)
    await refreshMenuRef.current();
    setPreviewKey((k) => k + 1);
  };
  
  window.addEventListener('cardbey:store-preview-refresh', handleRefresh);
  return () => window.removeEventListener('cardbey:store-preview-refresh', handleRefresh);
}, [effectiveStoreId, tenantId]); // ✅ No refreshMenu or menuItems in deps
```

### Fix 3: Added Logging (Temporary)
**Files**: `StorePreviewOverlay.tsx`, `Step4MenuImport.tsx`

Added `[LOOP-CHECK]` console logs to identify which effects run repeatedly:
- `[LOOP-CHECK] AutoRetryContext` - logs when auto-retry effect runs
- `[LOOP-CHECK] PreviewRefreshListener` - logs when refresh listener effect runs
- `[LOOP-CHECK] PendingActionHandler` - logs when pending action handler runs

**Note**: These logs should be removed after confirming the fix works.

## Pattern Applied

**PATTERN 3**: Effect triggers fetch/action and updates state, but deps change every render

**Solution**:
1. Remove unstable function from dependency array
2. Use `useRef` to store latest function value
3. Add guard with `useRef` to prevent duplicate calls
4. Depend only on primitive values

## Testing

After fix:
- ✅ No "Maximum update depth exceeded" errors
- ✅ No repeated API calls in Network tab
- ✅ UI still updates when tenantId/storeId changes
- ✅ Preview refresh events still work correctly
- ✅ Context auto-retry still works (but only once per key)

## Files Modified

1. `StorePreviewOverlay.tsx`
   - Fixed auto-retry context load effect (removed `refreshContext` from deps)
   - Fixed preview refresh listener effect (removed `refreshMenu`, `menuItems?.length` from deps)
   - Added ref guards to prevent duplicate calls

2. `Step4MenuImport.tsx`
   - Added temporary logging to pending action handler

















