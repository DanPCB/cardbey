/**
 * Minimal storage wrapper for Seed Library assets.
 * Writes to a dedicated directory (no mixing with user uploads). Uses local disk only.
 * Optional: later add S3 path via env.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const DEFAULT_DIR = 'storage/seed-assets';
const SUBDIR = 'seed-assets';

/**
 * Resolve storage root (env SEED_LIBRARY_STORAGE_PATH or cwd/DEFAULT_DIR).
 */
function getStorageDir() {
  const base = process.env.SEED_LIBRARY_STORAGE_PATH || path.join(process.cwd(), DEFAULT_DIR);
  return path.isAbsolute(base) ? base : path.join(process.cwd(), base);
}

/**
 * Save a buffer for a seed asset. Path: seed-assets/{provider}/{providerAssetId}_{variant}.{ext}
 * @param {Buffer} buffer
 * @param {string} provider - e.g. "pexels"
 * @param {string} providerAssetId
 * @param {string} ext - e.g. "jpg"
 * @param {string} [variant] - e.g. "full" | "thumb"
 * @returns {{ key: string, url: string, absolutePath: string }}
 */
export function saveSeedAssetBuffer(buffer, provider, providerAssetId, ext = 'jpg', variant = 'full') {
  const root = getStorageDir();
  const dir = path.join(root, provider);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const safeId = String(providerAssetId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = variant === 'full' ? `${safeId}.${ext}` : `${safeId}_${variant}.${ext}`;
  const absolutePath = path.join(dir, filename);
  fs.writeFileSync(absolutePath, buffer);

  const key = `${SUBDIR}/${provider}/${filename}`;
  const url = `/${key}`;
  return { key, url, absolutePath };
}

/**
 * Compute sha256 hex of buffer.
 * @param {Buffer} buffer
 * @returns {string}
 */
export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
