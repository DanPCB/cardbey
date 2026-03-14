# Deep Error Analysis Report

## Summary

Analyzed three network errors from the console:
1. **2x `POST /api/menu/images/suggest` → 400 Bad Request**
2. **1x `POST /api/mi/promo/from-product` → 401 Unauthorized**

## Root Causes

### 1. `/api/menu/images/suggest` - 400 Bad Request

**Problem:** Request format mismatch between frontend and backend.

**Backend Expects:**
```json
{
  "storeId": "string",
  "items": [
    {
      "itemId": "string",
      "name": "string",
      "tags": ["string"],
      "price": number
    }
  ],
  "aspect": "16:10"
}
```

**Frontend Was Sending:**
```json
{
  "itemIds": ["id1", "id2", ...]
}
```

**Fix Applied:**
- Updated `suggestImages()` API client to match backend format
- Added `storeId` and full `items` array with `itemId`, `name`, `tags`, `price`
- Updated response handling to use `updated` and `failed` arrays (not `suggestions`)
- Added auth guard to prevent unauthenticated requests
- Updated callers in `StoreDraftReview.tsx` and `MenuPage.jsx` to pass correct format

### 2. `/api/mi/promo/from-product` - 401 Unauthorized

**Problem:** Request being made without authentication check.

**Fix Applied:**
- Added auth guard in API client (`miPromo.ts`)
- Added auth guard in handler (`StoreDraftReview.tsx`)
- Returns early with `AUTH_REQUIRED` error if no token
- Shows auth modal instead of making request

## Files Changed

### 1. `apps/dashboard/cardbey-marketing-dashboard/src/api/menuImages.ts`
- **Changed:** `suggestImages()` function signature and implementation
- **Before:** `{ itemIds: string[] }`
- **After:** `{ storeId: string, items: [{itemId, name, tags?, price?}], aspect? }`
- **Added:** Auth guard to prevent unauthenticated requests
- **Updated:** Response handling to use `updated`/`failed` arrays

### 2. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
- **Changed:** Auto-fill images button handler
- **Before:** Called `suggestImages({ itemIds: [...] })`
- **After:** Calls `suggestImages({ storeId, items: [{itemId, name, ...}] })`
- **Updated:** Response handling to use `updated` array
- **Removed:** Unnecessary `updateItemImage` calls (backend already updates)

### 3. `apps/dashboard/cardbey-marketing-dashboard/src/pages/menu/MenuPage.jsx`
- **Changed:** Bulk auto-fill images button handler
- **Before:** Called `suggestImages({ itemIds: [...] })`
- **After:** Calls `suggestImages({ storeId, items: [{itemId, name, ...}] })`
- **Updated:** Response handling to use `updated` array
- **Removed:** Unnecessary `updateItemImage` calls (backend already updates)

### 4. `apps/dashboard/cardbey-marketing-dashboard/src/api/miPromo.ts`
- **Already Fixed:** Auth guard added in previous patch
- **Status:** Should prevent 401 if code is reloaded

## Verification Steps

### Test 1: `/api/menu/images/suggest` - 400 Bad Request Fix

1. **Clear browser cache and hard refresh** (Ctrl+Shift+R)
2. Navigate to Store Draft Review or Menu Page
3. Click "Auto-fill images (N missing)" button
4. **Expected:**
   - ✅ Request format: `{ storeId, items: [{itemId, name, ...}] }`
   - ✅ Response: `{ ok: true, updated: [...], failed: [...] }`
   - ✅ No 400 errors
   - ✅ Images appear on menu items

### Test 2: `/api/mi/promo/from-product` - 401 Unauthorized Fix

1. **Clear browser cache and hard refresh** (Ctrl+Shift+R)
2. **Without logging in:**
   - Navigate to Store Draft Review
   - Click "Create Smart Promotion" on any product
   - Select format and click "Create Smart Object"
3. **Expected:**
   - ✅ No network request to `/api/mi/promo/from-product`
   - ✅ No 401 errors
   - ✅ Auth required modal appears

4. **After logging in:**
   - Repeat steps 2-3
   - **Expected:**
     - ✅ Request is made with Authorization header
     - ✅ Promotion is created successfully
     - ✅ User is navigated to editor

## Debug Mode

Enable debug logging to see auth checks:
```javascript
localStorage.setItem('cardbey.debug', 'true');
```

**Expected Logs:**
- `[suggestImages] No auth token found, returning AUTH_REQUIRED without making request`
- `[createPromoFromProduct] No auth token found, returning AUTH_REQUIRED without making request`
- `[StoreDraftReview] Auth check failed - no tokens, showing auth required modal`

## Remaining Issues

### If 400 errors persist:
1. Verify backend endpoint is mounted correctly
2. Check `PEXELS_API_KEY` is set in backend environment
3. Verify `storeId` is valid and exists in database
4. Check backend logs for validation errors

### If 401 errors persist:
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear service worker cache
3. Verify auth tokens exist: `localStorage.getItem('cardbey_dev_bearer')`
4. Check if auth guard code is actually loaded (use debug mode)

## Backend Validation

The backend validates:
- ✅ `storeId` is required (returns 400 if missing)
- ✅ `items` array is required and non-empty (returns 400 if missing/empty)
- ✅ Each item must have `itemId` and `name` (returns error in `failed` array)
- ✅ `PEXELS_API_KEY` must be configured (returns 503 if missing)

## Frontend Validation

The frontend now:
- ✅ Checks authentication before making request
- ✅ Validates `storeId` exists before calling API
- ✅ Maps product/item data to backend format correctly
- ✅ Handles `updated` and `failed` arrays from response
- ✅ Shows appropriate error messages

## Next Steps

1. **Test locally** with hard refresh
2. **Verify** no 400/401 errors in console
3. **Confirm** images are added successfully
4. **Check** auth modal appears when not logged in




