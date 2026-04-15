// src/lib/s3Client.js
// AWS S3 client helper for uploading media files to S3
// Uses AWS SDK v3
// Falls back to local storage if S3_BUCKET_NAME is not configured

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { info, error, warn } from './logger.js';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Generate a unique S3 key for a media file
 * Format: media/{timestamp}-{random}.{ext}
 * 
 * @param {string} originalName - Original filename (e.g., "video.mp4")
 * @returns {string} S3 key (e.g., "media/1699999999999-abc123.mp4")
 */
export function makeMediaKey(originalName) {
  const timestamp = Date.now();
  const random = randomBytes(4).toString('hex');
  const ext = path.extname(originalName || 'file');
  return `media/${timestamp}-${random}${ext}`;
}

/**
 * Upload a buffer to S3 and return the CloudFront URL
 * Falls back to local storage if S3_BUCKET_NAME is not configured
 * 
 * @param {Buffer} buffer - File buffer
 * @param {string} originalName - Original filename for key generation
 * @param {string} mimeType - MIME type (e.g., "video/mp4", "image/jpeg")
 * @returns {Promise<{key: string, url: string}>} Object with storage key and URL (CloudFront or local)
 */
export async function uploadBufferToS3(buffer, originalName, mimeType) {
  const bucketName = process.env.S3_BUCKET_NAME;
  const cdnBaseUrl = process.env.CDN_BASE_URL;
  
  // Check if S3 is configured
  if (!bucketName) {
    // Fallback to local storage
    warn('UPLOAD', 'S3_BUCKET_NAME not configured, using local storage fallback', {
      originalName,
      mimeType: mimeType || 'unknown',
      size: buffer.length,
    });
    return uploadBufferToLocal(buffer, originalName, mimeType);
  }
  
  if (!cdnBaseUrl) {
    // If S3 is configured but CDN is not, warn and fallback to local
    warn('UPLOAD', 'CDN_BASE_URL not configured, falling back to local storage', {
      originalName,
      mimeType: mimeType || 'unknown',
    });
    return uploadBufferToLocal(buffer, originalName, mimeType);
  }
  
  // Generate unique S3 key
  const key = makeMediaKey(originalName);
  
  try {
    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
      // No ACL - bucket stays private; CloudFront has permission via OAI/OAC
    });
    
    await s3Client.send(command);
    
    // Build CloudFront URL
    const cleanCdnBase = cdnBaseUrl.trim().endsWith('/') 
      ? cdnBaseUrl.trim().slice(0, -1) 
      : cdnBaseUrl.trim();
    const url = `${cleanCdnBase}/${key}`;
    
    // Log successful upload
    info('UPLOAD', 'S3 upload succeeded', {
      key,
      mimeType: mimeType || 'unknown',
      size: buffer.length,
      bucket: bucketName,
    });
    
    return { key, url };
  } catch (err) {
    // Log failed upload and fallback to local storage
    error('UPLOAD', 'S3 upload failed, falling back to local storage', {
      errorMessage: err.message,
      errorCode: err.code,
      originalName,
      mimeType: mimeType || 'unknown',
      key,
    });
    
    // Fallback to local storage if S3 upload fails
    return uploadBufferToLocal(buffer, originalName, mimeType);
  }
}

/**
 * Upload a buffer to local filesystem (fallback when S3 is not configured)
 * 
 * @param {Buffer} buffer - File buffer
 * @param {string} originalName - Original filename for key generation
 * @param {string} mimeType - MIME type
 * @returns {Promise<{key: string, url: string}>} Object with local path key and URL
 */
async function uploadBufferToLocal(buffer, originalName, mimeType) {
  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  // Generate unique filename (same format as S3 key for consistency)
  const key = makeMediaKey(originalName); // e.g., "media/1699999999999-abc123.mp4"
  
  // Build file path preserving the directory structure (e.g., uploads/media/1699999999999-abc123.mp4)
  const filePath = path.join(uploadsDir, key);
  
  // Ensure the media subdirectory exists
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  
  try {
    // Write buffer to file
    fs.writeFileSync(filePath, buffer);
    
    // Build local URL path (server will serve from /uploads via express.static)
    // e.g., "/uploads/media/1699999999999-abc123.mp4"
    const url = `/uploads/${key}`;
    
    // Log successful local upload
    info('UPLOAD', 'Local storage upload succeeded', {
      key,
      filePath,
      url,
      mimeType: mimeType || 'unknown',
      size: buffer.length,
    });
    
    return { key, url };
  } catch (err) {
    // Log failed local upload
    error('UPLOAD', 'Local storage upload failed', {
      errorMessage: err.message,
      originalName,
      mimeType: mimeType || 'unknown',
      filePath,
    });
    throw err;
  }
}

/**
 * Generate a presigned GET URL for an S3 object. Caller must enforce access control (e.g. canAccessMission).
 * Does not accept storageKey from client; only from server-side artifact lookup.
 *
 * @param {string} key - S3 object key (e.g. "media/1699999999999-abc123.zip")
 * @param {number} [ttlSeconds=3600] - URL validity in seconds
 * @returns {Promise<{ url: string, expiresAt: string }>} Presigned URL and ISO expiry; throws if S3 not configured
 */
export async function getPresignedGetUrl(key, ttlSeconds = 3600) {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName || !key) {
    throw new Error('S3_BUCKET_NAME and key are required for presigned URL');
  }
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const url = await getSignedUrl(s3Client, command, { expiresIn: Math.max(60, Math.min(86400, ttlSeconds)) });
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  return { url, expiresAt };
}

/**
 * Download a file from S3 by key to a temporary file
 * This streams the download to disk instead of loading into memory to avoid OOM errors
 * 
 * @param {string} key - S3 object key (e.g., "media/1699999999999-abc123.mp4")
 * @param {string} outputPath - Optional output file path. If not provided, creates a temp file
 * @returns {Promise<string>} Path to downloaded file
 */
export async function downloadFromS3ToFile(key, outputPath = null) {
  const bucketName = process.env.S3_BUCKET_NAME;
  
  if (!bucketName) {
    throw new Error('[S3] S3_BUCKET_NAME environment variable is not set');
  }
  
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    const response = await s3Client.send(command);
    
    // Create temp file if outputPath not provided
    // Use os.tmpdir() with recognizable prefix for easier cleanup
    if (!outputPath) {
      const ext = path.extname(key) || '.mp4';
      outputPath = createTempPath('cardbey-s3-', ext);
    }
    
    // Stream download to file
    const fileStream = fs.createWriteStream(outputPath);
    let totalBytes = 0;
    
    for await (const chunk of response.Body) {
      fileStream.write(chunk);
      totalBytes += chunk.length;
    }
    
    fileStream.end();
    
    // Wait for file to be fully written
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });
    
    info('OPTIMIZER', 'S3 download succeeded', {
      key,
      outputPath,
      size: totalBytes,
    });
    
    return outputPath;
  } catch (err) {
    error('OPTIMIZER', 'S3 download failed', {
      key,
      errorMessage: err.message,
      errorCode: err.code,
    });
    throw err;
  }
}

/**
 * Download a file from S3 by key (legacy - loads into memory)
 * WARNING: This loads the entire file into memory. Use downloadFromS3ToFile() for large files.
 * 
 * @param {string} key - S3 object key (e.g., "media/1699999999999-abc123.mp4")
 * @returns {Promise<Buffer>} File buffer
 */
export async function downloadFromS3(key) {
  const bucketName = process.env.S3_BUCKET_NAME;
  
  if (!bucketName) {
    throw new Error('[S3] S3_BUCKET_NAME environment variable is not set');
  }
  
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    const response = await s3Client.send(command);
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    info('OPTIMIZER', 'S3 download succeeded (memory)', {
      key,
      size: buffer.length,
    });
    
    return buffer;
  } catch (err) {
    error('OPTIMIZER', 'S3 download failed', {
      key,
      errorMessage: err.message,
      errorCode: err.code,
    });
    throw err;
  }
}

/**
 * Extract S3 key from CloudFront URL
 * 
 * @param {string} cloudFrontUrl - CloudFront URL (e.g., "https://d2pj1uqw9p1zhj.cloudfront.net/media/123.mp4")
 * @returns {string} S3 key (e.g., "media/123.mp4")
 */
export function extractS3KeyFromUrl(cloudFrontUrl) {
  if (!cloudFrontUrl || typeof cloudFrontUrl !== 'string') {
    return null;
  }
  
  try {
    const url = new URL(cloudFrontUrl);
    // Remove leading slash from pathname
    return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  } catch {
    // Not a valid URL - might be a relative path
    return cloudFrontUrl.startsWith('/') ? cloudFrontUrl.slice(1) : cloudFrontUrl;
  }
}

/**
 * Generate optimized S3 key from original key
 * 
 * @param {string} originalKey - Original S3 key (e.g., "media/1699999999999-abc123.mp4")
 * @returns {string} Optimized key (e.g., "optimized/1699999999999-abc123.mp4")
 */
export function makeOptimizedKey(originalKey) {
  const pathParts = originalKey.split('/');
  const filename = pathParts[pathParts.length - 1];
  const nameWithoutExt = path.parse(filename).name;
  return `optimized/${nameWithoutExt}.mp4`;
}

/**
 * Upload optimized video to S3 with specific key
 * Used by video optimizer to upload with predefined optimized key
 * 
 * @param {Buffer} buffer - Optimized video buffer
 * @param {string} optimizedKey - Predefined S3 key for optimized video
 * @returns {Promise<{key: string, url: string}>} S3 key and CloudFront URL
 */
export async function uploadOptimizedToS3(buffer, optimizedKey) {
  const bucketName = process.env.S3_BUCKET_NAME;
  const cdnBaseUrl = process.env.CDN_BASE_URL;
  
  if (!bucketName) {
    throw new Error('[S3] S3_BUCKET_NAME environment variable is not set');
  }
  
  if (!cdnBaseUrl) {
    throw new Error('[S3] CDN_BASE_URL environment variable is not set');
  }
  
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: optimizedKey,
      Body: buffer,
      ContentType: 'video/mp4',
    });
    
    await s3Client.send(command);
    
    const cleanCdnBase = cdnBaseUrl.trim().endsWith('/') 
      ? cdnBaseUrl.trim().slice(0, -1) 
      : cdnBaseUrl.trim();
    const url = `${cleanCdnBase}/${optimizedKey}`;
    
    info('OPTIMIZER', 'S3 optimized upload succeeded', {
      key: optimizedKey,
      size: buffer.length,
      bucket: bucketName,
    });
    
    return { key: optimizedKey, url };
  } catch (err) {
    error('OPTIMIZER', 'S3 optimized upload failed', {
      key: optimizedKey,
      errorMessage: err.message,
      errorCode: err.code,
    });
    throw err;
  }
}

