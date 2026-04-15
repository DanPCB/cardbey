# Design Library Preview & Loading Fix

## Issues Fixed

### 1. Preview Images in Design Library
**Problem:** All design cards showed "No preview" placeholder.

**Root Cause:** The `GET /api/contents` list endpoint wasn't including `thumbnailUrl` in the response.

**Fix Applied:**
- Added `thumbnailUrl: true` to the select statement in the list endpoint
- Now returns `thumbnailUrl` for each content item, allowing the frontend to display preview images

**Backend Changes:**
- `src/routes/contents.js` - Added `thumbnailUrl` to list endpoint response

### 2. Loading Function Error
**Problem:** Error message "Design data is missing required" when loading designs.

**Root Cause:** The GET endpoint might return content with missing required fields, causing frontend validation to fail.

**Fix Applied:**
- Ensured the GET endpoint returns all required fields with defaults:
  - `elements` defaults to `[]` if missing
  - `settings` defaults to `{}` if missing
  - `renderSlide` defaults to `null` if missing
  - `thumbnailUrl` defaults to `null` if missing
  - `version` defaults to `1` if missing
  - `name` defaults to `"Untitled Design"` if missing

**Backend Changes:**
- `src/routes/contents.js` - Added explicit field mapping with defaults in GET endpoint

## Backend Response Structure

### GET /api/contents (List)
```json
{
  "ok": true,
  "data": [
    {
      "id": "cmie7b24v0005jvu0v88ymuew",
      "name": "Untitled Design 25/11/2025",
      "version": 1,
      "createdAt": "2025-11-25T...",
      "updatedAt": "2025-11-25T...",
      "thumbnailUrl": "https://..." // NEW: Available for previews
    }
  ]
}
```

### GET /api/contents/:id (Load Single)
```json
{
  "ok": true,
  "data": {
    "id": "cmie7b24v0005jvu0v88ymuew",
    "name": "Untitled Design",
    "userId": "...",
    "elements": [...], // Always array, defaults to []
    "settings": {...}, // Always object, defaults to {}
    "renderSlide": null, // Always present, defaults to null
    "thumbnailUrl": null, // Always present, defaults to null
    "version": 1, // Always present, defaults to 1
    "createdAt": "2025-11-25T...",
    "updatedAt": "2025-11-25T..."
  }
}
```

## Frontend Integration Notes

### Displaying Previews
The frontend should:
1. Check if `thumbnailUrl` exists in the list response
2. Display the thumbnail image if available
3. Show "No preview" placeholder if `thumbnailUrl` is `null` or missing

Example:
```typescript
<img 
  src={content.thumbnailUrl || '/placeholder.png'} 
  alt={content.name}
  onError={(e) => {
    // Fallback to placeholder if image fails to load
    e.currentTarget.src = '/placeholder.png';
  }}
/>
```

### Loading Designs
The frontend should:
1. Use `loadContent(contentId)` to fetch full design data
2. Use `hydrateCanvas(content)` helper to convert to canvas state
3. Handle missing fields gracefully (backend now ensures defaults)

Example:
```typescript
const loaded = await loadContent(contentId);
const hydrated = hydrateCanvas(loaded);
// hydrated.elements and hydrated.settings are always valid
setCanvasElements(hydrated.elements);
setCanvasSettings(hydrated.settings);
```

## Testing

1. **Preview Display:**
   - Save a design with a thumbnail URL
   - Check that the design library shows the thumbnail
   - Verify "No preview" shows for designs without thumbnails

2. **Loading:**
   - Click "Load" on a design card
   - Verify the design loads into the canvas
   - Check that all elements and settings are populated correctly

## Next Steps (Frontend)

If previews still don't show:
1. Verify the frontend is reading `thumbnailUrl` from the list response
2. Ensure the image src is set correctly
3. Check browser console for image loading errors

If loading still fails:
1. Check the frontend validation logic
2. Ensure all required fields are being handled
3. Verify the `hydrateCanvas` helper is working correctly

