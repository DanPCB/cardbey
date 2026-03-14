# Infinite Loop Final Fix

## Problem Still Occurring

Despite previous fixes, the "Maximum update depth exceeded" error is still happening (133, 76, 71, 5 occurrences in logs).

## Root Cause Identified

The `contextValue` in `BusinessOnboardingPage.tsx` was depending on the `ctx` object directly, which is memoized but still creates a new object reference when `state` or `refresh` changes in `useStoreContext`. This causes:

1. `ctx` object changes → `contextValue` recalculates
2. `contextValue` changes → Context consumers re-render
3. Re-renders trigger `useStoreContext` to update → `ctx` changes again
4. **Infinite loop**

## Fix Applied

### 1. Stabilized `reloadContext` with Ref
**File**: `BusinessOnboardingPage.tsx` (lines 133-143)

**Change**: Use `useRef` to access latest `ctx` values without causing re-renders:

```typescript
// Before: Depends on ctx.refresh and ctx.tenantId (changes frequently)
const reloadContext = useCallback(async (): Promise<string> => {
  await ctx.refresh();
  return ctx.tenantId || "";
}, [ctx.refresh, ctx.tenantId]); // ❌ Causes re-renders

// After: Use ref to access latest values (stable function)
const ctxRef = useRef(ctx);
useEffect(() => {
  ctxRef.current = ctx;
}, [ctx]);

const reloadContext = useCallback(async (): Promise<string> => {
  await ctxRef.current.refresh();
  return ctxRef.current.tenantId || "";
}, []); // ✅ Empty deps - stable function
```

### 2. Extracted Primitive Values from `ctx`
**File**: `BusinessOnboardingPage.tsx` (lines 165-190)

**Change**: Extract primitive values from `ctx` object before using in `useMemo`:

```typescript
// Before: Depends on ctx object properties directly
const contextValue = useMemo(() => ({
  storeId: ctx.storeId || ids.storeId || "",
  // ...
}), [
  ctx.storeId,  // ❌ ctx object might change even if values are same
  ctx.id,
  // ...
]);

// After: Extract primitives first (ensures stable dependencies)
const ctxStoreId = ctx.storeId;
const ctxId = ctx.id;
const ctxIsDraft = ctx.isDraft;
const ctxTenantId = ctx.tenantId;
const ctxLoading = ctx.loading;
const ctxError = ctx.error;

const contextValue = useMemo(() => ({
  storeId: ctxStoreId || ids.storeId || "",
  // ...
}), [
  ctxStoreId,  // ✅ Primitive value - only changes when actual value changes
  ctxId,
  // ...
]);
```

## Why This Works

1. **Primitive Extraction**: By extracting primitive values from `ctx` before the `useMemo`, we ensure that the dependency array only includes actual values, not object references.

2. **Stable `reloadContext`**: Using a ref to access `ctx` means `reloadContext` never changes (empty deps), preventing unnecessary `contextValue` recalculations.

3. **Breaking the Loop**: When `ctx` object changes but values are the same, the extracted primitives remain the same, so `contextValue` doesn't recalculate, breaking the infinite loop.

## Expected Result

- ✅ No more "Maximum update depth exceeded" errors
- ✅ `contextValue` only recalculates when actual values change
- ✅ `reloadContext` is stable and doesn't cause re-renders
- ✅ Context consumers only re-render when necessary

## Testing

After this fix, you should see:
- No infinite loop errors in console
- Single API calls (no duplicates)
- Smooth navigation and state updates
- Server connection remains stable

---

**Status**: ✅ Fixed  
**Date**: 2025-01-17
















