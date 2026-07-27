import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getStorageConfig } from './config.js';
import { makeObjectKey } from './makeObjectKey.js';
import { info, error } from '../logger.js';

/** @type {S3Client | null} */
let cachedClient = null;

/**
 * @returns {S3Client}
 */
export function getS3Client() {
  if (cachedClient) return cachedClient;
  const { region, endpoint, accessKeyId, secretAccessKey } = getStorageConfig();
  cachedClient = new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: Boolean(endpoint),
  });
  return cachedClient;
}

/** Reset cached client (tests). */
export function resetS3ClientForTests() {
  cachedClient = null;
}

/**
 * @returns {import('./localStorageAdapter.js').createLocalStorageAdapter extends (...args: any) => infer R ? R : never}
 */
export function createS3StorageAdapter() {
  const config = getStorageConfig();

  return {
    driver: 's3',

    /**
     * @param {import('./mediaCategories.js').MediaCategory} category
     * @param {Buffer} buffer
     * @param {string} originalName
     * @param {string} mimeType
     * @returns {Promise<{ key: string, url: string }>}
     */
    async uploadBuffer(category, buffer, originalName, mimeType) {
      const key = makeObjectKey(category, originalName, mimeType);
      return uploadWithKeyInternal(key, buffer, mimeType);
    },

    /**
     * @param {string} key
     * @param {Buffer} buffer
     * @param {string} mimeType
     * @returns {Promise<{ key: string, url: string }>}
     */
    async uploadWithKey(key, buffer, mimeType) {
      return uploadWithKeyInternal(key, buffer, mimeType);
    },

    /**
     * @param {string} key
     * @param {number} [ttlSeconds]
     * @returns {Promise<{ url: string, expiresAt: string }>}
     */
    async getPresignedGetUrl(key, ttlSeconds = 3600) {
      const bucket = config.bucket;
      if (!bucket || !key) {
        throw new Error('S3 bucket and key are required for presigned URL');
      }
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const ttl = Math.max(60, Math.min(86400, ttlSeconds));
      const url = await getSignedUrl(getS3Client(), command, { expiresIn: ttl });
      return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
    },
  };

  /**
   * @param {string} key
   * @param {Buffer} buffer
   * @param {string} mimeType
   */
  async function uploadWithKeyInternal(key, buffer, mimeType) {
    const bucket = config.bucket;
    const publicBase = config.publicBaseUrl;
    if (!bucket || !publicBase) {
      throw new Error('[STORAGE] S3 driver requires S3_BUCKET and MEDIA_PUBLIC_BASE_URL');
    }

    let contentType = mimeType || 'application/octet-stream';
    if (String(contentType).toLowerCase() === 'video/quicktime') {
      contentType = 'video/mp4';
    } else if (!contentType.startsWith('video/') && /\.mp4$/i.test(key)) {
      contentType = 'video/mp4';
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    try {
      await getS3Client().send(command);
      const url = `${publicBase}/${key}`;
      info('UPLOAD', 'S3/R2 upload succeeded', {
        key,
        mimeType: mimeType || 'unknown',
        size: buffer.length,
        bucket,
      });
      return { key, url };
    } catch (err) {
      error('UPLOAD', 'S3/R2 upload failed', {
        errorMessage: err.message,
        key,
        bucket,
      });
      throw err;
    }
  }
}

/**
 * @param {string} key
 * @param {string | null} [outputPath]
 * @returns {Promise<string>}
 */
export async function downloadFromS3ToFile(key, outputPath = null) {
  const { bucket } = getStorageConfig();
  if (!bucket) {
    throw new Error('[STORAGE] S3_BUCKET is not set');
  }

  const { createTempPath } = await import('../tempFiles.js');
  const fs = await import('fs');
  const path = await import('path');

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await getS3Client().send(command);

  if (!outputPath) {
    const ext = path.extname(key) || '.mp4';
    outputPath = createTempPath('cardbey-s3-', ext);
  }

  const fileStream = fs.createWriteStream(outputPath);
  let totalBytes = 0;
  for await (const chunk of response.Body) {
    fileStream.write(chunk);
    totalBytes += chunk.length;
  }
  fileStream.end();
  await new Promise((resolve, reject) => {
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  info('OPTIMIZER', 'S3/R2 download succeeded', { key, outputPath, size: totalBytes });
  return outputPath;
}

/**
 * @param {string} key
 * @returns {Promise<Buffer>}
 */
export async function downloadFromS3(key) {
  const { bucket } = getStorageConfig();
  if (!bucket) {
    throw new Error('[STORAGE] S3_BUCKET is not set');
  }
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await getS3Client().send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
