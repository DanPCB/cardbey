# Video Optimization + Dual S3 Storage Implementation Summary

## Overview
Implemented asynchronous video optimization queue system that processes uploaded videos in the background. Original videos are stored in S3 immediately, and optimized versions are generated and stored separately with CloudFront URLs.

## Files Created

### 1. `src/services/videoOptimizer.js`
**Purpose:** Video optimization service using ffmpeg

**Key Functions:**
- `optimizeVideo(buffer, originalName)` - Optimizes video buffer using ffmpeg
  - Target: ~6-8 Mbps, 720p max height, H.264/AAC
  - Settings: 6 Mbps video, 192 kbps audio, fast preset, faststart enabled
- `optimizeVideoFromS3(originalS3Key)` - Downloads from S3, optimizes, uploads optimized version
  - Returns: `{ key, url }` with optimized S3 key and CloudFront URL

**Optimization Settings:**
```javascript
- Video codec: libx264 (H.264)
- Audio codec: AAC
- Max height: 720px (preserves aspect ratio)
- Video bitrate: 6000k (6 Mbps)
- Audio bitrate: 192k
- Preset: fast
- CRF: 23
- Profile: High profile, Level 4.0
- Fast start: Enabled (for streaming)
```

### 2. `src/jobs/videoOptimizerQueue.js`
**Purpose:** Lightweight in-memory queue for video optimization jobs

**Key Functions:**
- `enqueueOptimizeVideo(mediaId, s3Key, mimeType)` - Adds job to queue
- `getQueueStatus()` - Returns queue status for debugging

**Queue Behavior:**
- Processes one job at a time
- Checks queue every 5 seconds
- Automatically stops when queue is empty
- Handles graceful shutdown (SIGINT/SIGTERM)
- Validates media exists before processing
- Skips if already optimized or not a video

**Worker Flow:**
```
1. Verify media exists and is a video
2. Download original video from S3
3. Optimize video using ffmpeg
4. Upload optimized version to S3 (key: optimized/{filename}.mp4)
5. Update DB: optimizedUrl, optimizedKey, isOptimized=true, optimizedAt
```

## Files Modified

### 3. `prisma/schema.prisma`
**Changes:**
- Added `optimizedKey String? @db.VarChar(500)` - S3 key for optimized video
- Added `isOptimized Boolean @default(false)` - Flag indicating optimization complete
- Added `optimizedAt DateTime?` - Timestamp when optimization completed
- Added index on `isOptimized` for efficient querying

**Migration Required:**
```bash
npx prisma migrate dev -n add_video_optimization_fields
```

### 4. `src/lib/s3Client.js`
**Changes:**
- Added `downloadFromS3(key)` - Downloads file from S3 by key
  - Converts S3 stream to buffer
  - Logs download size
- Added `makeOptimizedKey(originalKey)` - Generates optimized key format: `optimized/{filename}.mp4`
- Added `uploadOptimizedToS3(buffer, optimizedKey)` - Uploads optimized video with predefined key
  - Returns CloudFront URL

**New Functions:**
```javascript
downloadFromS3(key) → Buffer
makeOptimizedKey("media/123.mp4") → "optimized/123.mp4"
uploadOptimizedToS3(buffer, "optimized/123.mp4") → { key, url }
```

### 5. `src/routes/upload.js`
**Changes:**
- Removed old `optimizeVideoForStreaming()` function
- Added queue integration: imports and calls `enqueueOptimizeVideo()`
- Video uploads now:
  1. Upload original to S3 immediately
  2. Save media record with CloudFront URL
  3. Return response immediately
  4. Queue optimization job (non-blocking)

**Upload Flow:**
```javascript
if (kind === 'VIDEO') {
  const { enqueueOptimizeVideo } = await import('../jobs/videoOptimizerQueue.js');
  enqueueOptimizeVideo(media.id, key, mime);
  console.log(`[OPTIMIZER] Queued optimization job for asset: ${media.id}`);
}
```

### 6. `src/routes/screens.js` (Playlist Builder)
**Changes:**
- Updated to prefer `optimizedUrl` if `isOptimized === true`
- Falls back to original if optimization pending (`isOptimized === false`)
- Added logging:
  - `[PLAYLIST] Using optimized video for asset {id}`
  - `[PLAYLIST] Using original video for asset {id} (optimization pending)`
  - `[PLAYLIST] Using original video for asset {id} (no optimized version)`

**URL Selection Logic:**
```javascript
if (kind === 'video') {
  if (media.optimizedUrl && media.isOptimized === true) {
    // Use optimized URL
  } else if (media.optimizedUrl) {
    // Optimization in progress - use original
  } else {
    // No optimization yet - use original
  }
}
```

### 7. `src/routes/player.js` (Player Config)
**Changes:**
- Same logic as playlist builder
- Prefers optimized URL if `isOptimized === true`
- Logs which URL is being used

## Worker Flow Explanation

### Step-by-Step Process

1. **Upload Phase (Synchronous)**
   ```
   User uploads video
   → Buffer in memory
   → Extract metadata (width, height, duration)
   → Upload original to S3 (key: media/{timestamp}-{random}.mp4)
   → Create Media record:
     - url: CloudFront URL for original
     - isOptimized: false
     - optimizedUrl: null
   → Return response immediately
   ```

2. **Queue Phase (Asynchronous)**
   ```
   enqueueOptimizeVideo(mediaId, s3Key, mimeType)
   → Job added to in-memory queue
   → Queue processor starts (if not running)
   ```

3. **Processing Phase (Background)**
   ```
   Queue processor picks up job
   → Verify media exists and is a video
   → Download original from S3 (downloadFromS3)
   → Optimize video (optimizeVideo):
     - Write to temp file
     - Run ffmpeg optimization
     - Read optimized buffer
     - Clean up temp files
   → Generate optimized key: optimized/{filename}.mp4
   → Upload optimized to S3 (uploadOptimizedToS3)
   → Update Media record:
     - optimizedUrl: CloudFront URL for optimized
     - optimizedKey: S3 key for optimized
     - isOptimized: true
     - optimizedAt: current timestamp
   ```

4. **Playlist Phase (On Request)**
   ```
   Playlist builder checks Media record
   → If isOptimized === true:
     - Use optimizedUrl (CloudFront)
   → Else:
     - Use original url (CloudFront)
   → Return playlist with appropriate URLs
   ```

## Logging Output Examples

### Upload Logs
```
[S3] Uploaded media/1763947327269-abc123.mp4 (video/mp4, 15234567 bytes)
[Media] Upload saved to S3: media/1763947327269-abc123.mp4 -> https://d2pj1uqw9p1zhj.cloudfront.net/media/1763947327269-abc123.mp4
[OPTIMIZER] Queued optimization job for asset: cmicjl6oj000djh1plzwb9deq
```

### Queue Processing Logs
```
[OptimizerQueue] Queued optimization job for media cmicjl6oj000djh1plzwb9deq (queue size: 1)
[OptimizerQueue] Starting queue processor
[OptimizerQueue] Processing job for media cmicjl6oj000djh1plzwb9deq (waited 5s)
[S3] Downloaded media/1763947327269-abc123.mp4 (15234567 bytes)
[VideoOptimizer] Starting optimization for S3 key: media/1763947327269-abc123.mp4
[VideoOptimizer] FFmpeg started: ffmpeg -i ...
[VideoOptimizer] Optimization progress: 25%
[VideoOptimizer] Optimization progress: 50%
[VideoOptimizer] Optimization progress: 75%
[VideoOptimizer] Optimization completed
[VideoOptimizer] Optimized video: 15234567 bytes -> 8234567 bytes (46% reduction)
[S3] Uploaded optimized video optimized/1763947327269-abc123.mp4 (8234567 bytes)
[VideoOptimizer] Optimized video uploaded: optimized/1763947327269-abc123.mp4 -> https://d2pj1uqw9p1zhj.cloudfront.net/optimized/1763947327269-abc123.mp4
[OptimizerQueue] ✅ Optimization completed for media cmicjl6oj000djh1plzwb9deq: optimized/1763947327269-abc123.mp4
```

### Playlist Building Logs
```
[PLAYLIST] Using original video for asset cmicjl6oj000djh1plzwb9deq (optimization pending)
[PLAYLIST] Using optimized video for asset cmicjl6oj000djh1plzwb9deq
[PLAYLIST] Built playlist for screen cmibidol60005o01q30g7msyb: 5 items (5 CloudFront, 0 legacy)
```

## Database Schema

```prisma
model Media {
  id           String    @id @default(cuid())
  url          String                              // CloudFront URL for original
  optimizedUrl String?   @db.VarChar(500)         // CloudFront URL for optimized
  optimizedKey String?   @db.VarChar(500)         // S3 key: optimized/{filename}.mp4
  isOptimized  Boolean   @default(false)          // Optimization complete flag
  optimizedAt  DateTime?                          // Completion timestamp
  kind         MediaKind
  mime         String
  // ... other fields
  
  @@index([isOptimized])
}
```

## Key Features

1. **Non-blocking Uploads** - Response returns immediately, optimization happens in background
2. **Automatic Optimization** - All videos automatically queued for optimization
3. **Dual Storage** - Original and optimized versions both stored in S3
4. **Smart URL Selection** - Playlists automatically use optimized version when ready
5. **Gradual Upgrade** - Original works immediately, optimized version available when ready
6. **No Filesystem Dependency** - All files in S3, no local disk checks for CloudFront URLs
7. **Lightweight Queue** - No Redis needed, simple in-memory queue with interval processing

## Next Steps

1. **Run Migration:**
   ```bash
   npx prisma migrate dev -n add_video_optimization_fields
   ```

2. **Test Upload:**
   - Upload a test video
   - Verify original is uploaded immediately
   - Check queue logs for optimization job
   - Wait for optimization to complete
   - Verify optimized version appears in playlist

3. **Monitor Queue:**
   - Check logs for optimization progress
   - Verify `isOptimized` flag updates in DB
   - Confirm playlists use optimized URLs when available


