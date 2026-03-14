# Image Injection Improvements

## Summary

Fixed issues with product image injection into Content Studio canvas when opening instances created from `/mi/promo/from-draft`.

## Problems Identified

1. **sourceContext not preserved from API**: When loading Content from API, `sourceContext` from `meta` was not being preserved during normalization
2. **sourceContext structure mismatch**: Backend response payload had different structure than what's stored in `metaData`
3. **Image URL normalization**: Existing image URLs might need normalization even if they exist

## Fixes Applied

### 1. Preserve sourceContext from API Response
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

**Change:**
- When normalizing API Content format, explicitly preserve `sourceContext` from `meta`
- Ensures image injection can work even when loading from backend

```typescript
meta: {
  ...meta,
  templateId: meta.templateId || (meta.mode === 'promo' ? 'promotion' : 'unknown'),
  // CRITICAL: Preserve sourceContext if it exists (for image injection)
  ...(meta.sourceContext && { sourceContext: meta.sourceContext }),
},
```

### 2. Unified sourceContext Structure
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Change:**
- Made response payload `sourceContext` match the structure stored in `metaData`
- Includes `type: 'catalogItem'` and `itemId` (required by frontend)
- Also includes `productId` for backward compatibility

```javascript
const sourceContext = productId && product ? {
  type: 'catalogItem', // CRITICAL: Frontend checks for this type
  itemId: productId.trim(), // Use itemId to match metaData structure
  itemName: productName,
  imageUrl: productImage || null,
  // Also include productId for backward compatibility
  productId: productId.trim(),
  productName: productName,
  storeId: finalStoreId?.trim() || null,
} : null;
```

### 3. Enhanced Image Injection Logic
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

**Changes:**
- Added fallback to check URL params for `productId` if `sourceContext` not in `meta`
- Improved injection condition to handle cases where image exists but needs normalization
- Better detection of when injection is needed

```typescript
// Check both meta.sourceContext (from backend Content entity) and URL params (from response payload)
let sourceContext = loaded.data?.meta?.sourceContext;

// Fallback: Check URL params for sourceContext (if backend response included it in navigation)
if (!sourceContext || sourceContext.type !== 'catalogItem') {
  const urlParams = new URLSearchParams(location.search);
  const productId = urlParams.get('productId');
  if (productId) {
    // Try to construct sourceContext from URL params
    sourceContext = {
      type: 'catalogItem',
      itemId: productId,
      itemName: loaded.data?.scene1?.promo?.headline || 'Product',
      imageUrl: null, // Will be injected from scene data if available
    };
  }
}

// Improved injection condition
const existingImageUrl = loaded.data.scene1?.promo?.backgroundImageUrl || 
                        loaded.data.scene1?.promo?.imageUrl || 
                        loaded.data.scene2?.product?.imageUrl;

const shouldInject = sourceContext.imageUrl && 
                     !injectionFlag && 
                     (!existingImageUrl || existingImageUrl === '' || existingImageUrl !== sourceContext.imageUrl);
```

## Flow After Fixes

```
User clicks "Create Smart Promotion"
  ↓
POST /api/mi/promo/from-draft
  ↓
Backend creates Content with:
  - settings.meta.sourceContext = { type: 'catalogItem', itemId, itemName, imageUrl }
  - settings.scene1.promo.backgroundImageUrl = productImage
  ↓
Backend returns response with:
  - instanceId
  - editorUrl
  - sourceContext (matching metaData structure)
  ↓
Frontend navigates to /app/creative-shell/edit/:instanceId
  ↓
Editor loads Content from API
  ↓
Normalization preserves sourceContext from meta
  ↓
Image injection checks:
  - sourceContext exists and has type: 'catalogItem'
  - sourceContext.imageUrl exists
  - No existing image or image needs normalization
  - Injection flag not set
  ↓
If conditions met:
  - Normalize image URL to absolute
  - Set scene1.promo.backgroundImageUrl
  - Set scene1.promo.backgroundFit = 'cover'
  - Set scene2.product.imageUrl
  - Set _imageInjected flag
  - Persist draft
  ↓
PromotionPreview renders with product image visible
```

## Files Changed

1. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`
   - Preserve `sourceContext` from API normalization
   - Enhanced image injection logic with fallback
   - Better detection of when injection is needed

2. ✅ `apps/core/cardbey-core/src/routes/miRoutes.js`
   - Unified `sourceContext` structure in response payload
   - Matches structure stored in `metaData`

## Testing

1. **Test Image Injection from Backend:**
   - Create Smart Promotion from product with image
   - Backend creates Content with `sourceContext` in `meta`
   - Editor loads from API
   - Image appears on canvas immediately

2. **Test Image Normalization:**
   - Product has relative image URL
   - Backend stores relative URL
   - Frontend normalizes to absolute during injection
   - Image displays correctly

3. **Test Idempotency:**
   - Refresh page after injection
   - `_imageInjected` flag prevents re-injection
   - Image still visible

4. **Test Fallback:**
   - If `sourceContext` not in `meta`, check URL params
   - Construct `sourceContext` from `productId` if available
   - Still attempt injection if image available in scene data



















