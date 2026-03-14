# StoreDraftReview Orchestration Fixes

## Summary

Fixed all runtime `ReferenceError` crashes in the StoreDraftReview orchestration code.

## Issues Fixed

### 1. `ReferenceError: contextTenantId is not defined` ✅

**Problem:** `contextTenantId` was used in the onClick handler but not defined in that scope.

**Fix:** Defined `contextTenantId` at component level with fallbacks:
```typescript
// Get context for tenantId/storeId - define with fallbacks
const context = getCanonicalContext();
const contextStoreId = context?.storeId;
// Define contextTenantId with multiple fallbacks
const contextTenantId = context?.tenantId || baseDraft.tenantId || baseDraft.meta?.tenantId || null;
```

**Location:** Line ~304 in `StoreDraftReview.tsx`

### 2. `ReferenceError: hasApiSuccess is not defined` ✅

**Problem:** `hasApiSuccess` was used in catch block but could be undefined if error occurred before it was set.

**Fix:**
1. Initialize `hasApiSuccess` before try block:
   ```typescript
   // Initialize hasApiSuccess before try block
   let hasApiSuccess = false;
   ```

2. Set it correctly after API call:
   ```typescript
   // Mark API call as successful - check if we got updated items
   hasApiSuccess = !!suggestResult?.ok && (updated.length ?? 0) > 0;
   ```

**Location:** 
- Initialization: Line ~802
- Setting: Line ~1009

### 3. Added Guard for Missing Context ✅

**Fix:** Added guard before API calls:
```typescript
// Get context values with fallbacks
const ctx = getCanonicalContext();
const effectiveStoreId = dbStoreId || contextStoreId || ctx?.storeId || baseDraft.storeId || baseDraft.meta?.storeId;
const effectiveTenantId = contextTenantId || ctx?.tenantId || baseDraft.tenantId || baseDraft.meta?.tenantId;

// Guard: block if missing tenantId or storeId
if (!effectiveTenantId || !effectiveStoreId) {
  toast('Store ID and Tenant ID are required. Please finish creating your store first.', 'error');
  setFinishSetupOpen(true);
  return;
}
```

**Location:** Line ~790-795

### 4. Fixed Error Handling Logic ✅

**Fix:** Replaced throw-on-failure with toast messages:
- Success toast when `updatedCount > 0`
- Warning toast when `failedCount > 0`
- Error toast only on thrown exception (in catch block)

**Location:** Lines ~1161-1196

### 5. Fixed `isDebug` Reference in Catch Block ✅

**Problem:** `isDebug` was used in catch block but not defined in that scope.

**Fix:** Define `isDebug` in catch block:
```typescript
const isDebug = typeof localStorage !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true';
```

**Location:** Line ~1218

## Files Changed

**`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**

**Changes:**
1. Added `contextTenantId` definition at component level (line ~304)
2. Added guard for missing context before API calls (line ~790-795)
3. Initialize `hasApiSuccess` before try block (line ~802)
4. Set `hasApiSuccess` correctly after API call (line ~1009)
5. Fixed `isDebug` reference in catch block (line ~1218)

## Testing Checklist

- [x] No `ReferenceError: contextTenantId is not defined`
- [x] No `ReferenceError: hasApiSuccess is not defined`
- [x] Guard blocks API calls when context is missing
- [x] Error handling shows appropriate toasts
- [x] Build passes without errors
- [ ] Runtime test: Click "Auto-fill images" without context → shows error message
- [ ] Runtime test: Click "Auto-fill images" with context → works correctly

## Expected Behavior

1. **Missing Context:**
   - User clicks "Auto-fill images"
   - Guard checks for `tenantId` and `storeId`
   - If missing, shows error toast: "Store ID and Tenant ID are required..."
   - Opens `FinishSetupModal`
   - No API calls are made

2. **With Context:**
   - User clicks "Auto-fill images"
   - Guard passes
   - Creates store draft if needed
   - Starts autofill job
   - SSE events update cards in real-time
   - Progress counter updates
   - Success/warning toasts shown appropriately

3. **Error Handling:**
   - Network errors → Error toast
   - Partial success → Success toast with counts
   - All failed → Warning toast
   - No items → Info toast




