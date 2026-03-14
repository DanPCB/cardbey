# Fix Plan: Two ReferenceErrors

## Issue 1: Frontend - `pollingStatus is not defined`

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Root Cause:**
- `pollingStatus` state was removed when migrating to `usePoller` hook
- But 4 references remain:
  - Line 1870: `if (pollingStatus && !pollingStatus.isPolling && pollingStatus.attempts >= pollingStatus.maxAttempts)`
  - Line 2000: `if (loading || (pollingStatus && pollingStatus.isPolling))`
  - Line 2006: `{pollingStatus && pollingStatus.isPolling`
  - Line 2007: `? \`Preparing your store... (${pollingStatus.attempts}/${pollingStatus.maxAttempts})\``

**Also Found:**
- Leftover refs: `pollingIntervalRef`, `pollingAttemptsRef` (lines 281-286, 1309-1311, 1884, 1903-1905)
- These are no longer needed with `usePoller`

**Fix Strategy:**
1. Remove all `pollingStatus` references
2. Remove leftover `pollingIntervalRef` and `pollingAttemptsRef` cleanup code
3. Simplify loading UI (just check `loading` state)
4. Remove the "max attempts reached" UI block (lines 1869-1900) - `usePoller` handles this internally

**Minimal Diff:**
- Delete lines 1869-1900 (max attempts UI block)
- Change line 2000: `if (loading || (pollingStatus && pollingStatus.isPolling))` → `if (loading)`
- Change lines 2006-2007: Remove conditional, just show "Loading store..."
- Remove `pollingIntervalRef` and `pollingAttemptsRef` cleanup code

---

## Issue 2: Backend - `catalogOutput is not defined`

**Location:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Root Cause:**
- `catalogOutput` is declared inside `try` block at line 1792
- `try` block ends at line 2604 with `catch`
- `catalogOutput` is referenced at line 2669 (outside the try block)
- Variable is out of scope

**Code Structure:**
```javascript
try {
  let catalogOutput = null;  // Line 1792 - inside try
  // ... code that may set catalogOutput ...
} catch (syncError) {
  // Line 2601-2604
}

// Line 2669 - OUTSIDE try block, catalogOutput is undefined here
if (!catalogOutput || productsWritten === 0) {
```

**Fix Strategy:**
1. Move `catalogOutput` declaration to outer scope (before try block)
2. Ensure it's initialized to `null`
3. Keep all assignments inside try block (they'll update the outer variable)

**Minimal Diff:**
- Move `let catalogOutput = null;` from line 1792 to line 1790 (before try block)
- Keep `let foundStageName = null;` inside try (or move it too for consistency)

---

## Additional Risks

### Compilation/Runtime Risks:

1. **TypeScript/ESLint**: No type errors expected (both are JS files)
2. **Missing Imports**: None - both issues are scope/variable issues
3. **Logic Changes**: 
   - Frontend: Removing polling status UI is safe (usePoller handles it)
   - Backend: Moving variable declaration is safe (same logic, just different scope)
4. **Backwards Compatibility**: 
   - Frontend: Safe - removing unused state
   - Backend: Safe - no API changes

### Verification Steps:

1. **Frontend:**
   - Page should load without ReferenceError
   - Loading state should work (just `loading` check)
   - No console errors about `pollingStatus`

2. **Backend:**
   - Sync-store should work without ReferenceError
   - Error handling should work (catalogOutput check at line 2669)
   - Logs should show correct catalogOutput state

---

## Implementation Order

1. Fix backend first (simpler - just move variable declaration)
2. Fix frontend second (more cleanup needed)

