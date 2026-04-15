# Media Cleanup Service

## Overview
Service for cleaning up unused or obsolete media assets from S3 to reduce storage costs.

## Functions

### `cleanupOrphanAssets(options)`
Removes assets that are not referenced in any playlist.

**Options:**
- `olderThanDays` (default: 30) - Only delete assets older than N days
- `maxAssets` (default: 500) - Maximum assets to process per run
- `dryRun` (default: false) - If true, don't actually delete

**Algorithm:**
1. Find assets where:
   - `createdAt < now - olderThanDays`
   - NOT referenced in any playlist items (via Prisma relation)
   - Limited to `maxAssets` (oldest first)
2. For each asset:
   - Delete S3 objects (original + optimized if exists)
   - Hard delete asset record from DB
   - Log each deletion

**Returns:**
```javascript
{
  deletedCount: 5,
  skippedCount: 10,
  errorCount: 0,
  processed: 5,
  remaining: 20,
  durationMs: 5000
}
```

### `cleanupOriginalsAfterOptimization(options)`
Removes original video files after optimized versions exist.

**Options:**
- `gracePeriodDays` (default: 7) - Wait N days after optimization before deleting original
- `maxAssets` (default: 500) - Maximum assets to process per run
- `dryRun` (default: false) - If true, don't actually delete

**Algorithm:**
1. Find assets where:
   - `isOptimized = true`
   - `optimizedUrl IS NOT NULL`
   - `optimizedKey IS NOT NULL`
   - `optimizedAt < now - gracePeriodDays`
   - `storageKey IS NOT NULL` (and not in `optimized/` prefix)
   - Limited to `maxAssets` (oldest optimized first)
2. For each asset:
   - Delete original S3 object using `storageKey`
   - Update asset record: set `storageKey = null`
   - Log deletion

**Returns:**
```javascript
{
  deletedCount: 3,
  skippedCount: 15,
  errorCount: 0,
  processed: 3,
  remaining: 10,
  durationMs: 3000
}
```

## Admin Endpoints

### POST /api/admin/media/cleanup/orphans
Cleanup orphan assets.

**Request Body (optional):**
```json
{
  "olderThanDays": 30,
  "maxAssets": 500,
  "dryRun": false
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Orphan cleanup completed",
  "result": {
    "deletedCount": 5,
    "skippedCount": 10,
    "errorCount": 0,
    "processed": 5,
    "remaining": 20,
    "durationMs": 5000
  }
}
```

### POST /api/admin/media/cleanup/originals
Cleanup original files after optimization.

**Request Body (optional):**
```json
{
  "gracePeriodDays": 7,
  "maxAssets": 500,
  "dryRun": false
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Original cleanup completed",
  "result": {
    "deletedCount": 3,
    "skippedCount": 15,
    "errorCount": 0,
    "processed": 3,
    "remaining": 10,
    "durationMs": 3000
  }
}
```

## Safety Features

1. **Limit per run** - Maximum 500 assets processed per call (configurable)
2. **Dry run mode** - Test without actually deleting
3. **Grace periods** - Wait before deleting (7 days for originals, 30 days for orphans)
4. **Error handling** - Continue processing even if individual deletions fail
5. **Remaining count** - Warns if more candidates exist than limit

## Logging

### Cleanup Orphans
```
[INFO] [CLEANUP] Cleanup orphans started {"olderThanDays":30,"maxAssets":500,"dryRun":false}
[INFO] [CLEANUP] Deleted S3 object {"key":"media/123.mp4"}
[INFO] [CLEANUP] Deleted orphan asset record {"assetId":"abc123","keysDeleted":1}
[WARN] [CLEANUP] More orphan assets remain than cleanup limit {"processed":500,"remaining":20,"totalOrphans":520}
[INFO] [CLEANUP] Cleanup orphans finished {"deletedCount":5,"skippedCount":10,"errorCount":0,"processed":5,"remaining":20,"durationMs":5000}
```

### Cleanup Originals
```
[INFO] [CLEANUP] Cleanup originals started {"gracePeriodDays":7,"maxAssets":500,"dryRun":false}
[INFO] [CLEANUP] Deleted S3 object {"key":"media/123.mp4"}
[INFO] [CLEANUP] Updated asset after original deletion {"assetId":"abc123","originalKey":"media/123.mp4"}
[WARN] [CLEANUP] More optimized assets remain than cleanup limit {"processed":500,"remaining":10,"totalCandidates":510}
[INFO] [CLEANUP] Cleanup originals finished {"deletedCount":3,"skippedCount":15,"errorCount":0,"processed":3,"remaining":10,"durationMs":3000}
```

## Usage

### Manual Cleanup
```bash
# Cleanup orphans (dry run)
curl -X POST https://cardbey-core.onrender.com/api/admin/media/cleanup/orphans \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Cleanup orphans (actual)
curl -X POST https://cardbey-core.onrender.com/api/admin/media/cleanup/orphans \
  -H "Content-Type: application/json" \
  -d '{"olderThanDays": 30, "maxAssets": 500}'

# Cleanup originals
curl -X POST https://cardbey-core.onrender.com/api/admin/media/cleanup/originals \
  -H "Content-Type: application/json" \
  -d '{"gracePeriodDays": 7, "maxAssets": 500}'
```

### Scheduled Cleanup
You can set up a cron job or scheduled Lambda to call these endpoints periodically.

## Database Changes

No schema changes required. The service uses existing fields:
- `storageKey` - S3 key for original file (set to null after original deletion)
- `optimizedKey` - S3 key for optimized file
- `isOptimized` - Flag indicating optimization complete
- `optimizedAt` - Timestamp when optimization completed
- `createdAt` - Asset creation timestamp

## Notes

- **Hard delete**: Orphan assets are hard-deleted from the database. If you prefer soft delete, modify the service to set a `deletedAt` field instead.
- **Original deletion**: After deleting original, `storageKey` is set to `null`. The asset record remains with `optimizedUrl` for playback.
- **Error resilience**: If S3 deletion fails, the error is logged but processing continues for other assets.


