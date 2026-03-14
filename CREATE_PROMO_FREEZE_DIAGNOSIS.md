# Create Promo Freeze Diagnosis

**Date:** 2026-01-XX  
**Purpose:** Diagnose why "Create Promo" button freezes after applying auth

---

## Root Cause Analysis

### Issue Location
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
- **Function:** `handleCreatePromotion` (line 2172)
- **Problem Line:** Line 2254 - `const isAuthed = await requireAuth('create_promo');`

### Root Cause

**The `requireAuth` function is waiting for `auth:success` or `auth:cancel` window events that may not be dispatched correctly.**

**Evidence:**
1. `requireAuth` (line 29-71 in `requireAuth.ts`) creates a Promise that waits for:
   - `window.addEventListener('auth:success', handleAuthSuccess)`
   - `window.addEventListener('auth:cancel', handleAuthCancel)`

2. These events are dispatched from `GatekeeperProvider.tsx`:
   - Line 63: `window.dispatchEvent(new CustomEvent('auth:success', ...))`
   - Line 95: `window.dispatchEvent(new CustomEvent('auth:cancel'))`
   - Line 104: `window.dispatchEvent(new CustomEvent('auth:success', ...))`

3. **Problem:** The events are dispatched from `GatekeeperProvider`, but `requireAuth` may be called before the provider is mounted, or the events may not match the expected format.

4. **Additional Issue:** The `requireAuth` function has a 30-second timeout, but if the event never fires, the promise hangs until timeout, leaving the button in a loading state.

### Secondary Issues

1. **Loading State Not Cleared:** If `requireAuth` hangs, `setIsCreatingPromo(false)` in the `finally` block may not execute immediately, leaving the button disabled.

2. **Event Mismatch:** `requireAuth` listens for `auth:success`/`auth:cancel`, but `useGatekeeper` uses promise resolvers. These two systems may not be synchronized.

3. **No Error Handling:** If `requireAuth` throws an error (instead of returning false), the catch block handles it, but the loading state might not be cleared properly.

---

## Fix Strategy

### Option 1: Use `runWithAuth` Instead (Recommended)

Replace `requireAuth` with `runWithAuth` which uses the `gateAction` system that's properly integrated with `useGatekeeper`.

**Changes:**
- Replace `requireAuth('create_promo')` with `runWithAuth(() => { ... }, { actionName: 'create_promo', requirePremium: true })`
- This ensures proper integration with the gatekeeper system

### Option 2: Fix `requireAuth` Event System

Ensure `requireAuth` properly integrates with `GatekeeperProvider`:
- Make sure `GatekeeperProvider` is mounted
- Ensure events are dispatched correctly
- Add better error handling

### Option 3: Use `gateAction` Directly

Use `gateAction` from `authGate.ts` which properly integrates with `useGatekeeper`:
- `const result = await gateAction({ action: 'create_promo', requirePremium: true })`
- Check `result.ok` and proceed if true

---

## Recommended Fix

**Use `runWithAuth` helper** which is already designed for this use case and properly integrates with the gatekeeper system.

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Change:**
```typescript
// OLD (line 2254):
const isAuthed = await requireAuth('create_promo');
if (!isAuthed) {
  return;
}

// NEW:
await runWithAuth(
  async () => {
    // All the promo creation logic here
  },
  {
    actionName: 'create_promo',
    requirePremium: true,
    context: { productId, storeId, draftId },
    onSuccess: () => {
      // Success callback
    },
    onError: (error) => {
      toast(error.message || 'Failed to create promotion', 'error');
    },
  }
);
```

This ensures:
- ✅ Proper integration with gatekeeper
- ✅ Loading state always cleared
- ✅ Pending action stored for resume after auth
- ✅ No hanging promises
- ✅ Clear error messages

---

## Verification Steps

After fix:
1. ✅ Click "Create Promo" as guest → Auth modal opens
2. ✅ Close modal → Button becomes clickable again (loading cleared)
3. ✅ Login → Create Promo flow continues automatically
4. ✅ Check console for `[AUTH_GATE]` and `[CONTINUE_GUARD]` logs
5. ✅ Verify `window.__createPromoDebug` shows correct status

---

**Diagnosed By:** AI Assistant  
**Date:** 2026-01-XX

