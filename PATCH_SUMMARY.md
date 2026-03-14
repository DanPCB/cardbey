# Cardbey Business Builder Onboarding Patch Summary

## Files Changed

### Frontend (dashboard)

1. **`apps/dashboard/cardbey-marketing-dashboard/src/features/business-builder/onboarding/steps/Step4MenuImport.tsx`**
   - ✅ Updated "Extract Items" button to use grid-based extraction pipeline
   - ✅ Added better context-ready status indicators (inline messages instead of just toasts)
   - ✅ Improved error handling and user feedback
   - ✅ Grid extraction now uses target category from dropdown
   - ✅ Clear extracted items after successful save
   - ✅ Better success messages showing created/updated counts

2. **`apps/dashboard/cardbey-marketing-dashboard/src/components/menu/MenuStateViewer.jsx`**
   - ✅ Fixed duplicate category keys by adding unique key with item IDs
   - ✅ Uncategorized section now has stable unique key

3. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/BusinessOnboardingPage.tsx`**
   - ✅ Preview overlay already implemented with fade transitions (verified)
   - ✅ Uses `/api/store/:storeId/context` instead of `/draft-store` endpoints

### Backend (core)

4. **`apps/core/cardbey-core/src/routes/menuRoutes.js`**
   - ✅ Added `category` parameter to `/menu/configure-from-photo` endpoint
   - ✅ Category from request body now overrides item.category when provided
   - ✅ Returns category in response for debugging
   - ✅ Image URL absolutization already implemented in extract-single-item endpoint

## Key Fixes

### 1. Preview-in-Canvas Overlay ✅
- Already implemented with fade transitions
- Builder fades to 0.15 opacity when preview is open
- Preview overlay uses absolute positioning within canvas
- No route changes, stays in same page

### 2. Removed /draft-store Dependencies ✅
- All preview data now comes from `/api/store/:storeId/context`
- Menu items from `/api/menu/items?tenantId=...&storeId=...`
- No more 404 errors from calling `/draft-store/:storeId`

### 3. Extract Items Uses Grid Pipeline ✅
- "Extract Items" button now uses same reliable single-item extractor
- Extracts 9 items (3x3 grid) in parallel with concurrency limit of 3
- Uses target category from dropdown
- Filters duplicates and null results

### 4. Context-Ready Gating ✅
- Extract buttons disabled until `contextReady` is true
- Inline status messages show "Store context is loading…"
- Clear error messages if context fails to load
- Auto-retry logic for context loading

### 5. Category Key Duplicates Fixed ✅
- MenuStateViewer now uses unique keys: `${item.id || item.name}-${itemIdx}-uncategorized`
- Category keys include item IDs for uniqueness

### 6. Image URL Absolutization ✅
- Already implemented in `extract-single-item` endpoint
- Uses `absolutizeUrl` helper from `lib/url.js`
- All image URLs returned to frontend are absolute

### 7. Configure-from-Photo Upsert ✅
- Respects `category` parameter from request
- Category overrides item.category when provided
- Returns created/updated/skipped counts
- All selected items are processed (no early exit)

## Testing Checklist

- [x] Preview overlay fades in/out without navigation
- [x] Extract Items button works with grid pipeline
- [x] Target category is applied to extracted items
- [x] Context loading shows inline status
- [x] No 404 errors from /draft-store endpoints
- [x] Category keys are unique (no React warnings)
- [x] Image URLs are absolute in responses
- [x] All selected items are saved to store

## Notes

- Grid extraction currently extracts from full image (v1 implementation)
- Future enhancement: actual image cropping before extraction
- Preview refresh happens automatically after save
- No breaking changes to existing functionality

















