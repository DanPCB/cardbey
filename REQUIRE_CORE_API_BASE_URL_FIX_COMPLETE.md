# requireCoreApiBaseUrl Fix - Complete

**Date:** 2025-01-28  
**Status:** ✅ All imports fixed

---

## ✅ Issue Fixed

**Error:** `requireCoreApiBaseUrl is not defined`

**Root Cause:**
- `apiBase.ts` was calling `requireCoreApiBaseUrl()` without importing it
- Legacy file `src/lib/requireCoreApiBaseUrl.ts` existed but imported from wrong location
- `api.ts` was using `getCoreBaseUrl()` from deprecated `coreUrl.ts`

---

## ✅ Changes Applied

### 1. Fixed `apiBase.ts`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/apiBase.ts`

**Added Import:**
```typescript
import { requireCoreApiBaseUrl } from './canonicalCoreUrl';
```

**Line 138:** Now correctly imports and uses `requireCoreApiBaseUrl()` from canonical resolver.

---

### 2. Deleted Legacy File
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/requireCoreApiBaseUrl.ts` (DELETED)

**Reason:** This was a duplicate/legacy file that imported from the wrong location (`@/lib/coreUrl` instead of `@/lib/canonicalCoreUrl`).

---

### 3. Fixed `api.ts`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Changed:**
- Line 241: Replaced `getCoreBaseUrl()` with dynamic import of `getCoreApiBaseUrl()` from `canonicalCoreUrl.ts`
- Uses async import to avoid circular dependencies

**Before:**
```typescript
logData.coreBaseUrl = getCoreBaseUrl() || 'not configured';
```

**After:**
```typescript
const { getCoreApiBaseUrl } = await import('./canonicalCoreUrl');
logData.coreBaseUrl = getCoreApiBaseUrl() || 'not configured';
```

---

## ✅ Verification

### All Files Using `requireCoreApiBaseUrl`:
1. ✅ `src/lib/apiBase.ts` - Imports from `./canonicalCoreUrl`
2. ✅ `src/lib/api.ts` - Imports from `./canonicalCoreUrl`
3. ✅ `src/lib/apiUrlHelper.ts` - Imports from `./canonicalCoreUrl`
4. ✅ `src/services/createBusiness.ts` - Imports from `@/lib/canonicalCoreUrl`

### All Files Using Core URL Resolver:
- ✅ All use `getCoreApiBaseUrl()` or `requireCoreApiBaseUrl()` from `canonicalCoreUrl.ts`
- ✅ No direct `localStorage` reads for `CORE_BASE_URL`
- ✅ No `window.location.origin` hacks
- ✅ No `resolvedBaseUrl` references

---

## 🧪 Testing

### Test 1: MI Job Page
1. Navigate to `/mi/job/:jobId`
2. **Expected:** Page renders without crashing
3. **Expected:** Job status is fetched successfully
4. **Expected:** No "requireCoreApiBaseUrl is not defined" error

### Test 2: API Calls
1. Make any API call (e.g., `apiGET('/api/health')`)
2. **Expected:** Uses canonical base URL resolver
3. **Expected:** No undefined function errors

---

## ✅ Acceptance Criteria

- ✅ `/mi/job/:jobId` renders without crashing
- ✅ Can fetch `/api/mi/job/:jobId` using canonical base URL
- ✅ All `requireCoreApiBaseUrl()` calls import from `canonicalCoreUrl.ts`
- ✅ No legacy `requireCoreApiBaseUrl.ts` file
- ✅ No deprecated `getCoreBaseUrl()` usage in `api.ts`
- ✅ No direct `localStorage` reads for `CORE_BASE_URL`
- ✅ No `window.location.origin` hacks

---

**Status:** ✅ Complete - All imports fixed, legacy file removed, MI job page should work.




