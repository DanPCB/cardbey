# Video URL Normalization Fix

## Problem
- Core DEV server runs at `http://192.168.1.12:3001`
- Tablets/TVs correctly use this as API host
- However, playlist items contained video URLs with old IP: `http://192.168.1.9:3001/uploads/media/<file>.mp4`
- This caused "Error: Source error" and Player State remained IDLE

## Root Cause
1. Database stored absolute URLs with old IP addresses
2. Hardcoded IP `192.168.1.9:3001` in `src/engines/device/heartbeat.js`
3. Playlist endpoint used URLs as-is from database without normalizing to current server origin

## Solution

### 1. Unified URL Helper Functions (`src/utils/publicUrl.js`)

Added two new functions:

#### `getBaseUrlFromRequest(req)`
- Gets base URL from current request
- Priority: `PUBLIC_API_BASE_URL` env var → X-Forwarded headers → request protocol/host
- Always uses current server origin

#### `buildMediaUrl(urlOrPath, req)`
- Normalizes media URLs to use current server origin
- Extracts relative path from old absolute URLs (if they're local)
- Preserves CloudFront/S3 URLs unchanged
- Always rebuilds local URLs using current request origin

**Key Features:**
- Detects local IP addresses (192.168.x.x, 10.x.x.x, localhost)
- Extracts path from old absolute URLs
- Rebuilds URLs with current server origin
- Handles CloudFront/S3 URLs (returns unchanged)

### 2. Updated Playlist Endpoint (`src/routes/deviceEngine.js`)

**Changes:**
- Replaced manual URL resolution logic with `buildMediaUrl()`
- Now normalizes old absolute URLs to use current server origin
- Added detailed logging for URL generation:
  ```javascript
  console.log(`[Device Playlist] Built item URL`, {
    deviceId,
    playlistId: playlist.id,
    itemId: item.id,
    assetId: asset.id,
    originalUrl: itemUrl,
    resolvedUrl,
    isCloudFront: isCloudFrontUrl(resolvedUrl),
  });
  ```

### 3. Fixed Hardcoded IP (`src/engines/device/heartbeat.js`)

**Before:**
```javascript
const mockReq = { protocol: 'http:', get: () => '192.168.1.9:3001' };
itemUrl = resolvePublicUrl(itemUrl, mockReq);
```

**After:**
```javascript
const mockReq = ctx?.req || null; // Use req from context if available
itemUrl = buildMediaUrl(itemUrl, mockReq);
```

Now uses `buildMediaUrl()` which:
- Uses `PUBLIC_API_BASE_URL` env var if available
- Falls back gracefully if no request object
- No hardcoded IPs

## How It Works

### URL Normalization Flow

1. **Database has old absolute URL:**
   ```
   http://192.168.1.9:3001/uploads/media/video.mp4
   ```

2. **`buildMediaUrl()` detects it's a local IP:**
   - Extracts relative path: `/uploads/media/video.mp4`
   - Gets current server origin from request: `http://192.168.1.12:3001`
   - Rebuilds URL: `http://192.168.1.12:3001/uploads/media/video.mp4`

3. **Response contains correct URL:**
   - Device receives URL with current server IP
   - Video loads successfully

### CloudFront URLs

CloudFront/S3 URLs are preserved unchanged:
- `https://d1234567890.cloudfront.net/media/video.mp4` → unchanged
- No normalization needed for external CDN URLs

## Environment Variables

### `PUBLIC_API_BASE_URL` (Optional)
- If set, always used as base URL for media URLs
- Example: `PUBLIC_API_BASE_URL=http://192.168.1.12:3001`
- Takes priority over request-based origin

### `PUBLIC_BASE_URL` (Fallback)
- Used if `PUBLIC_API_BASE_URL` not set
- Same behavior as before

## Testing

### Verify URL Normalization

1. **Check playlist endpoint logs:**
   ```
   [Device Playlist] Built item URL {
     deviceId: '...',
     playlistId: '...',
     itemId: '...',
     assetId: '...',
     originalUrl: 'http://192.168.1.9:3001/uploads/media/video.mp4',
     resolvedUrl: 'http://192.168.1.12:3001/uploads/media/video.mp4',
     isCloudFront: false
   }
   ```

2. **Verify response URLs:**
   - All URLs should use current server IP (`192.168.1.12:3001` in DEV)
   - No old IP addresses (`192.168.1.9`) in responses

3. **Test video playback:**
   - Videos should load successfully
   - No "Source error" in player

## Future Improvements

### Store Relative Paths in Database (Optional)

Currently, the database stores absolute URLs, but they're normalized at response time. For a more robust solution:

1. **Migration:** Update existing records to store relative paths
2. **Upload Handler:** Store relative paths instead of absolute URLs
3. **Benefits:**
   - URLs always use current server origin
   - No need to normalize old URLs
   - More portable across environments

**Note:** Current solution works without database migration - normalization happens at response time.

## Files Modified

1. `src/utils/publicUrl.js`
   - Added `getBaseUrlFromRequest()`
   - Added `buildMediaUrl()`

2. `src/routes/deviceEngine.js`
   - Updated playlist endpoint to use `buildMediaUrl()`
   - Added URL generation logging

3. `src/engines/device/heartbeat.js`
   - Removed hardcoded IP
   - Uses `buildMediaUrl()` instead

## Backward Compatibility

- ✅ CloudFront URLs preserved unchanged
- ✅ Relative paths still work
- ✅ Existing absolute URLs normalized automatically
- ✅ No breaking changes to API response format

