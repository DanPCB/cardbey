# Menu Grid Crop Implementation Summary

## Overview

Implemented automatic grid cropping for menu photos. When a user uploads a grid-style menu image (e.g., 4 columns × 3 rows), the system automatically crops individual item images and attaches them to menu items.

## Files Created

### Backend

1. **`apps/core/cardbey-core/src/menu/imageExtractors/gridCropExtractor.js`**
   - `gridCropMenuImages()` - Main cropping function
   - Downloads image, computes tile boxes, crops photos, removes overlay icons
   - Returns array of cropped image buffers

2. **`apps/core/cardbey-core/src/menu/imageExtractors/uploadCrop.js`**
   - `uploadCropImage()` - Uploads cropped buffer to media system
   - Creates Media record, returns public URL
   - Reuses existing S3/local storage infrastructure

## Files Modified

### Backend

1. **`apps/core/cardbey-core/src/engines/menu/extractMenu.js`**
   - Added grid cropping integration (lines 215-299)
   - Feature-flagged with `FEATURE_MENU_GRID_CROP_IMAGES`
   - Crops images before creating menu items
   - Maps crops to items by row-major index
   - Non-blocking: failures don't break extraction

2. **`apps/core/cardbey-core/src/engines/menu/configureMenu.js`**
   - Updated to accept and store `imageUrl` on Product records (line 82)

3. **`apps/core/cardbey-core/src/engines/menu/queryMenuState.js`**
   - Added `imageUrl` to select and return (lines 35, 71)

4. **`apps/core/cardbey-core/src/routes/menuRoutes.js`**
   - Added debug endpoint `POST /api/menu/debug/grid-crop` (lines 279-350)
   - Dev-only endpoint for testing grid cropping

### Frontend

1. **`apps/dashboard/cardbey-marketing-dashboard/src/components/menu/MenuStateViewer.jsx`**
   - Added image thumbnail display in `MenuItemCard` (lines 200-210)
   - Shows cropped image above item name
   - Graceful fallback if image fails to load

## Environment Variables

### Feature Flag
```bash
FEATURE_MENU_GRID_CROP_IMAGES=true  # Enable grid cropping (default: false)
```

### Grid Configuration (Optional)
```bash
MENU_GRID_COLS=4              # Number of columns (default: 4)
MENU_GRID_ROWS=3              # Number of rows (default: 3)
MENU_GRID_PHOTO_RATIO=0.62    # Photo height ratio (default: 0.62)
MENU_GRID_PAD_PX=6            # Padding pixels (default: 6)
```

### Debug Logging
```bash
DEBUG_MENU_CROP=true          # Enable verbose crop logs (default: false)
```

## How It Works

### 1. Grid Crop Algorithm

```
For each grid cell (row r, col c):
  1. Calculate tile box:
     tileLeft = round(c * tileW) + padPx
     tileTop = round(r * tileH) + padPx
     tileWidth = round(tileW) - 2*padPx
     tileHeight = round(tileH) - 2*padPx

  2. Calculate photo crop (inside tile):
     photoH = round(tileHeight * photoRatio)
     cropW = tileWidth - overlayTrimW (if removeOverlay)
     cropH = photoH

  3. Extract and resize:
     sharp.extract(photoBox).resize(512, 512, { fit: "cover" }).jpeg({ quality: 82 })
```

### 2. Integration Flow

```
1. User uploads menu photo
2. Extraction runs (OCR + parsing)
3. If FEATURE_MENU_GRID_CROP_IMAGES=true:
   a. Download source image
   b. Crop into 12 images (4×3 grid)
   c. Upload each crop to media system
   d. Map crops to items by index (row-major order)
   e. Attach imageUrl to each item
4. Create menu items with imageUrl
5. Frontend displays images
```

### 3. Row-Major Index Mapping

```
Grid layout (4 cols × 3 rows):
  0  1  2  3
  4  5  6  7
  8  9  10 11

Item 0 → Crop 0 (top-left)
Item 1 → Crop 1 (top, second from left)
...
Item 11 → Crop 11 (bottom-right)
```

## Testing

### 1. Enable Feature Flag

Add to backend `.env`:
```bash
FEATURE_MENU_GRID_CROP_IMAGES=true
DEBUG_MENU_CROP=true
```

### 2. Test via Dashboard UI

1. Go to Menu page: `http://localhost:5174/menu`
2. Click "Upload Menu Photo"
3. Upload `coffee_import_list.jpg` (or similar 4×3 grid menu)
4. Click "Extract Items"
5. **Expected:**
   - 12 items extracted
   - Each item has `imageUrl` set
   - Menu cards show cropped images

### 3. Test Debug Endpoint

```powershell
# PowerShell
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer YOUR_TOKEN"
}

$body = @{
    imageUrl = "http://192.168.1.3:3001/uploads/media/YOUR_IMAGE.jpg"
    cols = 4
    rows = 3
    photoRatio = 0.62
    padPx = 6
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://192.168.1.3:3001/api/menu/debug/grid-crop" `
    -Method POST `
    -Headers $headers `
    -Body $body

$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**Expected Response:**
```json
{
  "ok": true,
  "urls": [
    "http://192.168.1.3:3001/uploads/media/menu-crop-debug-abc123-0.jpg",
    "http://192.168.1.3:3001/uploads/media/menu-crop-debug-abc123-1.jpg",
    ...
  ],
  "count": 12,
  "cropsGenerated": 12
}
```

### 4. Verify Backend Logs

With `DEBUG_MENU_CROP=true`, you should see:
```
[Grid Crop Extractor] Starting grid crop { cols: 4, rows: 3, ... }
[Grid Crop Extractor] Image dimensions: { width: 1200, height: 900 }
[Grid Crop Extractor] Tile dimensions: { tileW: 300, tileH: 300 }
[Grid Crop Extractor] Crop 0 (row 0, col 0): { tileBox: {...}, photoBox: {...} }
[Grid Crop Extractor] Generated 12 crops
[Upload Crop] Uploaded crop 0: { mediaId: "...", url: "...", width: 512, height: 512 }
[Menu Engine] Grid cropping complete { cropsGenerated: 12, cropsUploaded: 12, itemsToUpdate: 12 }
```

### 5. Verify Database

Check that Product records have `imageUrl` set:
```sql
SELECT name, imageUrl FROM Product WHERE businessId = 'YOUR_STORE_ID' AND imageUrl IS NOT NULL;
```

## Code Diffs Summary

### `extractMenu.js` (lines 215-299)

**Added:**
- Feature flag check: `FEATURE_MENU_GRID_CROP_IMAGES`
- Grid crop execution with configurable params
- Crop upload and mapping to items
- Error handling (non-blocking)

**Key logic:**
```javascript
if (gridCropEnabled && imageUrl) {
  const cropResult = await gridCropMenuImages({ ... });
  const uploadedCrops = await Promise.all(uploadPromises);
  // Map crops to items by index
  for (let i = 0; i < minCount; i++) {
    configureInput.items[i].imageUrl = cropImageUrls[i];
  }
}
```

### `configureMenu.js` (line 82)

**Changed:**
```javascript
// Before:
imageUrl: undefined,

// After:
imageUrl: item.imageUrl || null,
```

### `MenuStateViewer.jsx` (lines 200-210)

**Added:**
```jsx
{imageUrl && (
  <div className="mb-3">
    <img
      src={imageUrl}
      alt={item.name}
      className="w-full h-32 object-cover rounded-md"
      onError={(e) => e.target.style.display = 'none'}
    />
  </div>
)}
```

## Acceptance Criteria Verification

✅ **With `FEATURE_MENU_GRID_CROP_IMAGES=true` and `coffee_import_list.jpg`:**
- 12 crops are generated
- Each new menu item gets `imageUrl` set
- Menu page renders images on each card

✅ **If feature flag is off:**
- Existing behavior unchanged (no cropping, no errors)

✅ **Error handling:**
- Cropping failures don't crash extraction
- Missing images don't break UI
- Graceful fallbacks throughout

## Known Limitations

1. **Grid-only**: Only works for regular grid layouts (4×3, 3×4, etc.)
2. **Fixed dimensions**: Assumes uniform grid cells (no irregular layouts)
3. **Overlay removal**: Simple trim (doesn't detect icons, just trims top-right)
4. **No SAM**: Doesn't use segmentation (future enhancement)

## Future Enhancements

1. **Auto-detect grid dimensions** from image analysis
2. **SAM-based segmentation** for irregular layouts
3. **Icon detection** for better overlay removal
4. **Multiple image support** (front/back, different angles)

## Troubleshooting

### No images appearing

1. Check feature flag: `FEATURE_MENU_GRID_CROP_IMAGES=true`
2. Check backend logs for crop errors
3. Verify image URL is accessible (not private URL issue)
4. Check database: `SELECT imageUrl FROM Product WHERE ...`

### Crops don't match items

- Verify grid dimensions match actual layout
- Adjust `MENU_GRID_COLS` and `MENU_GRID_ROWS` if needed
- Check row-major index mapping

### Crops are wrong size/position

- Adjust `MENU_GRID_PHOTO_RATIO` (default 0.62)
- Adjust `MENU_GRID_PAD_PX` (default 6)
- Enable `DEBUG_MENU_CROP=true` to see computed boxes

