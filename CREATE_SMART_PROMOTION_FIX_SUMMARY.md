# Create Smart Promotion Fix - Summary

## Problem
Clicking "Create Smart Promotion" on catalog item cards was not reliably opening Content Studio with the selected item's image pre-filled. The canvas would open blank.

## Solution
Implemented a **local-first draft creation** approach that ensures the item image appears immediately in Content Studio, even if backend API calls are slow or fail.

## Changes Made

### 1. New Helper: `createPromoDraftFromItem`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoDraftFromItem.ts`

- Extracts item data (id, name, image URL)
- Normalizes image URL to absolute URL
- Creates local draft with image pre-filled in:
  - `scene1.promo.backgroundImageUrl` (primary field for PromotionPreview)
  - `scene1.promo.imageUrl` (fallback)
  - `scene2.product.imageUrl` (product layer)
- Stores handoff payload in `localStorage` for Content Studio
- Returns `instanceId` for navigation

**Key Features:**
- Uses `getEffectiveCoreApiBaseUrl()` for canonical URL resolution
- Normalizes relative URLs to absolute URLs
- Handles missing images gracefully (shows placeholder)
- Debug logging gated by `localStorage.getItem('cardbey.debug')`

### 2. Updated `handleSmartUpgradeConfirm`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
- Creates local draft FIRST using `createPromoDraftFromItem`
- Navigates immediately to Content Studio (no waiting for backend)
- Shows toast if item has no image
- Optionally syncs to backend in background (non-blocking)

**Flow:**
1. Extract product data and image URL
2. Create local draft with image pre-filled
3. Navigate to Content Studio immediately
4. Backend sync happens async (doesn't block)

### 3. Enhanced Content Studio Image Application
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

**Changes:**
- Sets `backgroundImageUrl` in addition to `imageUrl` when applying payload
- Shows toast if image is missing
- Applies image to both `scene1.promo.backgroundImageUrl` and `scene2.product.imageUrl`

### 4. Image URL Normalization
- Uses `normalizeUploadUrl()` from `@/lib/mediaUrls`
- Falls back to `getEffectiveCoreApiBaseUrl()` if normalization fails
- Ensures all image URLs are absolute (http:// or https://)

## How It Works

### Flow Diagram
```
User clicks "Create Smart Promotion"
  ↓
Extract product data (id, name, image)
  ↓
Normalize image URL to absolute
  ↓
Create local draft with image pre-filled
  ↓
Store handoff payload in localStorage
  ↓
Navigate to Content Studio immediately
  ↓
Content Studio loads draft and applies image
  ↓
Image appears on canvas as background
  ↓
(Optional) Backend sync happens in background
```

### Image Application Priority
1. **Primary:** `scene1.promo.backgroundImageUrl` - Used by PromotionPreview for background
2. **Fallback:** `scene1.promo.imageUrl` - Some components read this
3. **Product Layer:** `scene2.product.imageUrl` - Used for product image in some layouts

## Error Handling

### Missing Image
- Shows toast: "Item has no image. Editor will open with placeholder."
- Draft is still created (with empty imageUrl fields)
- Content Studio shows placeholder background

### Missing Item Data
- Returns error: `MISSING_ITEM_ID` or `MISSING_ITEM_NAME`
- Modal stays open for retry

### Image URL Normalization Failure
- Logs warning in debug mode
- Continues without image (shows placeholder)

## Testing Checklist

### ✅ Test 1: Item with Image
1. Go to Store Review page
2. Find a product card with an image
3. Click "Create Smart Promotion"
4. Select environment/format/goal in modal
5. Click "Create Smart Object"
6. **Expected:** Content Studio opens with product image as background
7. **Expected:** Product name appears in headline
8. **Expected:** Image persists after page refresh

### ✅ Test 2: Item without Image
1. Go to Store Review page
2. Find a product card without an image
3. Click "Create Smart Promotion"
4. Select environment/format/goal in modal
5. Click "Create Smart Object"
6. **Expected:** Toast shows "Item has no image. Editor will open with placeholder."
7. **Expected:** Content Studio opens with placeholder background
8. **Expected:** Product name appears in headline

### ✅ Test 3: Persistence
1. Create promo from item (with image)
2. Close Content Studio
3. Reopen Content Studio with same instanceId
4. **Expected:** Image is still present
5. **Expected:** Product name is still in headline

## Files Changed

1. **New:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoDraftFromItem.ts`
2. **Modified:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
3. **Modified:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

## Debug Mode

Enable debug logging by setting:
```javascript
localStorage.setItem('cardbey.debug', 'true');
```

This will log:
- Draft creation steps
- Image URL normalization
- Handoff payload storage
- Content Studio payload application

## Next Steps (Optional Enhancements)

1. **Backend Sync:** Currently backend sync is optional. Could make it required for persistence.
2. **Image Optimization:** Could add image resizing/optimization before setting in draft.
3. **Multiple Images:** Could support selecting which image to use if item has multiple images.
4. **Image Attribution:** Could store image attribution metadata for Pexels images.

## Acceptance Criteria Met

✅ Clicking "Create Smart Promotion" opens Content Studio  
✅ Editor loads with item image pre-filled on canvas  
✅ Item name is pre-filled in headline  
✅ Draft persists and can be reopened  
✅ Single entrypoint (no duplicate flows)  
✅ Uses canonical URL resolver (no relative /api calls)  
✅ Explicit errors for missing context  
✅ Works on refresh  



















