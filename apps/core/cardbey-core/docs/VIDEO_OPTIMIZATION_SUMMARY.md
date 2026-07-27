# Video Optimization Queue Implementation - Complete Summary

## Files Created

### 1. `src/services/videoOptimizer.js`
**Purpose:** Video optimization service that uses ffmpeg to optimize videos for streaming.

**Key Functions:**
- `optimizeVideo(buffer, originalName)` - Optimizes video buffer using ffmpeg
  - Settings: 720p max, 6 Mbps video, 192 kbps audio, H.264/AAC, fast preset
  - Returns optimized buffer
- `optimizeVideoFromS3(originalS3Key)` - Downloads from S3, optimizes, uploads optimized version
  - Flow: Download → Optimize → Upload → Return CloudFront URL

### 2. `src/jobs/videoOptimizerQueue.js`
**Purpose:** Lightweight in-memory queue for asynchronous video optimization.

**Key Functions:**
- `enqueueOptimizeVideo(mediaId, s3Key, mimeType)` - Adds job to queue
- `getQueueStatus()` - Returns queue status (for debugging)
- Internal processor runs jobs one at a time with 5-second intervals

**Queue Behavior:**
- Processes one job at a time
- Validates media exists before processing
- Skips if already optimized
- Automatically stops when queue is empty

## Files Modified

### 3. `prisma/schema.prisma`
**Added Fields to Media Model:**
```prisma
optimizedKey String?   @db.VarChar(500)  // S3 key: optimized/{filename}.mp4
isOptimized  Boolean   @default(false)   // Optimization complete flag
optimizedAt  DateTime?                   // Completion timestamp
```

**Migration Required:**
```bash
npx prisma migrate dev -n add_video_optimization_fields
```

### 4. `src/lib/s3Client.js`
**Added Functions:**
- `downloadFromS3(key)` - Downloads file from S3 by key, returns Buffer
- `makeOptimizedKey(originalKey)` - Generates optimized key: `optimized/{filename}.mp4`
- `uploadOptimizedToS3(buffer, optimizedKey)` - Uploads optimized video with predefined key
- `extractS3KeyFromUrl(cloudFrontUrl)` - Extracts S3 key from CloudFront URL (utility)

### 5. `src/routes/upload.js`
**Changes:**
- Removed old `optimizeVideoForStreaming()` function (replaced by queue)
- Added queue integration:
  ```javascript
  if (kind === 'VIDEO') {
    const { enqueueOptimizeVideo } = await import('../jobs/videoOptimizerQueue.js');
    enqueueOptimizeVideo(media.id, key, mime);
    console.log(`[OPTIMIZER] Queued optimization job for asset: ${media.id}`);
  }
  ```
- Upload flow now:
  1. Upload original to S3 immediately
  2. Create media record with CloudFront URL
  3. Return response immediately
  4. Queue optimization job (non-blocking)

### 6. `src/routes/screens.js` (Playlist Builder)
**Changes:**
- Updated URL selection logic to prefer `optimizedUrl` if `isOptimized === true`
- Falls back to original if optimization pending or failed
- Added detailed logging:
  - `[PLAYLIST] Using optimized video for asset {id}`
  - `[PLAYLIST] Using original video for asset {id} (optimization pending)`
  - `[PLAYLIST] Using original video for asset {id} (no optimized version)`

### 7. `src/routes/player.js` (Player Config)
**Changes:**
- Same logic as playlist builder
- Prefers optimized URL if `isOptimized === true`
- Logs which URL is being used

## Worker Flow Explanation

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. UPLOAD PHASE (Synchronous - Returns Immediately)         │
├─────────────────────────────────────────────────────────────┤
│ User uploads video                                           │
│   ↓                                                          │
│ Buffer in memory                                             │
│   ↓                                                          │
│ Extract metadata (width, height, duration)                  │
│   ↓                                                          │
│ Upload original to S3 → Get CloudFront URL                  │
│   ↓                                                          │
│ Create Media record:                                         │
│   - url: CloudFront URL (original)                          │
│   - isOptimized: false                                      │
│   - optimizedUrl: null                                      │
│   ↓                                                          │
│ Return response to dashboard                                 │
│   ↓                                                          │
│ Queue optimization job (non-blocking)                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. QUEUE PHASE (Asynchronous - Background Processing)       │
├─────────────────────────────────────────────────────────────┤
│ enqueueOptimizeVideo(mediaId, s3Key, mimeType)             │
│   ↓                                                          │
│ Job added to in-memory queue                                │
│   ↓                                                          │
│ Queue processor starts (if not running)                     │
│   - Checks queue every 5 seconds                            │
│   - Processes one job at a time                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 3. PROCESSING PHASE (Background Worker)                     │
├─────────────────────────────────────────────────────────────┤
│ Queue processor picks up job                                │
│   ↓                                                          │
│ Verify media exists and is a video                          │
│   ↓                                                          │
│ Download original video from S3                             │
│   [S3] Downloaded media/123.mp4 (15MB)                      │
│   ↓                                                          │
│ Optimize video using ffmpeg:                                │
│   - Write to temp file                                      │
│   - Run ffmpeg: 720p, 6 Mbps, H.264/AAC                    │
│   - Progress: 25% → 50% → 75% → 100%                       │
│   - Read optimized buffer                                   │
│   - Clean up temp files                                     │
│   [VideoOptimizer] Optimized: 15MB → 8MB (47% reduction)   │
│   ↓                                                          │
│ Generate optimized S3 key: optimized/123.mp4                │
│   ↓                                                          │
│ Upload optimized video to S3                                │
│   [S3] Uploaded optimized video optimized/123.mp4 (8MB)     │
│   ↓                                                          │
│ Update Media record:                                         │
│   - optimizedUrl: CloudFront URL (optimized)                │
│   - optimizedKey: optimized/123.mp4                         │
│   - isOptimized: true                                       │
│   - optimizedAt: current timestamp                          │
│   [OptimizerQueue] ✅ Optimization completed                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 4. PLAYLIST PHASE (On Request)                              │
├─────────────────────────────────────────────────────────────┤
│ Playlist builder fetches Media records                      │
│   ↓                                                          │
│ For each video item:                                         │
│   - Check isOptimized flag                                  │
│   - If true → Use optimizedUrl (CloudFront)                 │
│   - If false → Use url (original CloudFront)                │
│   ↓                                                          │
│ Log which URL is being used                                 │
│   [PLAYLIST] Using optimized video for asset {id}           │
│   ↓                                                          │
│ Return playlist with CloudFront URLs                        │
└─────────────────────────────────────────────────────────────┘
```

## Logging Output Examples

### Upload Logs
```
[S3] Uploaded media/1763947327269-abc123.mp4 (video/mp4, 15234567 bytes)
[Media] Upload saved to S3: media/1763947327269-abc123.mp4 -> https://d2pj1uqw9p1zhj.cloudfront.net/media/1763947327269-abc123.mp4
[OPTIMIZER] Queued optimization job for asset: cmicjl6oj000djh1plzwb9deq
[OptimizerQueue] Queued optimization job for media cmicjl6oj000djh1plzwb9deq (queue size: 1)
```

### Queue Processing Logs
```
[OptimizerQueue] Starting queue processor
[OptimizerQueue] Processing job for media cmicjl6oj000djh1plzwb9deq (waited 5s)
[S3] Downloaded media/1763947327269-abc123.mp4 (15234567 bytes)
[VideoOptimizer] Starting optimization for S3 key: media/1763947327269-abc123.mp4
[VideoOptimizer] FFmpeg started: ffmpeg -i /tmp/input_123.mp4 -vcodec libx264 ...
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
[PLAYLIST] Built playlist for screen cmibidol60005o01q30g7msyb: 5 items (5 CloudFront, 0 legacy)

// After optimization completes:
[PLAYLIST] Using optimized video for asset cmicjl6oj000djh1plzwb9deq
[PLAYLIST] Built playlist for screen cmibidol60005o01q30g7msyb: 5 items (5 CloudFront, 0 legacy)
```

## Code Examples

### Upload Route Integration
```javascript
// src/routes/upload.js
if (kind === 'VIDEO') {
  const { enqueueOptimizeVideo } = await import('../jobs/videoOptimizerQueue.js');
  enqueueOptimizeVideo(media.id, key, mime);
  console.log(`[OPTIMIZER] Queued optimization job for asset: ${media.id}`);
}
```

### Playlist Builder Logic
```javascript
// src/routes/screens.js
if (kind === 'video') {
  if (media.optimizedUrl && media.isOptimized === true) {
    // Use optimized URL
    rawUrl = media.optimizedUrl;
    console.log(`[PLAYLIST] Using optimized video for asset ${media.id}`);
  } else if (media.optimizedUrl) {
    // Optimization in progress
    rawUrl = originalUrl;
    console.log(`[PLAYLIST] Using original video for asset ${media.id} (optimization pending)`);
  } else {
    // No optimization yet
    rawUrl = originalUrl;
    console.log(`[PLAYLIST] Using original video for asset ${media.id} (no optimized version)`);
  }
}
```

### Queue Job Processing
```javascript
// src/jobs/videoOptimizerQueue.js
async function processNextJob() {
  const job = queue.shift();
  // Verify media exists
  // Download from S3
  // Optimize video
  // Upload optimized to S3
  // Update DB: isOptimized=true, optimizedUrl, optimizedKey, optimizedAt
}
```

## Dependencies

Already installed (no new packages needed):
- `fluent-ffmpeg` - FFmpeg wrapper
- `ffmpeg-static` - Static FFmpeg binary
- `ffprobe-static` - Static FFprobe binary
- `@aws-sdk/client-s3` - AWS S3 SDK v3

## Database Migration

Run migration to add new fields:
```bash
npx prisma migrate dev -n add_video_optimization_fields
```

Or manually create migration file and run:
```bash
npx prisma migrate deploy
```

## Testing Checklist

- [ ] Upload a test video → Verify original uploaded immediately
- [ ] Check logs → Verify optimization job queued
- [ ] Wait ~30-60 seconds → Verify optimization completes
- [ ] Check database → Verify `isOptimized=true`, `optimizedUrl` set
- [ ] Check S3 → Verify optimized file exists in `optimized/` prefix
- [ ] Request playlist → Verify optimized URL used in playlist
- [ ] Check logs → Verify `[PLAYLIST] Using optimized video` message

## Key Features

✅ **Non-blocking uploads** - Response returns immediately
✅ **Automatic optimization** - All videos queued automatically
✅ **Dual S3 storage** - Original and optimized versions
✅ **Smart URL selection** - Playlists auto-upgrade to optimized URLs
✅ **Lightweight queue** - No Redis needed, simple in-memory queue
✅ **CloudFront delivery** - Both original and optimized via CDN
✅ **No filesystem dependency** - All files in S3, no local disk checks


