import path from 'path';
import { randomUUID } from 'crypto';
import { isMediaCategory } from './mediaCategories.js';

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'application/zip': '.zip',
  'application/pdf': '.pdf',
};

/**
 * @param {string | null | undefined} originalName
 * @param {string | null | undefined} mimeType
 * @returns {string}
 */
export function resolveExtension(originalName, mimeType) {
  const fromName = path.extname(String(originalName ?? '')).toLowerCase();
  if (fromName) return fromName;
  const mime = String(mimeType ?? '').toLowerCase();
  return MIME_EXT[mime] ?? '.bin';
}

/**
 * Build object key: media/{category}/{uuid}{ext}
 *
 * @param {import('./mediaCategories.js').MediaCategory} category
 * @param {string} originalName
 * @param {string} [mimeType]
 * @returns {string}
 */
export function makeObjectKey(category, originalName, mimeType = '') {
  const folder = isMediaCategory(category) ? category : 'artifacts';
  const ext = resolveExtension(originalName, mimeType);
  return `media/${folder}/${randomUUID()}${ext}`;
}

/**
 * Legacy flat key for backward-compatible reads (optimized videos, old rows).
 * @param {string} originalName
 * @returns {string}
 */
export function makeLegacyMediaKey(originalName) {
  const ext = resolveExtension(originalName, '');
  return `media/${randomUUID()}${ext}`;
}
