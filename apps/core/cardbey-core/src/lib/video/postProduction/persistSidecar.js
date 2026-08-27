/**
 * Persist caption sidecars next to generated media.
 */

import fs from 'fs';
import path from 'path';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * @param {string} content
 * @param {'vtt' | 'srt'} kind
 * @returns {Promise<{ ok: boolean, publicPath?: string, localPath?: string, error?: string }>}
 */
export async function persistCaptionSidecar(content, kind = 'vtt') {
  const body = String(content ?? '').trim();
  if (!body) return { ok: false, error: 'empty_sidecar' };
  const ext = kind === 'srt' ? '.srt' : '.vtt';
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `${Date.now()}-captions${ext}`;
    const localPath = path.join(UPLOADS_DIR, filename);
    await fs.promises.writeFile(localPath, body, 'utf8');
    return { ok: true, publicPath: `/uploads/media/${filename}`, localPath };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
