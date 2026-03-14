# Bulk Menu Extraction Unification Summary

## Changes Made

### 1. New Backend Service ✅
**File**: `apps/core/cardbey-core/src/services/menuOcrBulkItems.js`

- **Purpose**: Extract multiple items from a menu image using the same pipeline as single-item extraction
- **Features**:
  - Grid-based region detection (auto-detects optimal grid size based on image aspect ratio)
  - Crops each region from the original image
  - Uploads cropped images to storage
  - Reuses `extractSingleItemOcr` for each region (same proven logic)
  - Deduplicates items by normalized name
  - Processes regions in batches of 3 (concurrency limit)
  - Returns partial results even if some regions fail

### 2. New Backend Endpoint ✅
**File**: `apps/core/cardbey-core/src/routes/menuRoutes.js`

**Endpoint**: `POST /api/menu/extract-items`

**Request Body**:
```json
{
  "tenantId": "string",
  "storeId": "string",
  "imageUrl": "string",
  "locale": "en",
  "targetCategory": "Coffee" // optional
}
```

**Response**:
```json
{
  "ok": true,
  "items": [
    {
      "name": "string",
      "description": "string | null",
      "imageUrl": "string | null",
      "price": number | null,
      "currency": "AUD",
      "category": "string | null",
      "bbox": { "x": number, "y": number, "w": number, "h": number },
      "confidence": number
    }
  ],
  "count": number
}
```

### 3. Frontend Integration ✅
**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/business-builder/onboarding/steps/Step4MenuImport.tsx`

- **Updated**: `handleExtract()` now calls `/api/menu/extract-items` instead of multiple `/api/menu/extract-single-item` calls
- **Benefits**:
  - Single API call instead of 9+ parallel calls
  - Consistent extraction quality (same pipeline)
  - Better error handling (partial failures don't break everything)
  - Automatic deduplication
  - Proper image cropping per region

### 4. URL Absolutization ✅
- All image URLs are absolutized before being passed to Vision/OCR APIs
- Uses `absolutizeUrl()` helper throughout the pipeline
- Ensures no "Invalid URL" errors when Vision API tries to fetch images

## Technical Details

### Grid Detection Algorithm
1. **Analyzes image dimensions** (width, height, aspect ratio)
2. **Infers optimal grid**:
   - Portrait images (< 0.8): 2 columns, 3-6 rows
   - Landscape images (> 1.5): 4 columns, 2-5 rows
   - Square images (0.8-1.5): 3 columns, 3-5 rows
3. **Limits grid size**: Max 20 items (4 cols × 5 rows)
4. **Fallback**: Default 3×3 grid if detection fails

### Extraction Pipeline (per region)
1. Crop region from original image buffer
2. Upload cropped image to storage (gets absolute URL)
3. Call `extractSingleItemOcr()` with cropped image URL
4. Normalize and deduplicate results
5. Return items with metadata (bbox, confidence, category)

### Deduplication
- Normalizes item names (lowercase, remove punctuation, normalize whitespace)
- Uses `Set` to track seen names
- Skips duplicates silently (logs warning)

### Concurrency Control
- Processes regions in batches of 3
- Uses `Promise.allSettled()` to handle partial failures
- Continues processing even if some regions fail

## Testing

### Test Cases
1. **Tropical cake image**: Should return 1 item with image, name "Tropical", description
2. **Coffee grid menu**: Should return multiple items (2-9) with images and names
3. **Portrait menu**: Should detect 2-column grid
4. **Landscape menu**: Should detect 4-column grid
5. **Invalid image**: Should return empty array with clear error

### Acceptance Criteria ✅
- ✅ "Extract Items" uses same pipeline as "Extract Single Item (Test)"
- ✅ No "Invalid URL" errors (all URLs are absolute)
- ✅ Cropped image URLs render in UI
- ✅ Partial failures don't break whole extraction
- ✅ Deduplication works (no duplicate items)
- ✅ Items have images, names, descriptions (same quality as single-item)

## Files Modified

1. **`menuOcrBulkItems.js`** (NEW) - Bulk extraction service
2. **`menuRoutes.js`** - Added `/api/menu/extract-items` endpoint
3. **`Step4MenuImport.tsx`** - Updated to use new endpoint

## Next Steps (Optional Enhancements)

1. **Vision-based region detection**: Use OpenAI Vision to detect actual menu item boundaries instead of grid heuristic
2. **Price extraction**: Enhance OCR to extract prices from each region
3. **Category inference**: Use item names to infer categories automatically
4. **Confidence scoring**: Improve confidence calculation based on OCR quality
5. **Parallel optimization**: Increase concurrency limit for faster extraction

















