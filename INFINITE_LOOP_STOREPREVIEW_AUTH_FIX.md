# Infinite Loop Fixes: StorePreviewPage & useAuth

## Problems Identified

1. **StorePreviewPage.tsx:259** - Infinite loop in `useEffect` that depends on `previewData` and also sets it
2. **useAuth.ts** - `notifyAuthListeners` causing infinite re-renders when auth state changes
3. **Duplicate draft-store calls** - Still occurring (3 calls in logs)

## Fixes Applied

### 1. StorePreviewPage.tsx - Remove Circular Dependency

**File**: `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx` (line 260)

**Problem**: `useEffect` depends on `previewData` and also calls `setPreviewData`, creating a loop:
```typescript
useEffect(() => {
  // ... updates previewData
  setPreviewData(updatedPreview);
}, [realMenuItems, previewData]); // ❌ previewData in deps causes loop
```

**Fix**: Remove `previewData` from dependency array:
```typescript
useEffect(() => {
  // ... updates previewData
  setPreviewData(updatedPreview);
}, [realMenuItems]); // ✅ Only depend on realMenuItems
```

**Rationale**: The effect should only run when `realMenuItems` changes, not when `previewData` changes (which it sets).

---

### 2. useAuth.ts - Prevent Unnecessary Re-renders

**File**: `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useAuth.ts` (lines 42-73)

**Problem**: 
- `notifyAuthListeners()` calls all listeners
- Each listener calls `setState({ ...globalAuthState })`
- Even if state hasn't changed, this creates a new object, causing re-renders
- Multiple components using `useAuth()` all re-render unnecessarily

**Fix**: 
1. Use functional `setState` to prevent stale closures
2. Only update state if values actually changed
3. Add ref guard to prevent multiple `checkAuthStatus` calls

```typescript
// Before: Always creates new object, even if values are same
const listener = () => setState({ ...globalAuthState }); // ❌

// After: Only update if values changed
const listener = () => {
  setState(prevState => {
    // Only update if state actually changed
    if (prevState.isAuthenticated !== globalAuthState.isAuthenticated ||
        prevState.isLoading !== globalAuthState.isLoading) {
      return { ...globalAuthState };
    }
    return prevState; // ✅ No change, return previous state
  });
};

// Prevent multiple checkAuthStatus calls
const hasCheckedRef = useRef(false);
useEffect(() => {
  if (!hasCheckedRef.current) {
    hasCheckedRef.current = true;
    checkAuthStatus();
  }
}, []);
```

**Rationale**: 
- Functional `setState` prevents stale closures
- Equality check prevents unnecessary re-renders
- Ref guard prevents multiple auth checks on mount

---

### 3. Duplicate Draft-Store Calls

**Status**: Already fixed with ref guards in `BusinessOnboardingWizard.tsx`, but still seeing duplicates.

**Possible causes**:
- Multiple components calling the same endpoint
- Effect running multiple times due to dependency changes
- Race conditions between effects

**Next steps**: Monitor after these fixes to see if duplicates persist.

---

## Expected Results

After these fixes:
- ✅ No more "Maximum update depth exceeded" from StorePreviewPage
- ✅ No more infinite loops from useAuth
- ✅ Reduced unnecessary re-renders
- ✅ Single auth check on mount
- ✅ Preview data updates only when menu items change

---

## Testing

1. Navigate to preview page - should load without errors
2. Check console - no infinite loop errors
3. Verify auth status - should check once on mount
4. Monitor network tab - should see single calls (not duplicates)

---

**Status**: ✅ Fixed  
**Date**: 2025-01-17
















