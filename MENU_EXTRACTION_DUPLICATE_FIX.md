# Menu Extraction Duplicate Calls Fix

## Problem

The menu extraction endpoint `/api/menu/extract-items` is being called multiple times, causing:
- Multiple normalization logs: `[MENU] Normalizing item URLs` (9+ times for same item)
- New cropped images created each time (different timestamps in URLs)
- Unnecessary backend processing
- Potential race conditions

## Root Cause

The `handleExtract` function relies on the `extracting` state to prevent duplicate calls, but there's a race condition:
1. User clicks "Extract Items" button
2. `handleExtract()` is called
3. Check `if (extracting)` - might be false (state not updated yet)
4. `setExtracting(true)` is called (async state update)
5. User clicks again before state updates → second call goes through
6. Multiple API calls are made

## Fix Applied

### 1. Added Ref Guard for Immediate Protection

**File**: `Step4MenuImport.tsx`

**Change**: Added `isExtractingRef` to provide immediate, synchronous protection:

```typescript
// Before: Only state-based guard (async, can have race conditions)
if (extracting) {
  return; // ❌ State might not be updated yet
}

// After: Ref guard + state guard (immediate + state)
const isExtractingRef = useRef<boolean>(false);

if (extracting || isExtractingRef.current) {
  return; // ✅ Immediate check, no race condition
}

// Set ref IMMEDIATELY (synchronous)
isExtractingRef.current = true;
setExtracting(true); // Also set state for UI
```

### 2. Clear Ref Guard in Finally Block

**Change**: Ensure ref is cleared even if extraction fails or is cancelled:

```typescript
finally {
  if (currentExtractionRunIdRef.current === runId) {
    setExtracting(false);
    isExtractingRef.current = false; // ✅ Clear ref
  } else {
    // Even if runId doesn't match, clear ref to prevent stuck state
    isExtractingRef.current = false;
  }
}
```

### 3. Reduced Backend Logging Noise

**File**: `menuRoutes.js` (line 447)

**Change**: Made normalization logging conditional (only in debug mode):

```typescript
// Before: Always logs (causes console spam)
console.log('[MENU] Normalizing item URLs:', { ... });

// After: Only logs in debug mode
if (process.env.NODE_ENV === 'development' && process.env.DEBUG_MENU_NORMALIZATION === 'true') {
  console.log('[MENU] Normalizing item URLs:', { ... });
}
```

## Why This Works

1. **Ref Guard**: `useRef` provides synchronous, immediate protection that doesn't depend on React's state update cycle
2. **Double Protection**: Both ref and state guards ensure no calls slip through
3. **Immediate Setting**: Setting `isExtractingRef.current = true` happens synchronously, before any async operations
4. **Proper Cleanup**: Ref is cleared in `finally` block to prevent stuck state

## Expected Results

- ✅ Single extraction call per button click
- ✅ No duplicate normalization logs
- ✅ No duplicate image crops
- ✅ Reduced console noise (normalization logs only in debug mode)

## Testing

1. Click "Extract Items" button once
2. Check network tab - should see **one** call to `/api/menu/extract-items`
3. Check console - should see normalization logs only if `DEBUG_MENU_NORMALIZATION=true`
4. Try rapid clicking - should still only make one call

---

**Status**: ✅ Fixed  
**Date**: 2025-01-17
















