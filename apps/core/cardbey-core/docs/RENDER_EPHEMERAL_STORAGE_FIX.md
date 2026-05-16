# Render Ephemeral Storage Issue - Missing Optimized Videos

## Problem

On Render, optimized video files are returning 404 errors:
```
[Error] ENOENT: no such file or directory, stat '/opt/render/project/src/uploads/optimized/1763899891262_Screen_Recording_2025-09-28_164615_720p.mp4'
```

## Root Cause

**Render's filesystem is ephemeral** - files are lost on every deploy/restart. When you:
1. Upload a video → File saved to `/uploads/`
2. Video gets optimized → Optimized file saved to `/uploads/optimized/`
3. Database updated with `optimizedUrl`
4. **Server restarts/redeploys** → **All files are lost** ❌
5. Database still has `optimizedUrl` pointing to non-existent file
6. Device requests optimized video → **404 error**

## Current Workaround

The backend now:
- ✅ Logs warnings when optimized files are missing
- ✅ Returns helpful 404 error messages
- ✅ Devices should fallback to original URL (APK needs to handle this)

## Long-Term Solution: Use Persistent Storage

### Option 1: Render Disk (Recommended for Small Scale)

1. **Add Render Disk** to your service:
   - Go to Render Dashboard → Your Service → Settings
   - Add Disk: 1GB (or more)
   - Mount point: `/opt/render/project/src/uploads`

2. **Update build command** to create uploads directory:
   ```bash
   mkdir -p /opt/render/project/src/uploads/optimized && npm install --include=optional && npx prisma generate && npx prisma migrate deploy
   ```

3. **Files will persist** across deploys

### Option 2: AWS S3 (Recommended for Production)

1. **Create S3 bucket** for media storage
2. **Update upload route** to save to S3 instead of local filesystem
3. **Update optimized video storage** to save to S3
4. **Update URLs** to use S3 URLs (or CloudFront CDN)

**Benefits:**
- ✅ Persistent storage
- ✅ CDN for fast delivery
- ✅ Scalable
- ✅ Cost-effective

### Option 3: Cloudflare R2 (S3-Compatible, No Egress Fees)

Similar to S3 but with no egress fees - good for video streaming.

## Immediate Fix: Fallback to Original URL

The APK should handle 404 errors and fallback to original URL:

```kotlin
// In video player
try {
    videoUrl = item.optimizedUrl ?: item.url
    player.setMediaItem(MediaItem.fromUri(videoUrl))
    player.prepare()
} catch (error: IOException) {
    if (error.message?.contains("404") == true && item.optimizedUrl != null) {
        // Fallback to original URL
        Log.w("Player", "Optimized video not found, using original: ${item.url}")
        videoUrl = item.url
        player.setMediaItem(MediaItem.fromUri(videoUrl))
        player.prepare()
    } else {
        throw error
    }
}
```

## Backend Changes Made

1. ✅ Added logging for missing optimized files
2. ✅ Changed static middleware `fallthrough` to allow custom 404 handling
3. ✅ Added handler for `/uploads/optimized` with helpful error messages

## Next Steps

1. **Short-term:** APK should handle 404 and fallback to original URL
2. **Medium-term:** Implement Render Disk for persistent storage
3. **Long-term:** Migrate to S3/R2 for production scalability

## Testing

After implementing fallback:
1. Upload a new video (will create optimized version)
2. Restart server (simulates Render redeploy)
3. Request playlist → Should get optimizedUrl
4. Request optimized video → Should get 404
5. APK should fallback to original URL automatically

