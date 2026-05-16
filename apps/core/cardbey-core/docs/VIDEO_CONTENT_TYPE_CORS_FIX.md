# Video Content-Type and CORS Headers Fix

## Problem Summary

Two issues were identified with video file serving:

1. **Missing Content-Type Headers**: Static file server only set Content-Type if file extension matched, but failed when:
   - URL had query parameters (e.g., `/uploads/video.mp4?id=123`)
   - File had no extension
   - File was served from a different route

2. **CORS Headers for Video Streaming**: CORS headers were set but:
   - OPTIONS preflight requests weren't explicitly handled
   - Range request headers might not be properly exposed
   - Missing `If-Range` header support

## Fixes Applied

### 1. Enhanced Content-Type Detection (`src/server.js`)

**Before:**
```javascript
const ext = path.extname(filePath).toLowerCase();
if (ext === '.mp4') {
  res.setHeader('Content-Type', 'video/mp4');
}
// ❌ Failed if URL had query params or no extension
```

**After:**
- Created `detectContentType()` helper function
- Detects Content-Type from file path first (most reliable)
- Falls back to request URL path if file path has no extension
- Handles query parameters by extracting extension from URL path
- Supports more video formats: `.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`, `.flv`, `.m3u8`
- Fallback inference for files without extensions (logs warning)

**Code:**
```javascript
// Middleware to capture request path for Content-Type detection
app.use('/uploads', (req, res, next) => {
  res.locals.requestPath = req.path;
  next();
});

// In setHeaders:
let contentTypeInfo = detectContentType(filePath);

// If no extension in file path, try request URL
if (!contentTypeInfo && res.locals?.requestPath) {
  const urlPath = res.locals.requestPath.split('?')[0].split('#')[0];
  const urlExt = path.extname(urlPath).toLowerCase();
  if (urlExt) {
    contentTypeInfo = detectContentType(`temp${urlExt}`);
  }
}
```

**Impact:**
- ✅ Content-Type always set for video files, even with query params
- ✅ Handles files without extensions (with fallback)
- ✅ Supports more video formats
- ✅ Better error logging for debugging

### 2. Proper CORS Headers for Video Streaming (`src/server.js`)

**Before:**
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Range');
// ❌ No OPTIONS handler, missing headers
```

**After:**
- Added explicit OPTIONS preflight handler
- Enhanced CORS headers with all required fields for Range requests
- Added `If-Range` header support
- Exposed `Content-Range`, `Accept-Ranges`, `Content-Length`, `Content-Type`
- Added preflight caching (`Access-Control-Max-Age: 86400`)

**Code:**
```javascript
// Handle OPTIONS preflight requests for CORS
app.options('/uploads/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, If-Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// In setHeaders:
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, If-Range');
res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
```

**Impact:**
- ✅ OPTIONS preflight requests properly handled
- ✅ Range requests work for video seeking/scrubbing
- ✅ All required headers exposed to client
- ✅ Preflight caching reduces overhead

### 3. Range Request Support (`src/server.js`)

**Added:**
- `Accept-Ranges: bytes` header for all video files
- Proper handling of Range requests (Express static middleware handles this automatically)
- `If-Range` header support in CORS

**Code:**
```javascript
if (contentTypeInfo.supportsRange) {
  res.setHeader('Accept-Ranges', 'bytes');
}
```

**Impact:**
- ✅ Video seeking/scrubbing works properly
- ✅ Partial content requests (206 responses) supported
- ✅ Efficient video streaming

## Supported Video Formats

The following video formats are now properly detected and served:

| Extension | Content-Type | Range Support |
|-----------|--------------|---------------|
| `.mp4`, `.m4v` | `video/mp4` | ✅ Yes |
| `.webm` | `video/webm` | ✅ Yes |
| `.mov` | `video/quicktime` | ✅ Yes |
| `.avi` | `video/x-msvideo` | ✅ Yes |
| `.mkv` | `video/x-matroska` | ✅ Yes |
| `.flv` | `video/x-flv` | ✅ Yes |
| `.m3u8` | `application/vnd.apple.mpegurl` | ❌ No (HLS playlist) |

## Testing

### Test Cases

1. **Video with query params:**
   - ✅ `GET /uploads/video.mp4?id=123` → Content-Type: `video/mp4`
   - ✅ Range requests work
   - ✅ CORS headers present

2. **Video without extension:**
   - ✅ Falls back to path inference
   - ✅ Logs warning
   - ✅ Sets Content-Type if path suggests video

3. **OPTIONS preflight:**
   - ✅ `OPTIONS /uploads/video.mp4` → 204 with CORS headers
   - ✅ Preflight cached for 24 hours

4. **Range requests:**
   - ✅ `GET /uploads/video.mp4` with `Range: bytes=0-1023` → 206 Partial Content
   - ✅ `Content-Range` header present
   - ✅ Video seeking works in ExoPlayer

5. **Cross-origin requests:**
   - ✅ CORS headers allow cross-origin access
   - ✅ Range requests work from different origin

## Files Modified

1. **src/server.js**
   - Added `detectContentType()` helper function
   - Added OPTIONS preflight handler
   - Enhanced `setHeaders` callback in static middleware
   - Added middleware to capture request path
   - Improved Content-Type detection logic
   - Enhanced CORS headers

## Impact

- ✅ **No more "format not supported" errors** - Content-Type always set
- ✅ **Video seeking works** - Range requests properly supported
- ✅ **Cross-origin video loading works** - CORS headers complete
- ✅ **Better error handling** - Warnings for files without extensions
- ✅ **More video formats supported** - Added `.avi`, `.mkv`, `.flv`, `.m3u8`

## Backward Compatibility

- ✅ All existing valid video URLs continue to work
- ✅ No breaking changes to API
- ✅ Enhanced functionality (more formats, better CORS)

## Recommendations

1. **Always use file extensions** for uploaded videos (best practice)
2. **Monitor warnings** for files without extensions
3. **Use HTTPS** in production for secure video delivery
4. **Consider CDN** for video delivery (CloudFront/S3) for better performance

## Notes

- Using `Access-Control-Allow-Origin: *` is fine for public content
- If credentials are needed, set specific origin instead of `*`
- Express static middleware automatically handles Range requests (206 responses)
- We just need to set `Accept-Ranges: bytes` so clients know it's supported

