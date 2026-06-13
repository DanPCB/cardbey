/**
 * Persist vision intake images under the existing uploads/media convention.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * @param {string} mimeType
 */
function extFromMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('heic') || mime.includes('heif')) return '.heic';
  return '.jpg';
}

/**
 * @param {Array<{ buffer: Buffer, mimetype?: string }>} files
 * @returns {string[]} public paths like /uploads/media/vision-intake-{uuid}.jpg
 */
export function saveVisionUploadFiles(files = []) {
  if (!Array.isArray(files) || files.length === 0) return [];
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const paths = [];
  for (const file of files) {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) continue;
    const ext = extFromMime(file.mimetype);
    const filename = `vision-intake-${randomUUID()}${ext}`;
    const dest = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(dest, file.buffer);
    paths.push(`/uploads/media/${filename}`);
  }
  return paths;
}

/**
 * @param {string} publicPath
 * @returns {string|null}
 */
export function resolveVisionUploadAbsolutePath(publicPath) {
  const basename = path.basename(String(publicPath || ''));
  if (!basename) return null;
  return path.join(UPLOADS_DIR, basename);
}
