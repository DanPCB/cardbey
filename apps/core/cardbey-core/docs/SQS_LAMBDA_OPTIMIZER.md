# SQS + Lambda Video Optimizer Integration

## Overview
Cardbey Core now supports external video optimization via AWS SQS + Lambda. When a video is uploaded, Core publishes a job to SQS, and a Lambda function processes it and calls back to update the asset.

## Architecture

```
User uploads video
  ↓
Core uploads to S3 (original)
  ↓
Core creates Asset record
  ↓
Core publishes job to SQS queue
  ↓
AWS Lambda receives job from SQS
  ↓
Lambda downloads original from S3
  ↓
Lambda optimizes video (ffmpeg)
  ↓
Lambda uploads optimized to S3
  ↓
Lambda calls Core callback: POST /api/internal/media/optimized
  ↓
Core updates Asset: optimizedUrl, optimizedKey, isOptimized=true
  ↓
Playlists automatically use optimized URL
```

## Environment Variables

### Required
- `AWS_SQS_VIDEO_QUEUE_URL` - SQS queue URL (e.g., `https://sqs.ap-southeast-2.amazonaws.com/<acct>/cardbey-video-optimizer`)
- `INTERNAL_API_SECRET` - Secret for Lambda callback authentication
- `AWS_REGION` - AWS region (e.g., `ap-southeast-2`)
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `S3_BUCKET_NAME` - S3 bucket name (e.g., `cardbey`)
- `CDN_BASE_URL` - CloudFront base URL (e.g., `https://d2pj1uqw9p1zhj.cloudfront.net`)

## SQS Client (`src/lib/sqsClient.js`)

### Function
```javascript
publishVideoOptimizeJob({ assetId, bucket, storageKey, mimeType })
```

### Message Format
```json
{
  "assetId": "cmicjl6oj000djh1plzwb9deq",
  "bucket": "cardbey",
  "storageKey": "media/1763947327269-abc123.mp4",
  "mimeType": "video/mp4"
}
```

## Upload Flow

When a video is uploaded:

1. **Upload to S3** - Original video uploaded to S3
2. **Create Asset** - Media record created with `storageKey` and CloudFront URL
3. **Publish to SQS** - Job published to SQS queue (non-blocking)
4. **Return Response** - Upload completes immediately

**Logs:**
```
[INFO] [UPLOAD] S3 upload succeeded {"key":"media/123.mp4","mimeType":"video/mp4","size":15234567}
[INFO] [UPLOAD] Asset record created {"assetId":"abc123","storageKey":"media/123.mp4",...}
[INFO] [OPTIMIZER] Published SQS optimize job {"assetId":"abc123","storageKey":"media/123.mp4","messageId":"..."}
```

## Lambda Callback Endpoint

### Endpoint
`POST /api/internal/media/optimized`

### Authentication
Requires `x-internal-secret` header matching `INTERNAL_API_SECRET` environment variable.

### Request Body
```json
{
  "assetId": "cmicjl6oj000djh1plzwb9deq",
  "optimizedKey": "optimized/1763947327269-abc123.mp4",
  "optimizedUrl": "https://d2pj1uqw9p1zhj.cloudfront.net/optimized/1763947327269-abc123.mp4"
}
```

**Note:** `optimizedUrl` is optional - if not provided, it will be constructed from `optimizedKey` and `CDN_BASE_URL`.

### Response
```json
{
  "ok": true,
  "assetId": "cmicjl6oj000djh1plzwb9deq",
  "optimizedKey": "optimized/1763947327269-abc123.mp4",
  "optimizedUrl": "https://d2pj1uqw9p1zhj.cloudfront.net/optimized/1763947327269-abc123.mp4"
}
```

### Asset Update
The endpoint updates the Asset record:
- `optimizedKey` = provided optimizedKey
- `optimizedUrl` = provided or constructed URL
- `isOptimized` = true
- `optimizedAt` = current timestamp

**Logs:**
```
[INFO] [OPTIMIZER] Asset marked as optimized {"assetId":"abc123","optimizedKey":"optimized/123.mp4","optimizedUrl":"https://..."}
```

## Playlist Builder

The playlist builder automatically prefers `optimizedUrl` if available:

```javascript
if (media.optimizedUrl && media.isOptimized === true) {
  // Use optimized URL
  rawUrl = media.optimizedUrl;
} else {
  // Use original URL
  rawUrl = media.url;
}
```

**Logs:**
```
[INFO] [PLAYLIST] Playlist built {"usingOptimizedCount":2,"usingOriginalCount":3,...}
```

## Example Log Flow

### 1. Video Upload
```
[2025-11-24T10:00:00.000Z] [INFO] [UPLOAD] S3 upload succeeded {"key":"media/1763947327269-abc123.mp4","mimeType":"video/mp4","size":15234567,"bucket":"cardbey"}
[2025-11-24T10:00:00.100Z] [INFO] [UPLOAD] Asset record created {"assetId":"cmicjl6oj000djh1plzwb9deq","type":"VIDEO","url":"https://d2pj1uqw9p1zhj.cloudfront.net/media/1763947327269-abc123.mp4","storageKey":"media/1763947327269-abc123.mp4","mimeType":"video/mp4","sizeBytes":15234567,"requestId":"abc123"}
[2025-11-24T10:00:00.200Z] [INFO] [OPTIMIZER] Published SQS optimize job {"assetId":"cmicjl6oj000djh1plzwb9deq","storageKey":"media/1763947327269-abc123.mp4","messageId":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","requestId":"abc123"}
```

### 2. Lambda Callback
```
[2025-11-24T10:05:00.000Z] [INFO] [OPTIMIZER] Asset marked as optimized {"assetId":"cmicjl6oj000djh1plzwb9deq","optimizedKey":"optimized/1763947327269-abc123.mp4","optimizedUrl":"https://d2pj1uqw9p1zhj.cloudfront.net/optimized/1763947327269-abc123.mp4","requestId":"lambda-xyz"}
```

### 3. Screen Fetching Playlist
```
[2025-11-24T10:10:00.000Z] [INFO] [PLAYLIST] Building playlist for screen {"screenId":"cmibidol60005o01q30g7msyb","full":true,"requestId":"def456"}
[2025-11-24T10:10:00.100Z] [INFO] [PLAYLIST] Playlist built {"screenId":"cmibidol60005o01q30g7msyb","itemCount":5,"videoCount":3,"imageCount":2,"usingOptimizedCount":2,"usingOriginalCount":3,"requestId":"def456"}
[2025-11-24T10:10:00.200Z] [INFO] [SCREENS] Screen fetched playlist {"screenId":"cmibidol60005o01q30g7msyb","playlistItems":5,"requestId":"def456"}
```

## Error Handling

### SQS Publish Failure
If SQS publish fails, the upload still succeeds. The error is logged but doesn't block the response:
```
[ERROR] [OPTIMIZER] Failed to publish SQS optimize job (non-fatal) {"assetId":"abc123","errorMessage":"...","requestId":"abc123"}
```

### Lambda Callback Failure
If Lambda callback fails, the asset remains with `isOptimized=false`. Lambda should retry or alert.

### Invalid Secret
If `x-internal-secret` is missing or incorrect:
```
[WARN] [INTERNAL] Invalid internal API secret {"endpoint":"/api/internal/media/optimized","ip":"..."}
```
Returns 401 Unauthorized.

## Migration from Local Optimizer

The local optimizer (`src/jobs/videoOptimizerQueue.js`) is now disabled. The upload route no longer calls `enqueueOptimizeVideo()`. If you need to keep it as a fallback, you can add conditional logic:

```javascript
if (process.env.USE_LOCAL_OPTIMIZER === 'true') {
  // Use local queue
} else {
  // Use SQS
  await publishVideoOptimizeJob(...);
}
```

## Lambda Function Requirements

Your Lambda function should:

1. **Subscribe to SQS queue** - Receive messages from `AWS_SQS_VIDEO_QUEUE_URL`
2. **Download original** - Download from S3 using `storageKey`
3. **Optimize video** - Run ffmpeg optimization
4. **Upload optimized** - Upload to S3 at `optimized/{originalKey}.mp4`
5. **Call callback** - POST to `https://cardbey-core.onrender.com/api/internal/media/optimized` with:
   - Header: `x-internal-secret: <INTERNAL_API_SECRET>`
   - Body: `{ assetId, optimizedKey, optimizedUrl }`

## Testing

### Test SQS Publish
```bash
# Upload a test video via API
curl -X POST https://cardbey-core.onrender.com/api/upload/playlist-media \
  -F "file=@test-video.mp4"
```

### Test Lambda Callback
```bash
curl -X POST https://cardbey-core.onrender.com/api/internal/media/optimized \
  -H "x-internal-secret: <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "cmicjl6oj000djh1plzwb9deq",
    "optimizedKey": "optimized/test-123.mp4",
    "optimizedUrl": "https://d2pj1uqw9p1zhj.cloudfront.net/optimized/test-123.mp4"
  }'
```


