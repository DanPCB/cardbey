/**
 * Persist generated video bytes to local uploads (durable URL for artifact).
 */

import fs from 'fs';
import path from 'path';
import { buildPublicUrl } from '../../utils/publicUrl.js';

/**
 * @param {Buffer} buffer
 * @param {{ prefix?: string; extension?: string }} [opts]
 * @returns {Promise<{ relativeUrl: string; publicUrl: string; filePath: string; sizeBytes: number }>}
 */
export async function saveGeneratedVideoToUploads(buffer, opts = {}) {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const prefix = String(opts.prefix ?? 'openai-video').replace(/[^a-z0-9-_]/gi, '-');
  const ext = String(opts.extension ?? 'mp4').replace(/^\./, '');
  const fileName = `${prefix}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadsDir, fileName);
  await fs.promises.writeFile(filePath, buffer);

  const relativeUrl = `/uploads/${fileName}`;
  const publicUrl = buildPublicUrl(relativeUrl);

  return {
    relativeUrl,
    publicUrl,
    filePath,
    sizeBytes: buffer.length,
  };
}
