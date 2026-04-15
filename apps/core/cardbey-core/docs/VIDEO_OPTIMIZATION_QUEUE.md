# Video Optimization Queue System

## Overview
Asynchronous video optimization system that processes uploaded videos in the background. Videos are optimized for streaming (720p, ~6-8 Mbps) and stored in S3 with CloudFront URLs.

## Architecture

### Flow
```
1. Upload Video → S3 (original)
   ↓
2. Save Media Record (isOptimized=false)
   ↓
3. Return Response Immediately
   ↓
4. Queue Optimization Job (async)
   ↓
5. Queue Processor: Download from S3 → Optimize → Upload to S3 → Update DB
```

### Components

#### 1. Queue System (`src/jobs/videoOptimizerQueue.js`)
- **Lightweight in-memory queue** (no Redis needed)
- Processes jobs one at a time with 5-second intervals
- Automatic retry on failure (job removed from queue)
- Graceful shutdown handling

**Functions:**
- `enqueueOptimizeVideo(mediaId, s3Key, mimeType)` - Add job to queue
- `getQueueStatus()` - Get current queue status (for debugging)

#### 2. Video Optimizer Service (`src/services/videoOptimizer.js`)
- Downloads video from S3
- Optimizes using ffmpeg (720p, H.264/AAC, ~6-8 Mbps)
- Uploads optimized version back to S3
- Returns optimized S3 key and CloudFront URL

**Optimization Settings:**
- Max height: 720px (preserves aspect ratio)
- Video bitrate: 6 Mbps
- Audio bitrate: 192 kbps
- Codec: H.264 (libx264) / AAC
- Profile: High profile, Level 4.0
- Fast start: Enabled (for streaming)

#### 3. S3 Helpers (`src/lib/s3Client.js`)
- `downloadFromS3(key)` - Download file from S3 by key
- `uploadOptimizedToS3(buffer, optimizedKey)` - Upload optimized video with predefined key
- `makeOptimizedKey(originalKey)` - Generate optimized key: `optimized/{filename}.mp4`

#### 4. Upload Route (`src/routes/upload.js`)
- Detects video uploads (`mimeType.startsWith("video/")`)
- Uploads original to S3 immediately
- Returns response without waiting for optimization
- Queues optimization job asynchronously

#### 5. Playlist Builder (`src/routes/screens.js`, `src/routes/player.js`)
- **Prefers optimized URL** if `isOptimized === true`
- Falls back to original if optimization pending or failed
- Logs which URL is being used

## Database Schema

```prisma
model Media {
  url          String
  optimizedUrl String?   @db.VarChar(500)  // CloudFront URL for optimized video
  optimizedKey String?   @db.VarChar(500)  // S3 key for optimized video
  isOptimized  Boolean   @default(false)   // Optimization complete flag
  optimizedAt  DateTime?                   // Timestamp when optimization completed
}
```

## Logging Examples

### Upload
```
[Media] Upload saved to S3: media/1763947327269-abc123.mp4 -> https://d2pj1uqw9p1zhj.cloudfront.net/media/1763947327269-abc123.mp4
[OPTIMIZER] Queued optimization job for asset: cmicjl6oj000djh1plzwb9deq
```

### Queue Processing
```
[OptimizerQueue] Queued optimization job for media cmicjl6oj000djh1plzwb9deq (queue size: 1)
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

### Playlist Building
```
[PLAYLIST] Using original video for asset cmicjl6oj000djh1plzwb9deq (optimization pending)
[PLAYLIST] Using optimized video for asset cmicjl6oj000djh1plzwb9deq
[PLAYLIST] Using original video for asset cmicjl6oj000djh1plzwb9deq (no optimized version)
[PLAYLIST] Built playlist for screen cmibidol60005o01q30g7msyb: 5 items (5 CloudFront, 0 legacy)
```

## Migration

Run Prisma migration to add new fields:
```bash
npx prisma migrate dev -n add_video_optimization_fields
```

Or manually add to schema:
```prisma
optimizedKey String?   @db.VarChar(500)
isOptimized  Boolean   @default(false)
optimizedAt  DateTime?
```

Then create migration:
```bash
npx prisma migrate dev
```

## Benefits

1. **Non-blocking uploads** - Response returns immediately
2. **Automatic optimization** - Videos optimized in background
3. **Better streaming** - Optimized videos are smaller and faster to stream
4. **Dual storage** - Original and optimized versions both in S3
5. **Gradual upgrade** - Playlists automatically use optimized version when ready
6. **No Redis needed** - Simple in-memory queue works for moderate workloads

## Future Enhancements

- Retry logic for failed optimizations
- Priority queue for urgent videos
- Optimization progress tracking
- Admin endpoint to manually trigger optimization
- Batch optimization for existing videos


