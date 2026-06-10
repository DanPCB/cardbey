import {
  buildMediaUrl,
  isCloudFrontUrl,
  normalizeMediaUrlForStorage,
} from '../../utils/publicUrl.js';
import { getStorageConfig, resolveStorageDriver } from './config.js';

/**
 * @param {'image' | 'video'} mediaType
 * @param {string} mime
 * @returns {'image' | 'video'}
 */
function normalizeMediaType(mediaType, mime) {
  if (mediaType === 'video' || mediaType === 'image') return mediaType;
  return String(mime || '').toLowerCase().startsWith('video/') ? 'video' : 'image';
}

/**
 * Build a consistent client + DB upload payload.
 *
 * @param {{
 *   storageUrl: string,
 *   key: string,
 *   mime: string,
 *   mediaType?: 'image' | 'video',
 *   req?: import('express').Request | null,
 * }} input
 */
export function buildStorageUploadResponse({ storageUrl, key, mime, mediaType, req = null }) {
  const driver = resolveStorageDriver();
  const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);
  const resolvedMediaType = normalizeMediaType(mediaType, mime);

  let publicUrl = buildMediaUrl(normalizedUrl, req) || normalizedUrl;

  if (driver === 's3') {
    if (isCloudFrontUrl(normalizedUrl)) {
      publicUrl = normalizedUrl;
    } else if (publicUrl.includes('/uploads/') && isCloudFrontUrl(storageUrl)) {
      publicUrl = storageUrl;
    }
  }

  const payload = {
    url: publicUrl,
    publicUrl,
    key,
    mimeType: mime || 'application/octet-stream',
    mediaType: resolvedMediaType,
    storageDriver: driver,
    storageKey: key,
    normalizedUrl,
  };

  console.log('[STORAGE_UPLOAD_RESULT]', {
    url: publicUrl,
    key,
    mimeType: payload.mimeType,
    mediaType: resolvedMediaType,
    storageDriver: driver,
  });

  return payload;
}

/**
 * Resolve hero/client-facing URL — never downgrade CDN URL to Core /uploads.
 *
 * @param {string | null | undefined} storedUrl
 * @param {string} uploadPublicUrl
 * @param {import('express').Request | null} [req]
 */
export function resolveClientHeroMediaUrl(storedUrl, uploadPublicUrl, req = null) {
  const stored = typeof storedUrl === 'string' ? storedUrl.trim() : '';
  if (stored && isCloudFrontUrl(stored)) return stored;
  if (stored) {
    const built = buildMediaUrl(stored, req);
    if (built && isCloudFrontUrl(built)) return built;
    if (built && !built.includes('/uploads/')) return built;
  }
  return uploadPublicUrl;
}
