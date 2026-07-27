// src/lib/s3Client.js
// Compatibility facade over src/lib/storage (local filesystem or S3/R2).

import path from 'path';
import {
  uploadBuffer,
  uploadBufferWithKey,
  getStorageConfig,
  isS3StorageEnabled,
  makeLegacyMediaKey,
  resolveMediaPublicBaseUrl,
} from './storage/index.js';
import {
  downloadFromS3,
  downloadFromS3ToFile,
  getS3Client,
} from './storage/s3StorageAdapter.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { info, error } from './logger.js';

/**
 * @deprecated Prefer makeObjectKey(category, ...) from storage module.
 * Legacy flat key for optimized video pipeline compatibility.
 */
export function makeMediaKey(originalName) {
  return makeLegacyMediaKey(originalName);
}

/**
 * Upload buffer via configured storage driver.
 *
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} mimeType
 * @param {import('./storage/mediaCategories.js').MediaCategory} [category='artifacts']
 * @returns {Promise<{key: string, url: string}>}
 */
export async function uploadBufferToS3(buffer, originalName, mimeType, category = 'artifacts') {
  return uploadBuffer(buffer, originalName, mimeType, category);
}

/**
 * @param {string} key
 * @param {number} [ttlSeconds=3600]
 * @returns {Promise<{ url: string, expiresAt: string }>}
 */
export async function getPresignedGetUrl(key, ttlSeconds = 3600) {
  if (!isS3StorageEnabled()) {
    throw new Error('Presigned URLs require STORAGE_DRIVER=s3 with bucket credentials');
  }
  const { bucket } = getStorageConfig();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const ttl = Math.max(60, Math.min(86400, ttlSeconds));
  const url = await getSignedUrl(getS3Client(), command, { expiresIn: ttl });
  return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
}

export { downloadFromS3, downloadFromS3ToFile };

/**
 * @param {string} publicUrl
 * @returns {string | null}
 */
export function extractS3KeyFromUrl(publicUrl) {
  if (!publicUrl || typeof publicUrl !== 'string') {
    return null;
  }

  const mediaBase = resolveMediaPublicBaseUrl();
  if (mediaBase && publicUrl.startsWith(mediaBase)) {
    return publicUrl.slice(mediaBase.length).replace(/^\//, '');
  }

  const legacyCdn = process.env.CDN_BASE_URL?.trim().replace(/\/$/, '');
  if (legacyCdn && publicUrl.startsWith(legacyCdn)) {
    return publicUrl.slice(legacyCdn.length).replace(/^\//, '');
  }

  try {
    const url = new URL(publicUrl);
    return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  } catch {
    return publicUrl.startsWith('/') ? publicUrl.slice(1) : publicUrl;
  }
}

/**
 * @param {string} originalKey
 * @returns {string}
 */
export function makeOptimizedKey(originalKey) {
  const pathParts = originalKey.split('/');
  const filename = pathParts[pathParts.length - 1];
  const nameWithoutExt = path.parse(filename).name;
  return `optimized/${nameWithoutExt}.mp4`;
}

/**
 * @param {Buffer} buffer
 * @param {string} optimizedKey
 * @returns {Promise<{key: string, url: string}>}
 */
export async function uploadOptimizedToS3(buffer, optimizedKey) {
  if (!isS3StorageEnabled()) {
    return uploadBufferWithKey(optimizedKey, buffer, 'video/mp4');
  }

  const { bucket, publicBaseUrl } = getStorageConfig();
  if (!bucket || !publicBaseUrl) {
    throw new Error('[STORAGE] S3 optimized upload requires bucket and MEDIA_PUBLIC_BASE_URL');
  }

  try {
    const result = await uploadBufferWithKey(optimizedKey, buffer, 'video/mp4');
    info('OPTIMIZER', 'S3 optimized upload succeeded', {
      key: optimizedKey,
      size: buffer.length,
      bucket,
    });
    return result;
  } catch (err) {
    error('OPTIMIZER', 'S3 optimized upload failed', {
      key: optimizedKey,
      errorMessage: err.message,
    });
    throw err;
  }
}
