# S3 + CloudFront Migration Summary

## Overview
Migrated Cardbey Core API from local filesystem storage (`/uploads`) to AWS S3 with CloudFront CDN. All new uploads are now stored in S3 and served via CloudFront URLs. Legacy local files still work but are no longer checked for CloudFront URLs.

## Files Created

### `src/lib/s3Client.js`
S3 helper module with:
- `S3Client` initialization using AWS credentials from environment variables
- `makeMediaKey(originalName)` - generates unique S3 keys in format `media/{timestamp}-{random}.{ext}`
- `uploadBufferToS3(buffer, originalName, mimeType)` - uploads buffer to S3 and returns CloudFront URL

**Key Changes:**
- Uses AWS SDK v3 (`@aws-sdk/client-s3`)
- Reads `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `CDN_BASE_URL` from environment
- Returns CloudFront URL: `${CDN_BASE_URL}/${key}`

## Files Modified

### `src/routes/upload.js`
**Changes:**
- Switched from `multer.diskStorage()` to `multer.memoryStorage()` - files are buffered in memory
- Uploads directly to S3 using `uploadBufferToS3()` instead of saving to `/uploads`
- Extracts metadata from buffer (images) or temporary file (videos)
- Stores CloudFront URL in database `url` field
- Video optimization now uploads optimized version to S3

**Flow:**
1. File uploaded → buffered in memory
2. Metadata extracted (width, height, duration)
3. Buffer uploaded to S3 → receives CloudFront URL
4. Media record created with CloudFront URL
5. Video optimization runs in background → uploads optimized version to S3

### `src/utils/publicUrl.js`
**Changes:**
- Added `isCloudFrontUrl(url)` helper - detects CloudFront/S3 URLs
- Updated `fileExistsOnDisk()` to return `true` for CloudFront URLs (no filesystem check)
- CloudFront URLs are treated as always available

**Logic:**
- Absolute URLs starting with `http://` or `https://` containing CloudFront domain → CloudFront URL
- CloudFront URLs skip filesystem existence checks

### `src/routes/screens.js` (Playlist Builder)
**Changes:**
- Skips filesystem checks for CloudFront URLs - treats them as always available
- Only checks filesystem for legacy local files (paths starting with `/uploads/`)
- Clears `missingFile` flag for CloudFront URLs
- Logs CloudFront vs legacy URL counts

**Flow:**
1. Filter items: CloudFront URLs → always included
2. Legacy local files → check filesystem if `missingFile` flag is set
3. Map items: prefer optimized URL for videos, fallback to original
4. For CloudFront URLs, use URL directly; for legacy, resolve with `resolvePublicUrl()`
5. Log summary: total items, CloudFront count, legacy count

### `src/routes/player.js` (Player Config)
**Changes:**
- Same logic as playlist builder
- Skips filesystem checks for CloudFront URLs
- Only verifies legacy local files on disk

### `package.json`
**Changes:**
- Added dependency: `@aws-sdk/client-s3`

## Environment Variables Required

```bash
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=ap-southeast-2
S3_BUCKET_NAME=cardbey
CDN_BASE_URL=https://d2pj1uqw9p1zhj.cloudfront.net
```

## Migration Details

### New Upload Flow
1. **Upload Request** → `POST /api/upload/playlist-media`
2. **File buffered** in memory (multer.memoryStorage)
3. **Metadata extracted** from buffer/temp file
4. **Upload to S3** → `uploadBufferToS3()` returns CloudFront URL
5. **Media record created** with CloudFront URL in `url` field
6. **Video optimization** (async) → optimized video uploaded to S3 → `optimizedUrl` updated

### Playlist Building Flow
1. **Fetch playlist items** from database
2. **Filter items:**
   - CloudFront URLs → always included (no filesystem check)
   - Legacy local files → check filesystem if `missingFile` flag set
3. **Map items:**
   - Videos: prefer `optimizedUrl` (CloudFront), fallback to `url` (CloudFront)
   - Legacy: check filesystem, resolve with `resolvePublicUrl()`
4. **Return playlist** with CloudFront URLs

### Backward Compatibility
- Legacy local files (`/uploads/...`) still work
- Filesystem checks only applied to legacy paths
- CloudFront URLs never checked on filesystem
- Legacy `missingFile` flags automatically cleared for CloudFront URLs

## Testing Checklist

- [ ] Upload test video → verify CloudFront URL in response
- [ ] Upload test image → verify CloudFront URL in response
- [ ] Check video optimization → verify optimized URL is also CloudFront
- [ ] Test playlist endpoint → verify CloudFront URLs in playlist items
- [ ] Verify legacy playlists still work (if any)
- [ ] Check logs for CloudFront URL counts

## Logging

### Upload Logs
- `[S3] Uploaded {key} ({mimeType}, {size} bytes)` - on successful S3 upload
- `[Media] Upload saved to S3: {key} -> {cloudFrontUrl}` - media record created

### Playlist Logs
- `[PLAYLIST] Built playlist for screen {id}: {count} items ({cloudfront} CloudFront, {legacy} legacy)` - playlist summary

## Benefits

1. **Persistent Storage** - Files survive server restarts/deploys
2. **CDN Delivery** - CloudFront provides fast global delivery
3. **Scalable** - S3 handles unlimited storage and bandwidth
4. **No Ephemeral Issues** - Render's ephemeral filesystem no longer a problem
5. **Backward Compatible** - Legacy local files still work

## Next Steps (Optional)

1. Migrate legacy files to S3 (bulk migration script)
2. Remove `/uploads` directory serving from `server.js`
3. Update import route to use S3 (if needed)
4. Update AI service `downloadAndSaveImage()` to use S3 (if needed)


