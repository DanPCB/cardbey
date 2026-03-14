# useStoreContext Infinite Loop Fix

## Root Cause

**File**: `apps/dashboard/cardbey-marketing-dashboard/src/lib/useStoreContext.ts`

**Line 172 (BEFORE FIX)**:
```typescript
const refresh = useCallback(async () => {
  // ... refresh logic ...
}, [id, options]); // ❌ PROBLEM: options is an object recreated every render

useEffect(() => {
  refresh();
}, [refresh]); // ❌ PROBLEM: refresh changes when options changes
```

**The Loop**:
1. Component renders with `options = { skipDraftFallback: true }` (new object)
2. `refresh` is recreated (new function reference)
3. `useEffect` sees new `refresh` → runs → calls `refresh()`
4. `refresh()` calls `setState()` → component re-renders
5. New render creates new `options` object → `refresh` recreated → **LOOP**

## Fixes Applied

### 1. Extract Primitive from Options Object
**Line 52-53**:
```typescript
// Extract primitive from options to prevent object identity issues
const skipDraftFallback = options?.skipDraftFallback ?? false;
```

### 2. Make refresh Stable with Primitive Dependencies
**Line 94-233**:
```typescript
const refresh = useCallback(async (force: boolean = false) => {
  // ... refresh logic ...
}, [id, skipDraftFallback, setStateIfChanged]); // ✅ Depend on primitives only
```

### 3. Add Guards to Prevent Repeated Calls
**Line 68-70, 113-130**:
```typescript
// Guards to prevent infinite loops and repeated calls
const inFlightRef = useRef(false);
const lastKeyRef = useRef<string>("");

// Inside refresh:
const key = `${id}:${skipDraftFallback ? 1 : 0}`;
if (inFlightRef.current && !force) return; // Prevent simultaneous calls
if (lastKeyRef.current === key && !force) return; // Prevent duplicate calls for same key
inFlightRef.current = true;
lastKeyRef.current = key;
// ... fetch logic ...
finally {
  inFlightRef.current = false; // Always clear
}
```

### 4. Prevent Unnecessary setState Updates
**Line 72-92**:
```typescript
// Helper to check if state actually changed (prevent unnecessary updates)
const setStateIfChanged = useCallback((next: StoreContextState) => {
  setState((prev) => {
    // Shallow equality check - only update if values changed
    if (prev.ready === next.ready && prev.loading === next.loading && /* ... */) {
      return prev; // No change, return previous state
    }
    return next; // Changed, update state
  });
}, []);
```

### 5. Fix useEffect to Depend on Primitives Only
**Line 235-259**:
```typescript
// Auto-refresh when id or skipDraftFallback changes
// FIX: Depend on primitives only, not refresh function (prevents infinite loops)
useEffect(() => {
  if (!id) {
    // Clear state if id is removed
    setStateIfChanged(emptyState);
    return;
  }
  
  // Only refresh if id is valid (refresh is stable, safe to call)
  refresh(false); // false = don't force (respects guards)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [id, skipDraftFallback]); // ✅ Depend ONLY on primitives
```

### 6. Add Dev-Only Logging
**Line 116-134**:
```typescript
if (import.meta.env.DEV) {
  console.log("[useStoreContext] refresh", { key, force });
  // ... other debug logs ...
}
```

## Pattern Applied

**Case 2**: deps include unstable objects

**Before**:
```typescript
useEffect(() => { refresh() }, [refresh]) // refresh depends on options object
```

**After**:
```typescript
const skipDraftFallback = options?.skipDraftFallback ?? false; // Extract primitive
useEffect(() => { refresh() }, [id, skipDraftFallback]) // Depend on primitives
```

## Testing

After fix:
- ✅ No "Maximum update depth exceeded" errors
- ✅ Only 1 API request per id change
- ✅ Preview overlay and builder can both use useStoreContext without loops
- ✅ Manual refresh still works (via `refresh(true)` to force)
- ✅ Guards prevent duplicate calls
- ✅ State updates only when values actually change

## Key Changes Summary

1. **Extracted primitive** from `options` object → `skipDraftFallback`
2. **Made refresh stable** → depends only on `[id, skipDraftFallback, setStateIfChanged]`
3. **Added guards** → `inFlightRef` and `lastKeyRef` prevent duplicate calls
4. **Prevented unnecessary updates** → `setStateIfChanged` with shallow equality check
5. **Fixed useEffect deps** → depends on `[id, skipDraftFallback]` only (primitives)
6. **Added dev logging** → helps identify if refresh is called repeatedly

















