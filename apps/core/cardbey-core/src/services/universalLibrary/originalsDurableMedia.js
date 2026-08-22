/**
 * Optional durable upload for Cardbey Originals when S3/R2 is configured.
 * Falls back to relative public paths served by Core (/assets, /videos).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getStorageStatus, isS3StorageEnabled, uploadBuffer } from '../../lib/storage/index.js';

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  return 'application/octet-stream';
}

/**
 * @param {string} absPath
 * @param {string} [logicalName]
 * @returns {Promise<{ ok: true, url: string, key?: string, durable: boolean } | { ok: false, error: string }>}
 */
export async function ensureDurablePublicUrl(absPath, logicalName) {
  if (!absPath || !fs.existsSync(absPath)) {
    return { ok: false, error: 'source_file_missing' };
  }
  if (!isS3StorageEnabled()) {
    return { ok: false, error: 's3_not_configured' };
  }
  try {
    const buf = fs.readFileSync(absPath);
    const name = logicalName || path.basename(absPath);
    const mime = guessMime(absPath);
    const uploaded = await uploadBuffer(buf, name, mime, 'artifacts');
    if (!uploaded?.url) return { ok: false, error: 'upload_failed' };
    return { ok: true, url: uploaded.url, key: uploaded.key, durable: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'upload_failed' };
  }
}

/**
 * Prefer durable CDN URL; otherwise keep relative public path for Core static.
 * @param {{ absPath?: string | null, relativePublicPath?: string | null, logicalName?: string }} input
 */
export async function resolveOriginalsMediaUrl(input) {
  const rel = String(input.relativePublicPath || '').trim();
  const abs = input.absPath;
  if (abs && isS3StorageEnabled()) {
    const durable = await ensureDurablePublicUrl(abs, input.logicalName);
    if (durable.ok) return { url: durable.url, durable: true, key: durable.key };
  }
  if (rel.startsWith('/')) return { url: rel, durable: false };
  if (rel) return { url: `/${rel.replace(/^\//, '')}`, durable: false };
  return { url: null, durable: false };
}

export function originalsStorageStatus() {
  return getStorageStatus();
}
