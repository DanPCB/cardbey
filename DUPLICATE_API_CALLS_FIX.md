# Duplicate API Calls Fix

## Problem
Multiple duplicate API calls were being made to:
- `/api/draft-store/:id` (appearing 2-3 times in logs)
- `/api/auth/me` (appearing multiple times)

This was causing unnecessary network traffic and potential race conditions.

## Root Causes

### 1. Draft Store Loading - No Deduplication
**Location**: `BusinessOnboardingWizard.tsx` (lines 218-263)

**Issue**: The `useEffect` that loads draft data had no guards to prevent:
- Multiple simultaneous calls for the same `draftStoreId`
- Re-loading already loaded drafts
- Race conditions when `draftStoreId` or `source` changes

**Fix Applied**:
- Added `hasLoadedDraftRef` to track which `draftId` has been successfully loaded
- Added `isLoadingDraftRef` to prevent simultaneous calls
- Added early return guards before making API calls
- Reset flags appropriately on error (to allow retry)

```typescript
// Before: No guards
useEffect(() => {
  if (!draftStoreId) return;
  loadDraft(); // Could be called multiple times
}, [draftStoreId, source]);

// After: With deduplication guards
useEffect(() => {
  if (!draftStoreId) return;
  
  // Guard 1: Already loaded this draft
  if (hasLoadedDraftRef.current === draftStoreId) {
    return;
  }
  
  // Guard 2: Currently loading (prevent simultaneous calls)
  if (isLoadingDraftRef.current) {
    return;
  }
  
  isLoadingDraftRef.current = true;
  loadDraft();
  // ... rest of logic
}, [draftStoreId, source]);
```

### 2. Auth Status - Already Has Deduplication ✅
**Location**: `useAuth.ts` (lines 67-133)

**Status**: Already properly implemented with:
- In-flight request deduplication (`inFlightAuthRequest`)
- Caching with TTL (`authCache`)
- Token-based cache invalidation

**No changes needed** - this is working correctly.

## Files Modified

1. **`apps/dashboard/cardbey-marketing-dashboard/src/features/business-builder/onboarding/BusinessOnboardingWizard.tsx`**
   - Added `hasLoadedDraftRef` and `isLoadingDraftRef` refs
   - Added deduplication guards in draft loading `useEffect`
   - Proper cleanup and error handling

## Testing

To verify the fix:
1. Open browser DevTools → Network tab
2. Navigate to onboarding page with a draft ID
3. Check that `/api/draft-store/:id` appears only **once** in the network log
4. Check that `/api/auth/me` appears only **once** (or uses 304 cache)

## Expected Behavior

- **Before**: Multiple identical API calls for the same resource
- **After**: Single API call per resource, with proper caching and deduplication

## Related Issues

- Infinite loop fixes (see `INFINITE_LOOP_DIAGNOSTIC_REPORT.md`)
- Context value memoization (see `BusinessOnboardingPage.tsx`)

---

**Status**: ✅ Fixed  
**Date**: 2025-01-17
















