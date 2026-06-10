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
  const resolvedMediaType = normalizeMediaType(mediaType, mime);

  let normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);
  let publicUrl = buildMediaUrl(normalizedUrl, req) || normalizedUrl;

  if (driver === 's3') {
    const cdnUrl = isCloudFrontUrl(storageUrl)
      ? storageUrl
      : isCloudFrontUrl(normalizedUrl)
        ? normalizedUrl
        : null;
    if (cdnUrl) {
      publicUrl = cdnUrl;
      normalizedUrl = cdnUrl;
    } else if (publicUrl.includes('/uploads/') && isCloudFrontUrl(storageUrl)) {
      publicUrl = storageUrl;
      normalizedUrl = storageUrl;
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

  if (resolvedMediaType === 'video') {
    console.log('[HERO_VIDEO_UPLOAD_RESULT]', {
      publicUrl,
      key,
      mimeType: payload.mimeType,
      storageDriver: driver,
      normalizedUrl,
    });
  }

  return payload;
}

/**
 * URL to persist on draft/business hero fields after upload.
 * Never downgrade R2/CDN public URL to Core /uploads.
 *
 * @param {ReturnType<typeof buildStorageUploadResponse>} uploadPayload
 */
export function resolvePersistedHeroMediaUrl(uploadPayload) {
  if (!uploadPayload || typeof uploadPayload !== 'object') return '';
  const publicUrl = typeof uploadPayload.publicUrl === 'string' ? uploadPayload.publicUrl.trim() : '';
  const normalizedUrl =
    typeof uploadPayload.normalizedUrl === 'string' ? uploadPayload.normalizedUrl.trim() : '';
  if (publicUrl && isCloudFrontUrl(publicUrl)) return publicUrl;
  if (normalizedUrl && isCloudFrontUrl(normalizedUrl)) return normalizedUrl;
  return publicUrl || normalizedUrl || '';
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

  const upload =
    typeof uploadPublicUrl === 'string' && uploadPublicUrl.trim() ? uploadPublicUrl.trim() : '';
  if (upload && isCloudFrontUrl(upload)) return upload;

  if (stored) {
    const built = buildMediaUrl(stored, req);
    if (built && isCloudFrontUrl(built)) return built;
    if (built && !built.includes('/uploads/')) return built;
  }
  return upload || stored;
}
