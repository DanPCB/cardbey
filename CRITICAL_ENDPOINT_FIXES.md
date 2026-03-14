# Critical Endpoint Fixes - 2026-01-15

## Issues Found

### 1. POST /api/mi/orchestra/job/:jobId → 404 ❌
**Problem:** Frontend is calling `POST /api/mi/orchestra/job/:jobId` but backend only has:
- `GET /api/mi/orchestra/job/:jobId` ✅
- `POST /api/mi/orchestra/job/:jobId/run` ✅

**Root Cause:** `buildOrchestraJobUrl` function doesn't accept suffix parameter

**Fix Applied:** ✅
- Updated `buildOrchestraJobUrl` to accept optional `suffix` parameter
- Now correctly builds `/api/mi/orchestra/job/:jobId/run` when suffix is provided

**Files Modified:**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` (lines 149, 1205)

### 2. POST /api/mi/orchestra/infer → 500 ❌
**Status:** Route exists, but returning 500 (server error)
**Action Required:** Check server logs for error details

### 3. GET /api/stores/:storeId/draft → 404 ❌
**Status:** Route may not exist or path is incorrect
**Action Required:** Verify route exists in `stores.js` or use alternative endpoint

### 4. GET /api/public/store/:storeId/draft → 404 ❌
**Status:** Route may not exist
**Action Required:** Verify route exists in `publicUsers.js` or use alternative endpoint

---

## Fixes Applied

### Fix #1: buildOrchestraJobUrl Function

**Before:**
```typescript
const buildOrchestraJobUrl = (jobId: string) => `/api/mi/orchestra/job/${jobId?.trim() || ''}`;
// Called as: buildOrchestraJobUrl(jobId, 'run') - suffix ignored!
```

**After:**
```typescript
const buildOrchestraJobUrl = (jobId: string, suffix?: string) => {
  const base = `/api/mi/orchestra/job/${jobId?.trim() || ''}`;
  return suffix ? `${base}/${suffix}` : base;
};
// Now correctly builds: /api/mi/orchestra/job/:jobId/run
```

**Locations Fixed:**
1. Line 149 (in `waitForJobReady` function)
2. Line 1205 (in `quickStartCreateJob` function)

---

## Remaining Issues to Investigate

### Issue #2: /api/mi/orchestra/infer → 500
**Action:** Check server logs for error details
**Likely Causes:**
- Database connection issue
- Missing environment variable
- Error in inference logic

### Issue #3: /api/stores/:storeId/draft → 404
**Action:** Check if route exists or use `/api/draft-store/:draftId` instead
**Alternative:** May need to use storeId to find draftId first

### Issue #4: /api/public/store/:storeId/draft → 404
**Action:** Check if route exists in `publicUsers.js`
**Alternative:** May need to use different public endpoint

---

## Verification Steps

1. ✅ Test `POST /api/mi/orchestra/job/:jobId/run` - should work now
2. ⚠️ Check server logs for `/api/mi/orchestra/infer` 500 error
3. ⚠️ Verify draft endpoint paths in frontend
4. ⚠️ Check if draft routes need to be created or paths corrected

---

**Status:** Fix #1 Complete, Issues #2-4 Need Investigation

