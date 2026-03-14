# Content Studio Image Fix - Summary

## Problem
When clicking "Create Smart Promotion" on a product card, the item was not landing in Content Studio with its image. Additionally, there were 401 errors on `/api/auth/me` and `/api/store/:id/context`, and a 500 error on `/api/mi/promo/from-draft`.

## Root Causes

### 1. Image URL Normalization Issue
- `getEffectiveCoreApiBaseUrl()` returns '' (empty string) in Vite dev mode
- `createPromoDraftFromItem` was using this to normalize image URLs
- Result: Image URLs couldn't be normalized to absolute URLs
- Fix: Use `getMediaBaseUrl()` which always returns absolute URL (localhost:3001 in dev)

### 2. Backend 500 Error
- `tenantId.trim()` was called when `tenantId` could be `null` or `undefined`
- This caused a 500 error when creating promo instances
- Fix: Validate `tenantId` before using `.trim()`, return 400 if missing

## Changes Made

### 1. Fixed Image URL Normalization
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoDraftFromItem.ts`

- Changed from `getEffectiveCoreApiBaseUrl()` to `getMediaBaseUrl()`
- `getMediaBaseUrl()` always returns absolute URL (localhost:3001 in dev)
- This ensures image URLs are properly normalized to absolute URLs

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/mediaBaseUrl.ts`

- Added Vite dev mode detection
- Returns `http://localhost:3001` directly in Vite dev mode
- This ensures media URLs are always absolute, even when API calls use relative URLs

### 2. Fixed Backend 500 Error
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

- Added `tenantId` validation before using `.trim()`
- Returns 400 with clear error message if `tenantId` is missing
- Normalizes `tenantId` once after validation
- Removed redundant `.trim()` calls (use validated `tenantId` directly)

## Flow After Fix

1. **User clicks "Create Smart Promotion"**
   - `handleSmartUpgradeConfirm` is called
   - Extracts product image URL (SSE image > product.imageUrl > product.images[0])

2. **Create Local Draft**
   - `createPromoDraftFromItem` is called
   - Normalizes image URL using `getMediaBaseUrl()` → `http://localhost:3001/uploads/...`
   - Creates draft with image in:
     - `scene1.promo.backgroundImageUrl` (primary)
     - `scene1.promo.imageUrl` (fallback)
     - `scene2.product.imageUrl` (product layer)
   - Stores `meta.sourceContext` with image URL
   - Stores `cardbey.pendingPromo` in localStorage

3. **Navigate to Content Studio**
   - Uses `buildContentStudioUrl()` with `instanceId`
   - Navigates immediately (no waiting for backend)

4. **Content Studio Applies Image**
   - Reads `cardbey.pendingPromo` from localStorage
   - Applies image to `scene1.promo.backgroundImageUrl` and `scene2.product.imageUrl`
   - Also checks `meta.sourceContext` for idempotent injection
   - Image appears on canvas immediately

5. **Backend Sync (Optional)**
   - `createPromoAndGoToStudio` runs in background
   - Backend validates `tenantId` before creating Content entity
   - Returns 400 (not 500) if `tenantId` is missing

## Expected Results

✅ **Image appears in Content Studio** - Product image is visible on canvas immediately  
✅ **No 500 errors** - Backend validates `tenantId` before using it  
✅ **Clear error messages** - 400 errors with specific codes (MISSING_TENANT_ID, INVALID_TENANT_ID)  
✅ **Absolute image URLs** - All image URLs are normalized to `http://localhost:3001/uploads/...`  

## Testing

1. **Test Image Normalization:**
   ```javascript
   // In browser console
   localStorage.setItem('cardbey.debug', 'true');
   // Click "Create Smart Promotion" on a product card
   // Check console for:
   // [createPromoDraftFromItem] Normalized image URL: http://localhost:3001/uploads/...
   ```

2. **Test Content Studio:**
   - Click "Create Smart Promotion"
   - Content Studio should open with product image visible
   - Check Network tab: Image should load from `http://localhost:3001/uploads/...`

3. **Test Backend:**
   - Check backend logs for `tenantId` validation
   - Should see 400 (not 500) if `tenantId` is missing
   - Should see successful Content creation if `tenantId` is valid

## Files Changed

1. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoDraftFromItem.ts`
   - Changed to use `getMediaBaseUrl()` instead of `getEffectiveCoreApiBaseUrl()`

2. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/lib/mediaBaseUrl.ts`
   - Added Vite dev mode detection
   - Returns `http://localhost:3001` directly in Vite dev mode

3. ✅ `apps/core/cardbey-core/src/routes/miRoutes.js`
   - Added `tenantId` validation before using `.trim()`
   - Returns 400 with clear error if `tenantId` is missing
   - Removed redundant `.trim()` calls



















