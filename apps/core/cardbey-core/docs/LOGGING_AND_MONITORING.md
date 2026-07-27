# Logging and Monitoring System

## Overview
Structured logging system for Cardbey Core with request correlation IDs and component-based logging.

## Logger Utility (`src/lib/logger.js`)

### Functions
- `info(component, message, metadata, requestId)` - INFO level logs
- `warn(component, message, metadata, requestId)` - WARN level logs
- `error(component, message, metadata, requestId)` - ERROR level logs
- `debug(component, message, metadata, requestId)` - DEBUG level logs (only in development)
- `createLogger(defaultComponent, requestId)` - Create logger instance with bound component/requestId

### Log Format
```
[2025-11-24T10:00:00.000Z] [INFO] [UPLOAD] Upload succeeded {"assetId":"...","key":"media/....mp4","requestId":"abc123"}
```

Format: `[timestamp] [LEVEL] [COMPONENT] message {metadata}`

## Request ID Middleware (`src/middleware/requestId.js`)

- Generates unique request ID (8-character hex) for each request
- Attaches to `req.requestId`
- Adds `X-Request-ID` header to responses
- Supports `X-Request-ID` header from clients for distributed tracing

## Component Logging

### UPLOAD Component
**Logs:**
- `S3 upload succeeded` - When file uploaded to S3
  - Metadata: `{ key, mimeType, size, bucket }`
- `S3 upload failed` - When upload fails
  - Metadata: `{ errorMessage, originalName, mimeType, key }`
- `Asset record created` - When media record created in DB
  - Metadata: `{ assetId, type, url, storageKey, mimeType, sizeBytes, requestId }`
- `Upload failed` - When upload route fails
  - Metadata: `{ errorMessage, originalName, mimeType, requestId }`

### PLAYLIST Component
**Logs:**
- `Building playlist for screen` - When playlist request received
  - Metadata: `{ screenId, full: true/false, requestId, userAgent, ip }`
- `Playlist built` - After playlist built
  - Metadata: `{ screenId, playlistId, itemCount, videoCount, imageCount, usingOptimizedCount, usingOriginalCount, missingItemsFiltered, requestId }`
- `Skipping playlist item` - When item skipped (missing file, etc.)
  - Metadata: `{ screenId, playlistItemId, mediaId, reason, path, requestId }`

### OPTIMIZER Component
**Logs:**
- `Optimization job queued` - When job added to queue
  - Metadata: `{ assetId, storageKey, mimeType, queueSize, requestId }`
- `Optimization started` - When job processing begins
  - Metadata: `{ assetId, storageKey, waitTimeMs }`
- `Optimization finished` - When optimization completes successfully
  - Metadata: `{ assetId, originalKey, optimizedKey, optimizedUrl, durationMs }`
- `Optimization failed` - When optimization fails
  - Metadata: `{ assetId, storageKey, errorMessage, errorStack, durationMs }`
- `S3 download succeeded` - When downloading from S3
  - Metadata: `{ key, size }`
- `S3 optimized upload succeeded` - When optimized video uploaded
  - Metadata: `{ key, size, bucket }`
- `FFmpeg optimization started` - When ffmpeg starts
  - Metadata: `{ originalName, command }`
- `Optimization progress` - Progress updates (25%, 50%, 75%, 100%)
  - Metadata: `{ originalName, percent }`
- `Video optimization size reduction` - After optimization
  - Metadata: `{ originalName, originalSize, optimizedSize, reductionPercent }`

### SCREENS Component
**Logs:**
- `Screen fetched playlist` - When screen/TV app fetches playlist
  - Metadata: `{ screenId, userAgent, ip, playlistItems, requestId }`
- `Screen heartbeat` - When screen sends heartbeat
  - Metadata: `{ screenId, status, wasOffline, requestId }`

### S3_CLEANUP Component
**Logs:**
- `Starting S3 cleanup` - When cleanup starts
  - Metadata: `{ deleteOriginalAfterDays, deleteUnusedAfterDays, dryRun }`
- `Starting cleanup of original videos` - Original video cleanup phase
- `Deleted S3 object` - When object deleted (or "Would delete" in dry run)
  - Metadata: `{ key, dryRun }`
- `Finished cleanup of original videos` - Original cleanup complete
  - Metadata: `{ deletedCount, skippedCount, errorCount, dryRun }`
- `Starting cleanup of unused assets` - Unused asset cleanup phase
- `Finished cleanup of unused assets` - Unused cleanup complete
  - Metadata: `{ deletedCount, skippedCount, errorCount, dryRun }`
- `S3 cleanup completed` - Full cleanup summary
  - Metadata: `{ originalVideos: {...}, unusedAssets: {...}, totalDeleted, totalSkipped, totalErrors, durationMs, dryRun }`

## Example Log Flow

### Successful Video Upload
```
[2025-11-24T10:00:00.000Z] [INFO] [UPLOAD] S3 upload succeeded {"key":"media/1763947327269-abc123.mp4","mimeType":"video/mp4","size":15234567,"bucket":"cardbey","requestId":"abc123"}
[2025-11-24T10:00:00.100Z] [INFO] [UPLOAD] Asset record created {"assetId":"cmicjl6oj000djh1plzwb9deq","type":"VIDEO","url":"https://d2pj1uqw9p1zhj.cloudfront.net/media/1763947327269-abc123.mp4","storageKey":"media/1763947327269-abc123.mp4","mimeType":"video/mp4","sizeBytes":15234567,"requestId":"abc123"}
[2025-11-24T10:00:00.200Z] [INFO] [OPTIMIZER] Optimization job queued {"assetId":"cmicjl6oj000djh1plzwb9deq","storageKey":"media/1763947327269-abc123.mp4","mimeType":"video/mp4","queueSize":1,"requestId":"abc123"}
```

### Video Optimization
```
[2025-11-24T10:00:05.000Z] [INFO] [OPTIMIZER] Optimization started {"assetId":"cmicjl6oj000djh1plzwb9deq","storageKey":"media/1763947327269-abc123.mp4","waitTimeMs":5000}
[2025-11-24T10:00:05.100Z] [INFO] [OPTIMIZER] S3 download succeeded {"key":"media/1763947327269-abc123.mp4","size":15234567}
[2025-11-24T10:00:05.200Z] [INFO] [OPTIMIZER] Starting optimization from S3 {"originalKey":"media/1763947327269-abc123.mp4"}
[2025-11-24T10:00:05.300Z] [INFO] [OPTIMIZER] FFmpeg optimization started {"originalName":"1763947327269-abc123.mp4","command":"ffmpeg -i ..."}
[2025-11-24T10:00:30.000Z] [INFO] [OPTIMIZER] Optimization progress {"originalName":"1763947327269-abc123.mp4","percent":25}
[2025-11-24T10:00:55.000Z] [INFO] [OPTIMIZER] Optimization progress {"originalName":"1763947327269-abc123.mp4","percent":50}
[2025-11-24T10:01:20.000Z] [INFO] [OPTIMIZER] Optimization progress {"originalName":"1763947327269-abc123.mp4","percent":75}
[2025-11-24T10:01:45.000Z] [INFO] [OPTIMIZER] FFmpeg optimization completed {"originalName":"1763947327269-abc123.mp4"}
[2025-11-24T10:01:45.100Z] [INFO] [OPTIMIZER] Video optimization size reduction {"originalName":"1763947327269-abc123.mp4","originalSize":15234567,"optimizedSize":8234567,"reductionPercent":46}
[2025-11-24T10:01:45.200Z] [INFO] [OPTIMIZER] S3 optimized upload succeeded {"key":"optimized/1763947327269-abc123.mp4","size":8234567,"bucket":"cardbey"}
[2025-11-24T10:01:45.300Z] [INFO] [OPTIMIZER] Optimized video uploaded to S3 {"originalKey":"media/1763947327269-abc123.mp4","optimizedKey":"optimized/1763947327269-abc123.mp4","optimizedUrl":"https://d2pj1uqw9p1zhj.cloudfront.net/optimized/1763947327269-abc123.mp4"}
[2025-11-24T10:01:45.400Z] [INFO] [OPTIMIZER] Optimization finished {"assetId":"cmicjl6oj000djh1plzwb9deq","originalKey":"media/1763947327269-abc123.mp4","optimizedKey":"optimized/1763947327269-abc123.mp4","optimizedUrl":"https://d2pj1uqw9p1zhj.cloudfront.net/optimized/1763947327269-abc123.mp4","durationMs":105400}
```

### Screen Fetching Playlist
```
[2025-11-24T10:02:00.000Z] [INFO] [PLAYLIST] Building playlist for screen {"screenId":"cmibidol60005o01q30g7msyb","full":true,"requestId":"def456","userAgent":"okhttp/4.12.0","ip":"192.168.1.100"}
[2025-11-24T10:02:00.100Z] [INFO] [PLAYLIST] Playlist built {"screenId":"cmibidol60005o01q30g7msyb","playlistId":"cmicjl6oj000djh1plzwb9deq","itemCount":5,"videoCount":3,"imageCount":2,"usingOptimizedCount":2,"usingOriginalCount":3,"missingItemsFiltered":0,"requestId":"def456"}
[2025-11-24T10:02:00.200Z] [INFO] [SCREENS] Screen fetched playlist {"screenId":"cmibidol60005o01q30g7msyb","userAgent":"okhttp/4.12.0","ip":"192.168.1.100","playlistItems":5,"requestId":"def456"}
```

## S3 Cleanup

### Admin Endpoint
`POST /api/admin/s3-cleanup`

**Query Parameters:**
- `dryRun=true` - Don't actually delete, just log what would be deleted
- `deleteOriginalAfterDays=N` - Days to wait before deleting original videos (default: 30)
- `deleteUnusedAfterDays=N` - Days to wait before deleting unused assets (default: 90)

**Response:**
```json
{
  "ok": true,
  "message": "Cleanup completed",
  "result": {
    "originalVideos": {
      "deletedCount": 5,
      "skippedCount": 10,
      "errorCount": 0
    },
    "unusedAssets": {
      "deletedCount": 3,
      "skippedCount": 20,
      "errorCount": 0
    },
    "totalDeleted": 8,
    "totalSkipped": 30,
    "totalErrors": 0,
    "durationMs": 5000,
    "dryRun": false
  }
}
```

### Cleanup Rules

1. **Original Videos:**
   - Only processes videos with `isOptimized === true`
   - Deletes original if optimized version is older than N days (default: 30)
   - Keeps original if optimized version is too recent

2. **Unused Assets:**
   - Finds assets not referenced in any playlist
   - Deletes if asset is older than N days (default: 90)
   - Deletes both original and optimized versions

### Environment Variables
- `S3_CLEANUP_ORIGINAL_AFTER_DAYS` - Days before deleting original videos (default: 30)
- `S3_CLEANUP_UNUSED_AFTER_DAYS` - Days before deleting unused assets (default: 90)
- `S3_CLEANUP_DRY_RUN` - Set to `true` for dry run mode (default: false)

## Usage

### In Code
```javascript
import { info, error } from '../lib/logger.js';

// Simple logging
info('UPLOAD', 'Upload succeeded', { assetId: '123', key: 'media/file.mp4' }, req.requestId);

// With logger instance
import { createLogger } from '../lib/logger.js';
const logger = createLogger('UPLOAD', req.requestId);
logger.info('Upload succeeded', { assetId: '123' });
```

### Request Correlation
All logs automatically include `requestId` if available from `req.requestId` (set by middleware).

### Debug Logs
Debug logs only appear when:
- `NODE_ENV=development`, or
- `DEBUG=true`


