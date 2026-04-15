# Filter Studio Export Fix

## Issue
Export from FilterStudio was failing with:
- `DOMException: The operation is insecure`
- Canvas taint error when trying to export images from different origins

## Root Cause
The canvas becomes "tainted" when an image from a different origin is drawn to it without proper CORS headers. Once tainted, `toBlob()` and `toDataURL()` will throw security errors.

## Fix Applied

### 1. Improved Canvas Handling
- Added `willReadFrequently: true` to canvas context creation for better performance
- Clear canvas before drawing to avoid residual data
- Use fresh export canvas to isolate taint issues
- Better error messages for CORS/taint issues

### 2. Content Creation on Export
**File:** `src/components/studio/FilterStudio.jsx`

When "Apply & Save" or "Save as PNG" is clicked:
1. **Upload image** to `/api/uploads/create` (gets Media record)
2. **Create Content record** via `saveDesign()` → `POST /api/contents`
3. **Backend automatically registers MIEntity** (via contents.js route)
4. **Return asset** with `contentId` and uploaded URL

**Flow:**
```
User clicks "Apply & Save"
→ exportAndUpload() called
→ Canvas processed with filters
→ Blob created from canvas
→ Upload to /api/uploads/create
→ Create Content via saveDesign()
→ Backend POST /api/contents registers MIEntity
→ Return exported asset with contentId
```

### 3. Error Handling
- Clear error messages for CORS issues
- Graceful fallback if Content creation fails (upload still succeeds)
- User-friendly alerts explaining the issue

## CORS Requirements

For FilterStudio to work with images from different origins:
1. Image server must send `Access-Control-Allow-Origin` header
2. Image must load with `crossOrigin="anonymous"` (already set)
3. Backend must allow CORS for upload endpoints (already configured)

## Testing

1. **Test with same-origin image:**
   - Should export successfully
   - Should create Content record
   - Should register MIEntity

2. **Test with cross-origin image (with CORS):**
   - Should export successfully
   - Should create Content record

3. **Test with cross-origin image (without CORS):**
   - Should show clear error message
   - Should explain CORS requirement

## Files Modified

- `src/components/studio/FilterStudio.jsx`
  - Improved canvas handling
  - Added Content creation on export
  - Better error messages
  - Wired to saveDesign() API

## Next Steps

If CORS issues persist:
1. Ensure image URLs are proxied through backend
2. Or configure image server to send CORS headers
3. Or use backend image processing instead of client-side canvas

## Related Documentation

- **[MI_PROCESS_FLOW.md](./MI_PROCESS_FLOW.md)** - Complete MI process flows, including FilterStudio export → Content → MIEntity
