import { getStorageConfig, validateS3StorageConfig, resolveStorageDriver } from './config.js';
import { createLocalStorageAdapter } from './localStorageAdapter.js';
import { createS3StorageAdapter } from './s3StorageAdapter.js';
import { warn } from '../logger.js';

export { MEDIA_CATEGORIES, isMediaCategory } from './mediaCategories.js';
export { makeObjectKey, makeLegacyMediaKey, resolveExtension } from './makeObjectKey.js';
export {
  getStorageConfig,
  validateS3StorageConfig,
  resolveStorageDriver,
  resolveMediaPublicBaseUrl,
  isS3StorageEnabled,
} from './config.js';
export {
  getS3Client,
  downloadFromS3,
  downloadFromS3ToFile,
  resetS3ClientForTests,
} from './s3StorageAdapter.js';

/** @type {ReturnType<typeof createLocalStorageAdapter> | ReturnType<typeof createS3StorageAdapter> | null} */
let adapterInstance = null;

/**
 * @returns {ReturnType<typeof createLocalStorageAdapter> | ReturnType<typeof createS3StorageAdapter>}
 */
export function getStorageAdapter() {
  if (adapterInstance) return adapterInstance;

  const validation = validateS3StorageConfig();
  if (!validation.ok) {
    const msg = `[STORAGE] S3 driver misconfigured; missing: ${validation.missing.join(', ')}`;
    if (resolveStorageDriver() === 's3') {
      throw new Error(msg);
    }
    warn('STORAGE', msg);
  }

  const { driver } = getStorageConfig();
  adapterInstance = driver === 's3' ? createS3StorageAdapter() : createLocalStorageAdapter();
  return adapterInstance;
}

/** @param {import('./mediaCategories.js').MediaCategory} [category] */
export function resetStorageAdapterForTests() {
  adapterInstance = null;
  import('./s3StorageAdapter.js').then((m) => m.resetS3ClientForTests());
}

/**
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} mimeType
 * @param {import('./mediaCategories.js').MediaCategory} [category='artifacts']
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function uploadBuffer(buffer, originalName, mimeType, category = 'artifacts') {
  const adapter = getStorageAdapter();
  return adapter.uploadBuffer(category, buffer, originalName, mimeType);
}

/**
 * @param {string} key
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function uploadBufferWithKey(key, buffer, mimeType) {
  const adapter = getStorageAdapter();
  return adapter.uploadWithKey(key, buffer, mimeType);
}

/**
 * @returns {{ driver: string, bucket: string | null, publicBaseUrl: string | null }}
 */
export function getStorageStatus() {
  const { driver, bucket, publicBaseUrl } = getStorageConfig();
  return { driver, bucket, publicBaseUrl };
}

/**
 * Startup log: [STORAGE] driver=s3 bucket=cardbey-media
 */
export function logStorageBoot() {
  const { driver, bucket } = getStorageConfig();
  console.log('[STORAGE]');
  console.log(`driver=${driver}`);
  if (driver === 's3') {
    console.log(`bucket=${bucket ?? '(not set)'}`);
    const { publicBaseUrl } = getStorageConfig();
    if (publicBaseUrl) {
      console.log(`publicBaseUrl=${publicBaseUrl}`);
    }
  }
}
