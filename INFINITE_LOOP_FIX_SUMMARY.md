# Infinite Loop Fix Summary

## Issues Fixed

### 1. useMenuItems Hook Infinite Loop ✅
**File**: `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMenuItems.ts`

**Problem**: 
- `refresh` was a `useCallback` that depended on `tenantId` and `storeId`
- `useEffect` depended on `refresh`, creating a loop if `refresh` was recreated

**Fix**:
- Removed `useCallback` wrapper
- Changed `useEffect` to depend directly on primitive values `[tenantId, storeId]`
- Implemented fetch logic directly in `useEffect` with cleanup

### 2. Extraction RunId Closure Issue ✅
**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/business-builder/onboarding/steps/Step4MenuImport.tsx`

**Problem**:
- `currentExtractionRunId` was state, causing closure issues in async functions
- Checking `currentExtractionRunId === runId` in async callback used stale closure value

**Fix**:
- Changed to `useRef` (`currentExtractionRunIdRef`)
- Use `ref.current` to get latest value in async callbacks
- Added `lastExtractionRunRef` guard to prevent multiple simultaneous extractions

### 3. Unstable Dependencies ✅
**File**: `Step4MenuImport.tsx`

**Problem**:
- `effectiveTenantId`, `effectiveStoreId`, `canRun`, `contextReady` were computed on every render
- Could cause unnecessary re-renders if used in dependency arrays

**Fix**:
- Wrapped all computed values in `useMemo` with stable dependencies
- `canRun` now depends only on primitives: `[effectiveTenantId, effectiveStoreId, loadingContext]`

### 4. Auto-Run Extraction Removed ✅
**File**: `Step4MenuImport.tsx`

**Problem**:
- Auto-running extraction in `useEffect` when context becomes ready could cause loops
- Calling non-memoized functions from `useEffect` is problematic

**Fix**:
- Removed auto-run feature
- When context becomes ready and `pendingAction` exists, just clear it and show toast
- User must click button again (prevents infinite loops)

### 5. Extraction Guard Added ✅
**File**: `Step4MenuImport.tsx`

**Problem**:
- Multiple clicks on "Extract Items" could trigger multiple simultaneous extractions

**Fix**:
- Added guard: `if (extracting) return;` at start of `handleExtract()`
- Prevents multiple simultaneous extractions

## Changes Made

### useMenuItems.ts
- Removed `useCallback` for `refresh`
- Changed `useEffect` to use primitive dependencies directly
- Added cleanup with `alive` flag

### Step4MenuImport.tsx
- Changed `currentExtractionRunId` from state to ref
- Added `lastExtractionRunRef` guard
- Memoized all computed values (`effectiveTenantId`, `effectiveStoreId`, `canRun`, `contextReady`)
- Removed auto-run extraction from `useEffect`
- Added extraction guard to prevent multiple simultaneous runs
- Use `ref.current` instead of state in async callbacks

## Testing

✅ No infinite loops when clicking "Extract Items"
✅ No repeated API calls in Network tab
✅ "Extracting items…" stops and results show
✅ No "Maximum update depth exceeded" errors
✅ Context loading doesn't trigger extraction loops

## Key Principles Applied

1. **Use refs for values needed in async callbacks** (not state)
2. **Memoize computed values** to prevent unnecessary re-renders
3. **Use primitive dependencies** in `useEffect` (not objects/functions)
4. **No auto-run in useEffect** unless heavily gated (prefer user-driven actions)
5. **Add guards** to prevent multiple simultaneous operations

















