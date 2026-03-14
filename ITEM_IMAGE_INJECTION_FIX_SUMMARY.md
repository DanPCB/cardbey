# Item Image → Canvas Injection Fix Summary

## Problem
After auth fix, "Create Smart Promotion from Item" was not reliably injecting the item image into the Content Studio canvas. The image needed to be visible as the first layer (cover/contain) when the editor opens.

## Solution
Implemented **idempotent image injection** from `meta.sourceContext` that ensures item images always appear on canvas, even if draft loading had issues.

## Changes Made

### 1. Updated `createPromoDraftFromItem` to Store `sourceContext`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoDraftFromItem.ts`

**Changes:**
- Added `meta.sourceContext` object with:
  - `type: 'catalogItem'`
  - `itemId: params.itemId`
  - `itemName: params.itemName`
  - `imageUrl: normalizedImageUrl || null`
- This provides a single source of truth for item context

**Before:**
```typescript
meta: {
  templateId: 'promotion',
  mode: 'promo',
  sourceItemId: params.itemId,
  // ...
}
```

**After:**
```typescript
meta: {
  templateId: 'promotion',
  mode: 'promo',
  sourceItemId: params.itemId,
  sourceContext: {
    type: 'catalogItem',
    itemId: params.itemId,
    itemName: params.itemName,
    imageUrl: normalizedImageUrl || null,
  },
  // ...
}
```

### 2. Enhanced Content Studio Editor Image Injection
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

**Changes:**
- Added idempotent image injection logic after draft loading
- Checks `meta.sourceContext.imageUrl` exists
- Only injects if no image layer exists (idempotent)
- Normalizes image URL to absolute before injection
- Sets image in:
  - `scene1.promo.backgroundImageUrl` (primary for PromotionPreview)
  - `scene1.promo.imageUrl` (fallback)
  - `scene2.product.imageUrl` (product layer)
- Also sets item name in headline/product name if missing
- Shows toast if item has no image

**Logic:**
```typescript
// Check if image is already set
const hasImageInScene1 = !!loaded.data.scene1?.promo?.backgroundImageUrl || !!loaded.data.scene1?.promo?.imageUrl;
const hasImageInScene2 = !!loaded.data.scene2?.product?.imageUrl;

// Only inject if image is missing AND sourceContext has imageUrl
if (sourceContext.imageUrl && !hasImageInScene1 && !hasImageInScene2) {
  // Normalize URL to absolute
  // Inject into scene1 and scene2
  // Save draft
}
```

### 3. Updated Backend to Store `sourceContext`
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Changes:**
- Added `sourceContext` to `metaData` when `productId` is provided
- Stores item context for idempotent injection

**Code:**
```javascript
...(productId && product ? {
  sourceContext: {
    type: 'catalogItem',
    itemId: productId.trim(),
    itemName: productName,
    imageUrl: productImage || null,
  },
} : {}),
```

## How It Works

### Flow Diagram
```
User clicks "Create Smart Promotion"
  ↓
createPromoDraftFromItem extracts item data
  ↓
Normalizes imageUrl to absolute URL
  ↓
Creates draft with:
  - scene1.promo.backgroundImageUrl (primary)
  - scene2.product.imageUrl (product layer)
  - meta.sourceContext (for idempotent injection)
  ↓
Navigates to Content Studio
  ↓
Editor loads draft
  ↓
Idempotent injection checks:
  - If sourceContext.imageUrl exists
  - AND no image in scene1/scene2
  - THEN inject image (normalize URL first)
  ↓
Image appears on canvas
```

### Image Injection Priority
1. **Primary:** `scene1.promo.backgroundImageUrl` - Used by PromotionPreview for background
2. **Fallback:** `scene1.promo.imageUrl` - Some components read this
3. **Product Layer:** `scene2.product.imageUrl` - Used for product image in some layouts

### Idempotent Behavior
- **Only injects if missing:** Checks `hasImageInScene1` and `hasImageInScene2` first
- **Normalizes URL:** Ensures absolute URL before injection
- **Preserves user edits:** Only injects if image is missing (doesn't overwrite)
- **Works on refresh:** `sourceContext` is persisted in draft, so injection works on reload

## Error Handling

### Missing Image
- Shows toast: "Item has no image. Add an image in the editor."
- Draft is still created (with empty imageUrl fields)
- Content Studio shows placeholder background

### URL Normalization Failure
- Logs warning in debug mode
- Continues with original URL (may still work)
- Falls back gracefully

### Missing Item Data
- Returns error: `MISSING_ITEM_ID` or `MISSING_ITEM_NAME`
- Modal stays open for retry

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
6. **Expected:** Toast shows "Item has no image. Add an image in the editor."
7. **Expected:** Content Studio opens with placeholder background
8. **Expected:** Product name appears in headline

### ✅ Test 3: Idempotent Injection
1. Create promo from item (with image)
2. Image appears on canvas
3. Refresh page
4. **Expected:** Image is still present (injection doesn't run again)
5. **Expected:** No duplicate images

### ✅ Test 4: Backend Draft with sourceContext
1. Create promo via `/api/mi/promo/from-draft` (backend)
2. Backend stores `meta.sourceContext`
3. Open Content Studio with instanceId
4. **Expected:** Image is injected from sourceContext
5. **Expected:** Item name is set in headline

## Files Changed

1. **`apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoDraftFromItem.ts`**
   - Added `meta.sourceContext` storage

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`**
   - Added idempotent image injection logic
   - URL normalization before injection
   - Toast for missing images

3. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Added `sourceContext` to `metaData` when productId provided

## Debug Mode

Enable debug logging:
```javascript
localStorage.setItem('cardbey.debug', 'true');
```

This will log:
- Image injection steps
- URL normalization
- sourceContext detection
- Injection success/failure

## Acceptance Criteria Met

✅ Clicking "Create Smart Promotion" opens Content Studio  
✅ Editor loads with item image visible as first layer  
✅ Item name is pre-filled in headline  
✅ Draft persists and can be reopened  
✅ Idempotent: only injects if image is missing  
✅ Works on refresh  
✅ Handles missing images gracefully  
✅ URL normalization ensures absolute URLs  

## Next Steps (Optional Enhancements)

1. **Image Optimization:** Could add image resizing/optimization before injection
2. **Multiple Images:** Could support selecting which image to use if item has multiple images
3. **Image Attribution:** Could store image attribution metadata for Pexels images
4. **Layer Management:** Could add explicit layer management for injected images



















