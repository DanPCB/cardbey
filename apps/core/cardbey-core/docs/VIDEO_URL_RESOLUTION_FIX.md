# Video URL Resolution Fix

## Problem Summary

The playlist endpoint (`GET /api/device/:deviceId/playlist/full`) had several URL resolution issues that could cause videos to fail loading:

1. **Malformed URLs when `PUBLIC_BASE_URL` not set**: If `PUBLIC_BASE_URL` env var was not set and `req` was null, `resolvePublicUrl()` would return a relative path like `/uploads/video.mp4` instead of a full URL.

2. **HTTP instead of HTTPS in production**: When `PUBLIC_BASE_URL` was not set, the function used `req.protocol` which might be `http://` even in production behind a proxy, causing mixed content issues.

3. **CloudFront URL detection too strict**: The `isCloudFrontUrl()` function might not correctly identify all CloudFront/S3 URLs, causing them to be incorrectly modified.

4. **No validation**: Malformed URLs were returned to the client, causing ExoPlayer to fail with 404 errors.

## Fixes Applied

### 1. Enhanced Protocol Detection (`src/utils/publicUrl.js`)

**Before:**
```javascript
const protocol = req.protocol || 'http';
```

**After:**
```javascript
// Prefer X-Forwarded-Proto (from proxy) for protocol, fallback to req.protocol
// In production behind proxy, X-Forwarded-Proto should be 'https'
const forwardedProto = req.get('X-Forwarded-Proto');
const protocol = forwardedProto || req.protocol || 'http';
```

**Impact:**
- Now respects `X-Forwarded-Proto` header from reverse proxy
- Ensures HTTPS is used in production when behind a proxy
- Fixes mixed content issues

### 2. Improved CloudFront URL Detection (`src/utils/publicUrl.js`)

**Before:**
- Simple string matching for `.cloudfront.net` and `.s3.`
- Could miss edge cases

**After:**
- Uses `URL` object for proper hostname parsing
- Checks against `CDN_BASE_URL` env var with proper hostname matching
- Enhanced pattern matching for S3/CloudFront domains
- Handles subdomain patterns correctly

**Impact:**
- CloudFront URLs are never incorrectly modified
- More robust detection of CDN URLs

### 3. URL Validation in Playlist Endpoint (`src/routes/deviceEngine.js`)

**Added:**
- Validates absolute URLs before using them
- Validates resolved URLs after `resolvePublicUrl()` call
- Skips items with malformed URLs instead of returning broken URLs
- Comprehensive error logging for debugging

**Code:**
```javascript
// Check if URL is already absolute and valid
const isAbsoluteUrl = itemUrl && (itemUrl.startsWith('http://') || itemUrl.startsWith('https://'));

if (isAbsoluteUrl) {
  // Validate URL format
  try {
    new URL(itemUrl);
    resolvedUrl = itemUrl; // Use as-is
  } catch (urlError) {
    console.error(`[Device Engine] Invalid absolute URL format:`, { itemUrl });
    return null; // Skip malformed absolute URL
  }
} else if (!isCloudFrontUrl(itemUrl)) {
  // Relative URL - resolve to absolute
  resolvedUrl = resolvePublicUrl(itemUrl, req);
  
  // Validate resolved URL
  if (!resolvedUrl || (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://'))) {
    console.error(`[Device Engine] Failed to resolve URL to absolute:`, {
      originalUrl: itemUrl,
      resolvedUrl,
      hasPublicBaseUrl: !!process.env.PUBLIC_BASE_URL,
    });
    return null; // Skip item
  }
  
  // Additional validation
  try {
    new URL(resolvedUrl);
  } catch (urlError) {
    console.error(`[Device Engine] Resolved URL is invalid format:`, { originalUrl: itemUrl, resolvedUrl });
    return null;
  }
}
```

**Impact:**
- No malformed URLs are returned to the client
- Items with unresolvable URLs are skipped (logged) instead of breaking playback
- Better error messages for debugging

### 4. Enhanced Error Logging (`src/utils/publicUrl.js`)

**Before:**
```javascript
console.warn('[publicUrl] Cannot resolve relative URL: no valid PUBLIC_BASE_URL and no req object');
return url; // Returns relative path (broken)
```

**After:**
```javascript
console.error('[publicUrl] CRITICAL: Cannot resolve relative URL - no valid PUBLIC_BASE_URL and no req object', {
  url,
  hasBase: !!base,
  hasReq: !!req,
});
return url; // Still returns relative path, but caller should validate
```

**Impact:**
- More detailed error logging
- Caller (playlist endpoint) now validates and skips invalid URLs

## Testing

### Test Cases

1. **Production with `PUBLIC_BASE_URL` set:**
   - ✅ Relative URLs resolve to `https://PUBLIC_BASE_URL/path`
   - ✅ Absolute URLs matching base are preserved
   - ✅ CloudFront URLs are never modified

2. **Production without `PUBLIC_BASE_URL` (behind proxy):**
   - ✅ Uses `X-Forwarded-Proto: https` header
   - ✅ Uses `X-Forwarded-Host` header
   - ✅ Resolves to HTTPS URLs

3. **Development without `PUBLIC_BASE_URL`:**
   - ✅ Uses `req.protocol` and `req.host`
   - ✅ Resolves to `http://localhost:3001/path`

4. **Malformed URLs:**
   - ✅ Absolute URLs with invalid format are skipped
   - ✅ Relative URLs that can't be resolved are skipped
   - ✅ Error logs provide debugging information

5. **CloudFront URLs:**
   - ✅ Never modified regardless of `PUBLIC_BASE_URL` setting
   - ✅ Correctly detected by enhanced pattern matching

## Files Modified

1. **src/utils/publicUrl.js**
   - Enhanced `resolvePublicUrl()` to respect `X-Forwarded-Proto`
   - Enhanced `buildPublicUrl()` to respect `X-Forwarded-Proto`
   - Improved `isCloudFrontUrl()` with better pattern matching
   - Better error logging

2. **src/routes/deviceEngine.js**
   - Added URL validation in playlist endpoint
   - Skips items with malformed URLs
   - Comprehensive error logging

## Environment Variables

### Required for Production

```bash
PUBLIC_BASE_URL=https://your-domain.com
```

### Optional

```bash
CDN_BASE_URL=https://your-cdn.cloudfront.net  # For CloudFront URL detection
```

## Impact

- ✅ **No more 404 errors** from malformed URLs
- ✅ **HTTPS in production** (respects `X-Forwarded-Proto`)
- ✅ **CloudFront URLs preserved** (never modified)
- ✅ **Better error handling** (skips bad items instead of breaking)
- ✅ **Improved debugging** (comprehensive error logs)

## Backward Compatibility

- ✅ All existing valid URLs continue to work
- ✅ CloudFront URLs are still never modified
- ✅ Relative URLs still resolve correctly when `PUBLIC_BASE_URL` is set
- ✅ No breaking changes to API response format

## Recommendations

1. **Always set `PUBLIC_BASE_URL` in production** to ensure consistent HTTPS URLs
2. **Monitor error logs** for `[Device Engine] Failed to resolve URL` messages
3. **Set `CDN_BASE_URL`** if using CloudFront for better URL detection
4. **Ensure reverse proxy sets `X-Forwarded-Proto: https`** header in production

