/**
 * Persist generated video bytes via configured storage driver.
 */

import { uploadBuffer, isS3StorageEnabled } from '../storage/index.js';
import { normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';

/**
 * @param {Buffer} buffer
 * @param {{ prefix?: string; extension?: string }} [opts]
 * @returns {Promise<{ relativeUrl: string; publicUrl: string; filePath: string | null; sizeBytes: number; storageKey: string }>}
 */
export async function saveGeneratedVideoToUploads(buffer, opts = {}) {
  const prefix = String(opts.prefix ?? 'openai-video').replace(/[^a-z0-9-_]/gi, '-');
  const ext = String(opts.extension ?? 'mp4').replace(/^\./, '');
  const originalName = `${prefix}.${ext}`;

  const { key, url } = await uploadBuffer(buffer, originalName, 'video/mp4', 'videos');
  const storedUrl = normalizeMediaUrlForStorage(url, null);

  return {
    relativeUrl: isS3StorageEnabled() ? storedUrl : url,
    publicUrl: storedUrl,
    filePath: isS3StorageEnabled() ? null : url,
    sizeBytes: buffer.length,
    storageKey: key,
  };
}
