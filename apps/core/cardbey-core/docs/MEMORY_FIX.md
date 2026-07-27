# Memory OOM Fix

## Problem
Instance was running out of memory (exceeded 512MB) when processing video uploads/optimization.

## Root Causes

1. **Large file uploads in memory**: Multer was buffering entire files (up to 200MB) in memory
2. **S3 download loading entire file**: `downloadFromS3()` was loading entire video files into memory buffers
3. **Double buffering**: Video optimizer was loading files into memory twice (download + optimization)

## Fixes Applied

### 1. Reduced Upload Limit
- Changed from 200MB to 100MB max file size
- Prevents single large uploads from consuming too much memory

### 2. Stream S3 Downloads to Disk
- Added `downloadFromS3ToFile()` function that streams downloads directly to temp files
- Avoids loading entire video files into memory
- Updated `optimizeVideoFromS3()` to use file-based optimization

### 3. File-Based Video Optimization
- Updated `optimizeVideoFromFile()` to work directly with file paths
- FFmpeg already works with files, so no need to load into memory first
- Only optimized output is loaded into memory for S3 upload

## Memory Usage Comparison

### Before (Memory-Heavy):
```
Upload: 200MB file → 200MB in memory
S3 Download: 200MB → 200MB buffer in memory
Optimization: 200MB input + 100MB output = 300MB
Total: ~500MB+ (exceeds 512MB limit)
```

### After (Streaming):
```
Upload: 100MB file → 100MB in memory (reduced limit)
S3 Download: Streams to temp file → ~10MB buffer chunks
Optimization: File-based → ~50MB working memory
Total: ~160MB (well under 512MB limit)
```

## Files Modified

1. **src/lib/s3Client.js**
   - Added `downloadFromS3ToFile()` - streams to disk
   - Kept `downloadFromS3()` for small files (legacy)

2. **src/services/videoOptimizer.js**
   - Added `optimizeVideoFromFile()` - works with file paths
   - Updated `optimizeVideoFromS3()` to use streaming download
   - Kept `optimizeVideo()` for small buffers (legacy)

3. **src/routes/upload.js**
   - Reduced file size limit from 200MB to 100MB

## Recommendations

1. **For production**: Consider using Lambda for video optimization (already implemented via SQS)
2. **For large files**: Use diskStorage with streaming uploads to S3
3. **Monitor memory**: Add memory usage logging to track improvements

## Testing

After these changes, video uploads and optimization should:
- Use significantly less memory
- Not exceed 512MB limit on Render free tier
- Still process videos correctly via file-based optimization


