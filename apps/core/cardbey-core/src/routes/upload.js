// src/routes/upload.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { lookup as mimeLookup } from 'mime-types';
import { buildMediaUrl, normalizeMediaUrlForStorage } from '../utils/publicUrl.js';
import { uploadBufferToS3 } from '../lib/s3Client.js';
import { info, error } from '../lib/logger.js';
import { publishVideoOptimizeJob } from '../lib/sqsClient.js';
import { createTempPath, safeUnlink } from '../lib/tempFiles.js';
// Lazy load sharp to avoid startup crashes if platform binaries aren't available
let sharp = null;

// Lazy initialization for sharp - only load when processing images
async function getSharp() {
  if (sharp) return sharp;
  
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
    return sharp;
  } catch (error) {
    console.warn('[upload] Failed to load sharp:', error.message);
    console.warn('[upload] Image metadata extraction will be disabled');
    return null;
  }
}

// Lazy initialization for ffmpeg - only load when needed (not at module load time)
// This prevents ERR_MODULE_NOT_FOUND on startup if packages aren't installed
let ffmpeg = null;
let ffmpegInitialized = false;
let ffmpegInitializationPromise = null;

// Lazy initialization function for ffmpeg - ONLY called when processing video
// Never called at module load time to prevent startup crashes
async function initializeFfmpeg() {
  // Return cached instance if already initialized
  if (ffmpegInitialized) {
    return ffmpeg;
  }
  
  // If initialization is in progress, return the same promise
  if (ffmpegInitializationPromise) {
    return ffmpegInitializationPromise.then(() => ffmpeg);
  }
  
  // Start initialization - this is the ONLY place dynamic imports happen
  ffmpegInitializationPromise = (async () => {
    try {
      // Dynamic imports are resolved at runtime, not parse time
      const { default: ffmpegModule } = await import('fluent-ffmpeg');
      ffmpeg = ffmpegModule;
      
      const { default: ffmpegStatic } = await import('ffmpeg-static');
      const { default: ffprobeStatic } = await import('ffprobe-static');
      
      // Configure ffmpeg paths if available
      if (ffmpeg && ffmpegStatic) {
        ffmpeg.setFfmpegPath(ffmpegStatic);
      } else if (ffmpeg) {
        console.warn('[upload] ffmpeg-static not available, ffmpeg may not work for video processing');
      }
      
      if (ffmpeg && ffprobeStatic?.path) {
        ffmpeg.setFfprobePath(ffprobeStatic.path);
      } else if (ffmpeg) {
        console.warn('[upload] ffprobe-static not available, video metadata extraction may not work');
      }
      
      ffmpegInitialized = true;
      return ffmpeg;
    } catch (error) {
      console.warn('[upload] Failed to load ffmpeg packages:', error.message);
      console.warn('[upload] Video processing will be limited - metadata extraction may fail');
      console.warn('[upload] Make sure fluent-ffmpeg, ffmpeg-static, and ffprobe-static are in dependencies');
      ffmpegInitialized = true; // Mark as initialized to avoid repeated attempts
      ffmpeg = null;
      return null;
    }
  })();
  
  return ffmpegInitializationPromise;
}

// NOTE: Video optimization is now handled by the queue system (src/jobs/videoOptimizerQueue.js)
// The old optimizeVideoForStreaming function has been removed - optimization happens asynchronously
// via the queue after the upload completes

const router = Router();
const prisma = new PrismaClient();

// Use memory storage for S3 uploads (files are buffered in memory, then uploaded to S3)
// NOTE: For large files, consider using diskStorage and streaming to S3 to reduce memory usage
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 100 } }); // Reduced to 100MB to prevent OOM on 512MB instances

// Keep uploadsDir for temporary processing (metadata extraction, video optimization)
// Only used for temporary files, not final storage
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Shared upload handler function (used by both /playlist-media and /create routes)
async function handleFileUpload(req, res) {
  try {
    // Enhanced error logging for debugging
    if (!req.file) {
      // Check if file might be in req.files (for array uploads)
      const file = req.file || (req.files && req.files[0]) || (req.files && req.files.file);
      
      if (!file) {
        console.error('[UPLOAD] No file received', {
          method: req.method,
          path: req.path,
          originalUrl: req.originalUrl,
          contentType: req.headers['content-type'],
          hasBody: !!req.body,
          bodyKeys: req.body ? Object.keys(req.body) : [],
          files: req.files ? Object.keys(req.files) : [],
          headers: {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length'],
          },
        });
        
        return res.status(400).json({ 
          ok: false,
          error: 'No file',
          message: 'No file uploaded. Please ensure the file is sent as multipart/form-data with field name "file".',
          received: {
            hasBody: !!req.body,
            bodyKeys: req.body ? Object.keys(req.body) : [],
            files: req.files ? Object.keys(req.files) : [],
            contentType: req.headers['content-type'],
          }
        });
      }
      
      // Use the found file
      req.file = file;
    }

    // Extract metadata from buffer before uploading to S3
    const buffer = req.file.buffer;
    
    // Validate buffer exists and has content
    if (!buffer || buffer.length === 0) {
      console.error('[UPLOAD] Empty or invalid file buffer', {
        hasBuffer: !!buffer,
        bufferLength: buffer?.length || 0,
        originalName: req.file.originalname,
        size: req.file.size,
      });
      return res.status(400).json({
        ok: false,
        error: 'invalid_file',
        message: 'File buffer is empty or invalid. Please ensure the file was uploaded correctly.',
      });
    }
    
    // Validate file size (minimum 1 byte, maximum already enforced by multer)
    if (buffer.length < 1) {
      return res.status(400).json({
        ok: false,
        error: 'file_too_small',
        message: 'File is too small (must be at least 1 byte)',
      });
    }
    
    const mime = req.file.mimetype || mimeLookup(req.file.originalname) || 'application/octet-stream';
    const sizeBytes = req.file.size || buffer.length;

    let width;
    let height;
    let durationS;
    const kind = mime.startsWith('video') ? 'VIDEO' : 'IMAGE';

    // Extract metadata from buffer (for images, we can do this directly)
    // For videos, we may need to write temporarily to disk for ffprobe
    if (kind === 'IMAGE') {
      const sharpInstance = await getSharp();
      if (sharpInstance) {
        try {
          const meta = await sharpInstance(buffer).metadata();
          width = meta.width ?? undefined;
          height = meta.height ?? undefined;
        } catch (err) {
          console.warn('[upload] Failed to extract image metadata:', err);
        }
      } else {
        console.warn('[upload] sharp not available, skipping image metadata extraction');
      }
    } else {
      // VIDEO - Need temporary file for ffprobe (it requires a file path)
      const tempFilePath = createTempPath('cardbey-upload-', path.extname(req.file.originalname || '.mp4'));
      try {
        // Write buffer to temp file
        await fs.promises.writeFile(tempFilePath, buffer);
        
        // Ensure ffmpeg is initialized
        const ffmpegInstance = await initializeFfmpeg();
        
        if (ffmpegInstance && ffmpegInstance.ffprobe) {
          try {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('ffprobe timeout'));
              }, 30000); // 30 second timeout
              
              ffmpegInstance.ffprobe(tempFilePath, (err, data) => {
                clearTimeout(timeout);
                if (!err && data?.streams?.length) {
                  const v = data.streams.find(s => s.codec_type === 'video');
                  if (v) {
                    width = v.width || undefined;
                    height = v.height || undefined;
                  }
                  if (data.format?.duration) {
                    durationS = Number(data.format.duration) || undefined;
                  }
                } else if (err) {
                  console.warn('[upload] ffprobe error (non-fatal):', err.message);
                }
                resolve();
              });
            });
          } catch (err) {
            // Non-fatal: log warning but continue without metadata
            console.warn('[upload] Failed to extract video metadata (non-fatal):', err.message);
          }
        } else {
          console.warn('[upload] ffmpeg not available, skipping video metadata extraction');
        }
      } finally {
        // Clean up temp file
        await safeUnlink(tempFilePath, 'UPLOAD');
      }
    }

    // Upload to S3 (or local storage if S3 not configured)
    const { key, url: storageUrl } = await uploadBufferToS3(buffer, req.file.originalname, mime);
    
    // Store relative paths for local files (/uploads/...); keep CloudFront URLs as-is.
    // Do not call resolvePublicUrl here — it bakes in PUBLIC_BASE_URL / CORE_BASE_URL and breaks other LAN clients.
    const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);

    // Log URL for debugging
    console.log('[UPLOAD] Generated normalized URL for storage:', {
      storageUrl,
      normalizedUrl,
      isCloudFront: normalizedUrl.startsWith('https://') && normalizedUrl.includes('cloudfront'),
      originalName: req.file.originalname,
    });
    
    // Create media record with normalized URL and storage key
    const media = await prisma.media.create({
      data: {
        url: normalizedUrl, // Store relative path or CloudFront URL
        storageKey: key, // Store storage key (S3 key or local path)
        kind,
        mime,
        width: width ?? null,
        height: height ?? null,
        durationS: durationS ?? null,
        sizeBytes,
      },
    });

    // Log asset creation
    info('UPLOAD', 'Asset record created', {
      assetId: media.id,
      type: kind,
      url: normalizedUrl,
      storageKey: key,
      mimeType: mime,
      sizeBytes,
      requestId: req.requestId,
    });

    // Publish video optimization job to SQS (only if S3 is configured)
    // NOTE: Legacy local optimizer (videoOptimizerQueue.js) is disabled in favor of SQS + Lambda
    if (kind === 'VIDEO' && process.env.S3_BUCKET_NAME) {
      try {
        await publishVideoOptimizeJob({
          assetId: media.id,
          bucket: process.env.S3_BUCKET_NAME,
          storageKey: key,
          mimeType: mime,
        });
        info('OPTIMIZER', 'Published SQS optimize job', {
          assetId: media.id,
          storageKey: key,
          requestId: req.requestId,
        });
      } catch (err) {
        // Log error but don't fail the upload
        error('OPTIMIZER', 'Failed to publish SQS optimize job (non-fatal)', {
          assetId: media.id,
          storageKey: key,
          errorMessage: err.message,
          requestId: req.requestId,
        });
        // Upload succeeded, optimization job can be retried manually if needed
      }
    } else if (kind === 'VIDEO' && !process.env.S3_BUCKET_NAME) {
      info('OPTIMIZER', 'Skipping video optimization (S3 not configured, using local storage)', {
        assetId: media.id,
        requestId: req.requestId,
      });
    }

    // Return response: url (relative/CloudFront), absoluteUrl (for client preview), storageKey (for OCR/internal)
    res.status(201).json({
      ok: true,
      data: {
        id: media.id,
        url: normalizedUrl,
        absoluteUrl: buildMediaUrl(normalizedUrl, req) || undefined,
        storageKey: key || undefined,
        optimizedUrl: null,
        mime: media.mime,
        width: media.width,
        height: media.height,
        durationS: media.durationS,
        kind: media.kind,
        sizeBytes: media.sizeBytes,
      },
    });
  } catch (e) {
    error('UPLOAD', 'Upload failed', {
      errorMessage: e.message,
      errorStack: e.stack?.substring(0, 200),
      originalName: req.file?.originalname,
      mimeType: req.file?.mimetype,
      requestId: req.requestId,
    });
    
    // Check for specific error types
    let statusCode = 500;
    let errorCode = 'upload_failed';
    
    if (e.message?.includes('File too large') || e.message?.includes('LIMIT_FILE_SIZE')) {
      statusCode = 413;
      errorCode = 'file_too_large';
    } else if (e.message?.includes('No file') || e.message?.includes('Unexpected field')) {
      statusCode = 400;
      errorCode = 'invalid_upload';
    } else if (e.code === 'P2002') {
      statusCode = 409;
      errorCode = 'duplicate_entry';
    }
    
    res.status(statusCode).json({ 
      ok: false,
      error: errorCode,
      message: e.message || 'Upload failed',
    });
  }
}

// Route: /api/upload/playlist-media (original route)
router.post('/playlist-media', upload.single('file'), handleFileUpload);

/**
 * GET /api/uploads/create
 * Get upload URL/endpoint information
 * Some frontends need to get the upload URL before uploading
 * 
 * Returns the upload endpoint URL that the frontend should POST to
 */
router.get('/create', async (req, res) => {
  try {
    // Build the upload endpoint URL
    // Use the request's protocol and host, or fall back to environment variables
    const protocol = req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get('host') || process.env.API_HOST || 'localhost:3001';
    const baseUrl = `${protocol}://${host}`;
    const uploadUrl = `${baseUrl}/api/uploads/create`;
    
    // Return response in multiple formats for compatibility
    res.json({
      ok: true,
      uploadUrl, // Primary field
      url: uploadUrl, // Alternative field name
      endpoint: uploadUrl, // Another alternative
      method: 'POST',
      fieldName: 'file',
      maxFileSize: 100 * 1024 * 1024, // 100MB
      supportedFormats: ['image/*', 'video/*'],
      accepts: ['multipart/form-data', 'application/json'],
    });
  } catch (error) {
    console.error('[UPLOAD] Error getting upload URL:', error);
    res.status(500).json({
      ok: false,
      error: 'failed_to_get_upload_url',
      message: error.message || 'Failed to get upload URL',
    });
  }
});

// Route: /api/uploads/create - Handles both multipart/form-data and JSON with base64
router.post('/create', async (req, res, next) => {
  // Check if request is JSON with base64 file data
  if (req.headers['content-type']?.includes('application/json')) {
    return handleJsonUpload(req, res, next);
  }
  // Otherwise, use multer for multipart/form-data
  return upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[UPLOAD] Multer error:', err);
      
      // Handle specific multer errors
      let statusCode = 400;
      let errorCode = 'upload_error';
      let message = err.message || 'File upload failed';
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        statusCode = 413;
        errorCode = 'file_too_large';
        message = 'File size exceeds maximum limit (100MB)';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        errorCode = 'unexpected_file';
        message = 'Unexpected file field. Use "file" as the field name.';
      } else if (err.code === 'LIMIT_PART_COUNT') {
        errorCode = 'too_many_parts';
        message = 'Too many parts in the request';
      } else if (err.code === 'LIMIT_FIELD_KEY') {
        errorCode = 'field_name_too_long';
        message = 'Field name is too long';
      } else if (err.code === 'LIMIT_FIELD_VALUE') {
        errorCode = 'field_value_too_long';
        message = 'Field value is too long';
      } else if (err.code === 'LIMIT_FIELD_COUNT') {
        errorCode = 'too_many_fields';
        message = 'Too many fields in the request';
      }
      
      return res.status(statusCode).json({
        ok: false,
        error: errorCode,
        message,
        ...(err.code && { code: err.code }),
      });
    }
    handleFileUpload(req, res);
  });
});

// Handler for JSON-based uploads (base64 encoded file in bytes field)
async function handleJsonUpload(req, res, next) {
  try {
    const { userId, mime, bytes, kind, filename } = req.body;
    
    // Enhanced logging for debugging
    info('UPLOAD', 'JSON upload request received', {
      hasBytes: !!bytes,
      bytesType: typeof bytes,
      bytesLength: bytes ? String(bytes).length : 0,
      mime,
      kind,
      filename,
      bodyKeys: Object.keys(req.body || {}),
      requestId: req.requestId,
    });
    
    if (!bytes) {
      return res.status(400).json({
        ok: false,
        error: 'No file data',
        message: 'Missing "bytes" field with file data (base64 encoded)',
        hint: 'The request body should include a "bytes" field containing the base64-encoded file data.',
        receivedFields: Object.keys(req.body || {}),
      });
    }
    
    const mimeType = mime || 'application/octet-stream';
    
    // Decode base64 to buffer
    let buffer;
    try {
      let base64Data = bytes;
      
      // Remove data URL prefix if present (e.g., "data:video/mp4;base64,")
      if (typeof base64Data === 'string' && base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      
      // Remove whitespace (spaces, newlines, etc.)
      base64Data = String(base64Data).replace(/\s/g, '');
      
      // Validate base64 format
      if (!base64Data || base64Data.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_base64',
          message: 'Empty base64 data provided',
        });
      }
      
      // Decode base64
      buffer = Buffer.from(base64Data, 'base64');
      
      // Validate decoded buffer
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_base64',
          message: 'Decoded buffer is empty',
        });
      }
      
      // Validate file size (reject suspiciously small files)
      if (buffer.length < 1024) { // Less than 1KB
        warn('UPLOAD', 'File too small - likely corrupted or incomplete', {
          receivedSize: buffer.length,
          originalBase64Length: base64Data.length,
          mimeType,
          filename: originalName,
          requestId: req.requestId,
        });
        
        return res.status(400).json({
          ok: false,
          error: 'file_too_small',
          message: `Uploaded file is too small (${buffer.length} bytes). Please ensure you are uploading the actual video file.`,
          receivedSize: buffer.length,
          originalBase64Length: base64Data.length,
          hint: 'The file appears to be empty or corrupted. The frontend should read the actual file content and convert it to base64. Make sure you are reading the File object and converting it to base64 before sending.',
          expectedFormat: {
            bytes: '<base64-encoded-file-data>',
            mime: 'video/mp4',
            kind: 'VIDEO',
            filename: 'example.mp4',
          },
        });
      }
      
      info('UPLOAD', 'Base64 decoded successfully', {
        originalLength: base64Data.length,
        decodedSize: buffer.length,
        mimeType,
        requestId: req.requestId,
      });
    } catch (err) {
      error('UPLOAD', 'Base64 decode failed', {
        errorMessage: err.message,
        errorStack: err.stack?.substring(0, 200),
        bytesType: typeof bytes,
        bytesLength: bytes ? String(bytes).length : 0,
        requestId: req.requestId,
      });
      
      return res.status(400).json({
        ok: false,
        error: 'invalid_base64',
        message: `Failed to decode base64 file data: ${err.message}. Make sure the 'bytes' field contains valid base64-encoded file data.`,
        hint: 'If sending a data URL, include the full string. The handler will extract the base64 portion automatically.',
      });
    }
    // Normalize kind to uppercase (VIDEO or IMAGE) as required by Prisma MediaKind enum
    const fileKind = kind ? String(kind).toUpperCase() : (mimeType.startsWith('video') ? 'VIDEO' : 'IMAGE');
    
    // Validate kind is one of the allowed enum values
    if (fileKind !== 'VIDEO' && fileKind !== 'IMAGE') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_kind',
        message: `Invalid kind: "${kind}". Must be "VIDEO" or "IMAGE" (case-insensitive)`,
      });
    }
    const originalName = filename || `upload.${mimeType.split('/')[1] || 'bin'}`;
    const sizeBytes = buffer.length;
    
    // Extract metadata (similar to handleFileUpload)
    let width, height, durationS;
    
    if (fileKind === 'IMAGE') {
      const sharpInstance = await getSharp();
      if (sharpInstance) {
        try {
          const meta = await sharpInstance(buffer).metadata();
          width = meta.width ?? undefined;
          height = meta.height ?? undefined;
        } catch (err) {
          console.warn('[upload] Failed to extract image metadata:', err);
        }
      }
    } else {
      // VIDEO - Need temporary file for ffprobe
      const tempFilePath = createTempPath('cardbey-upload-', path.extname(originalName) || '.mp4');
      try {
        await fs.promises.writeFile(tempFilePath, buffer);
        const ffmpegInstance = await initializeFfmpeg();
        
        if (ffmpegInstance && ffmpegInstance.ffprobe) {
          try {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('ffprobe timeout')), 30000);
              ffmpegInstance.ffprobe(tempFilePath, (err, data) => {
                clearTimeout(timeout);
                if (!err && data?.streams?.length) {
                  const v = data.streams.find(s => s.codec_type === 'video');
                  if (v) {
                    width = v.width || undefined;
                    height = v.height || undefined;
                  }
                  if (data.format?.duration) {
                    durationS = Number(data.format.duration) || undefined;
                  }
                }
                resolve();
              });
            });
          } catch (err) {
            console.warn('[upload] Failed to extract video metadata (non-fatal):', err.message);
          }
        }
      } finally {
        await safeUnlink(tempFilePath, 'UPLOAD');
      }
    }
    
    // Upload to S3 (or local storage if S3 not configured)
    const { key, url: storageUrl } = await uploadBufferToS3(buffer, originalName, mimeType);
    const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);

    // Log URL for debugging
    console.log('[UPLOAD] Generated normalized URL for storage (JSON upload):', {
      storageUrl,
      normalizedUrl,
      isCloudFront: normalizedUrl.startsWith('https://') && normalizedUrl.includes('cloudfront'),
      originalName,
    });
    
    // Create media record
    const media = await prisma.media.create({
      data: {
        url: normalizedUrl,
        storageKey: key,
        kind: fileKind,
        mime: mimeType,
        width: width ?? null,
        height: height ?? null,
        durationS: durationS ?? null,
        sizeBytes,
      },
    });
    
    info('UPLOAD', 'JSON upload asset created', {
      assetId: media.id,
      type: fileKind,
      url: normalizedUrl,
      storageKey: key,
      mimeType,
      sizeBytes,
      requestId: req.requestId,
    });
    
    // Publish video optimization job if S3 configured
    if (fileKind === 'VIDEO' && process.env.S3_BUCKET_NAME) {
      try {
        await publishVideoOptimizeJob({
          assetId: media.id,
          bucket: process.env.S3_BUCKET_NAME,
          storageKey: key,
          mimeType,
        });
        info('OPTIMIZER', 'Published SQS optimize job', {
          assetId: media.id,
          storageKey: key,
          requestId: req.requestId,
        });
      } catch (err) {
        error('OPTIMIZER', 'Failed to publish SQS optimize job (non-fatal)', {
          assetId: media.id,
          storageKey: key,
          errorMessage: err.message,
          requestId: req.requestId,
        });
      }
    }
    
    // Return response: url, absoluteUrl (for client preview), storageKey (for OCR/internal)
    const absoluteUrlJson = buildMediaUrl(normalizedUrl, req);
    res.status(201).json({
      ok: true,
      data: {
        id: media.id,
        url: normalizedUrl,
        absoluteUrl: absoluteUrlJson || undefined,
        storageKey: key || undefined,
        optimizedUrl: null,
        mime: media.mime,
        width: media.width,
        height: media.height,
        durationS: media.durationS,
        kind: media.kind,
        sizeBytes: media.sizeBytes,
      },
    });
  } catch (err) {
    error('UPLOAD', 'JSON upload failed', {
      errorMessage: err.message,
      errorStack: err.stack?.substring(0, 200),
      requestId: req.requestId,
    });
    
    // Check for specific error types
    let statusCode = 500;
    let errorCode = 'upload_failed';
    
    if (err.message?.includes('Invalid base64') || err.message?.includes('base64')) {
      statusCode = 400;
      errorCode = 'invalid_base64';
    } else if (err.message?.includes('File too large') || err.message?.includes('size')) {
      statusCode = 413;
      errorCode = 'file_too_large';
    } else if (err.code === 'P2002') {
      statusCode = 409;
      errorCode = 'duplicate_entry';
    }
    
    res.status(statusCode).json({
      ok: false,
      error: errorCode,
      message: err.message || 'Upload failed',
    });
  }
}

/**
 * GET /api/uploads/mine
 * List user's uploads (Media records)
 * 
 * Query params:
 *   - userId: string (optional, for future ownership filtering)
 *   - kind: "IMAGE" | "VIDEO" (optional, filter by media type)
 * 
 * Response: Array of media objects
 *   [
 *     {
 *       id: string,
 *       url: string,
 *       kind: "IMAGE" | "VIDEO",
 *       mime: string,
 *       width: number | null,
 *       height: number | null,
 *       durationS: number | null,
 *       sizeBytes: number,
 *       createdAt: string (ISO date)
 *     }
 *   ]
 */
router.get('/mine', async (req, res) => {
  try {
    const userId = req.query.userId;
    const kind = req.query.kind;
    
    // Build where clause
    const where = {};
    
    // Filter by kind if provided (map frontend "image"/"video" to MediaKind enum)
    if (kind) {
      const normalizedKind = kind.toUpperCase();
      if (normalizedKind === 'IMAGE' || normalizedKind === 'VIDEO') {
        where.kind = normalizedKind;
      } else {
        // Frontend might send "image" or "video" (lowercase)
        if (kind.toLowerCase() === 'image') {
          where.kind = 'IMAGE';
        } else if (kind.toLowerCase() === 'video') {
          where.kind = 'VIDEO';
        }
      }
    }
    
    // TODO: Add userId/ownerId filtering when Media model supports ownership
    // For now, return all media (Media model doesn't have userId/ownerId field)
    // if (userId) {
    //   where.ownerId = userId;
    // }
    
    // Query media records
    const media = await prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000, // Limit to prevent huge responses
    });
    
    // Map to frontend-expected format
    const uploads = media.map(m => ({
      id: m.id,
      url: m.url,
      kind: m.kind.toLowerCase(), // Frontend expects "image" or "video" (lowercase)
      mime: m.mime,
      mimeType: m.mime, // Alias for compatibility
      width: m.width,
      height: m.height,
      durationS: m.durationS,
      sizeBytes: m.sizeBytes,
      createdAt: m.createdAt.toISOString(),
      // Additional fields that frontend might expect
      thumbnailUrl: m.url, // Use URL as thumbnail for now
      optimizedUrl: m.optimizedUrl,
    }));
    
    // Normalize media URLs (fix old IP addresses)
    const { getCoreBaseUrl, normalizeMediaObject } = await import('../utils/mediaUrlNormalizer.js');
    const coreBaseUrl = getCoreBaseUrl(req);
    if (coreBaseUrl) {
      const normalizedUploads = uploads.map(item => normalizeMediaObject(item, coreBaseUrl));
      res.json(normalizedUploads);
    } else {
      res.json(uploads);
    }
  } catch (error) {
    console.error('[UPLOAD] Error listing /mine:', error);
    res.status(500).json({
      error: 'failed_to_list_uploads',
      message: error.message || 'Failed to list uploads',
    });
  }
});

export default router;


































