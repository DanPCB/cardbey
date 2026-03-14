# Canvas Image Injection - Complete Implementation

## Summary

Implemented **automatic image injection into the canvas** when opening an instance created from `/mi/promo/from-draft`. This is the "talking bag" requirement - the product image must appear on the canvas immediately when the editor opens.

## Implementation

### 1. Idempotent Image Injection from `sourceContext`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

**Changes:**
- Enhanced existing `sourceContext` injection logic to be truly idempotent
- Added `_imageInjected` flag in `meta` to prevent re-injection on every load
- Sets `backgroundFit: 'cover'` explicitly to ensure image fills canvas
- Injects image as background layer (zIndex 0, fit="cover")
- Sets product name as headline if missing (title layer)
- Persists draft after injection

**Logic Flow:**
1. Check if `sourceContext` exists and has `imageUrl`
2. Check if injection already happened (`_imageInjected` flag)
3. Check if image is already set in scene data
4. If all conditions pass:
   - Normalize image URL to absolute
   - Set `scene1.promo.backgroundImageUrl` (primary field for PromotionPreview)
   - Set `scene1.promo.backgroundFit = 'cover'` (explicit)
   - Set `scene1.promo.design.backgroundFit = 'cover'` (nested)
   - Set `scene2.product.imageUrl` (product layer)
   - Set `_imageInjected = true` flag
   - Set headline if missing (title layer)
   - Save instance

### 2. Enhanced `pendingPromo` Payload Application
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

**Changes:**
- Also sets `backgroundFit: 'cover'` when applying `pendingPromo` payload
- Ensures image appears immediately from localStorage handoff

## Canvas Layer Structure

The promotion template uses a scene-based structure:
- **Background Layer (zIndex 0):** `scene1.promo.backgroundImageUrl`
- **Fit Mode:** `scene1.promo.backgroundFit` or `scene1.promo.design.backgroundFit` (defaults to 'cover')
- **Product Layer:** `scene2.product.imageUrl` (for product-specific layouts)
- **Title Layer:** `scene1.promo.headline` (product name)

The `PromotionPreview` component reads from:
- `data.scene1.promo.backgroundImageUrl` (primary)
- `data.scene1.promo.imageUrl` (fallback)
- `design.backgroundFit` or `promo.backgroundFit` (defaults to 'cover')

## Idempotency

The injection is idempotent through:
1. **Flag Check:** `meta._imageInjected` prevents re-injection
2. **Data Check:** Only injects if `backgroundImageUrl` is missing
3. **One-Shot:** `pendingPromo` payload is deleted after application

## Flow

```
User clicks "Create Smart Promotion"
  ↓
Backend creates instance with meta.sourceContext.imageUrl
  ↓
Frontend navigates to Content Studio
  ↓
Editor loads instance
  ↓
Idempotent injection:
  - Check _imageInjected flag (skip if true)
  - Check if backgroundImageUrl exists (skip if true)
  - Normalize image URL
  - Set scene1.promo.backgroundImageUrl
  - Set scene1.promo.backgroundFit = 'cover'
  - Set scene1.promo.design.backgroundFit = 'cover'
  - Set scene2.product.imageUrl
  - Set _imageInjected = true
  - Set headline if missing
  - Save instance
  ↓
PromotionPreview renders with image visible
```

## Test Checklist

1. **Test Image Injection:**
   - Create Smart Promotion from product with image
   - Editor opens → Image is visible immediately on canvas
   - Image fills canvas (cover mode)
   - Product name appears as headline

2. **Test Idempotency:**
   - Refresh page → Image still visible
   - No duplicate injection logs
   - `_imageInjected` flag prevents re-injection

3. **Test Missing Image:**
   - Create Smart Promotion from product without image
   - Editor opens → Toast shows "Item has no image"
   - No errors, editor still functional

4. **Test URL Normalization:**
   - Product with relative image URL → Normalized to absolute
   - Product with absolute image URL → Used as-is

## Files Changed

1. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`
   - Enhanced `sourceContext` injection logic
   - Added `_imageInjected` flag for idempotency
   - Set `backgroundFit: 'cover'` explicitly
   - Enhanced `pendingPromo` payload application

## Acceptance Criteria

✅ Image appears on canvas immediately when editor opens  
✅ Image fills canvas (cover mode)  
✅ Injection is idempotent (only once)  
✅ Product name appears as headline if missing  
✅ Draft is persisted after injection  
✅ Works for both `sourceContext` and `pendingPromo` paths  



















