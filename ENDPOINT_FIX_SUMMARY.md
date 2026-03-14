# MI Endpoint Path Fix - 2026-01-15

## Problem
Frontend was calling incorrect MI endpoint paths, causing 404 errors:
- ❌ `/api/mi/infer` → Should be `/api/mi/orchestra/infer`
- ❌ `/api/mi/start` → Should be `/api/mi/orchestra/start`

## Root Cause
The frontend was using shortened paths that don't match the backend route structure.

## Solution
Updated all MI endpoint calls in `quickStart.ts` to use the correct `/orchestra/` prefix.

## Changes Made

### File: `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`

1. **Line 610:** Fixed `/api/mi/infer` → `/api/mi/orchestra/infer`
   ```typescript
   // BEFORE:
   `${MI_BASE}/infer`
   
   // AFTER:
   `${MI_BASE}/orchestra/infer`
   ```

2. **Line 840:** Fixed debug log path
   ```typescript
   // BEFORE:
   `Calling POST ${MI_BASE}/start`
   
   // AFTER:
   `Calling POST ${MI_BASE}/orchestra/start`
   ```

3. **Line 847:** Fixed `/api/mi/start` → `/api/mi/orchestra/start`
   ```typescript
   // BEFORE:
   await apiPOST(`${MI_BASE}/start`, orchestraPayload)
   
   // AFTER:
   await apiPOST(`${MI_BASE}/orchestra/start`, orchestraPayload)
   ```

4. **Line 890:** Fixed retry path
   ```typescript
   // BEFORE:
   await apiPOST(`${MI_BASE}/start`, orchestraPayload)
   
   // AFTER:
   await apiPOST(`${MI_BASE}/orchestra/start`, orchestraPayload)
   ```

5. **Lines 938, 941, 952:** Fixed error handling paths
   ```typescript
   // BEFORE:
   `${MI_BASE}/start`
   
   // AFTER:
   `${MI_BASE}/orchestra/start`
   ```

## Backend Routes (Verified)
- ✅ `POST /api/mi/orchestra/infer` - Line 665 in `miRoutes.js`
- ✅ `POST /api/mi/orchestra/start` - Line 780 in `miRoutes.js`

## Verification
After this fix:
- ✅ `/api/mi/orchestra/infer` should return 200 (or appropriate response)
- ✅ `/api/mi/orchestra/start` should return 200 with `jobId`
- ❌ No more 404 errors for these endpoints

## Testing
1. Start QuickStart flow
2. Verify `/api/mi/orchestra/infer` is called (check network tab)
3. Verify `/api/mi/orchestra/start` is called (check network tab)
4. Confirm no 404 errors appear
5. Verify store creation completes successfully

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-15

