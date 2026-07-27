/**
 * ffprobe helpers for video audio stream detection.
 */

import fs from 'fs';
import path from 'path';
import { probeVideoFile } from '../../videoCompat.js';
import { createTempPath, safeUnlink } from '../../tempFiles.js';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * @param {string} videoUrl
 * @returns {string | null}
 */
export function resolveLocalVideoPath(videoUrl) {
  const url = String(videoUrl ?? '').trim();
  if (!url) return null;
  if (url.startsWith('/uploads/')) {
    const local = path.join(UPLOADS_DIR, path.basename(url));
    return fs.existsSync(local) ? local : null;
  }
  if (/^https?:\/\//i.test(url)) return null;
  if (fs.existsSync(url)) return url;
  return null;
}

/**
 * @param {string} videoUrl
 * @returns {Promise<string>}
 */
export async function ensureLocalVideoFile(videoUrl) {
  const existing = resolveLocalVideoPath(videoUrl);
  if (existing) return existing;

  const url = String(videoUrl ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('video_file_not_found');
  }

  const out = createTempPath('cardbey-vid-', '.mp4');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`video_download_failed:${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(out, buf);
  return out;
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
export async function fileHasAudioStream(filePath) {
  const probe = await probeVideoFile(filePath);
  return Boolean(probe?.audio?.codec);
}

/**
 * @param {string} videoUrl
 * @returns {Promise<{ hasAudio: boolean, localPath: string, downloaded: boolean }>}
 */
export async function probeVideoUrlForAudio(videoUrl) {
  let localPath = resolveLocalVideoPath(videoUrl);
  let downloaded = false;
  if (!localPath) {
    localPath = await ensureLocalVideoFile(videoUrl);
    downloaded = true;
  }
  try {
    const hasAudio = await fileHasAudioStream(localPath);
    return { hasAudio, localPath, downloaded };
  } catch {
    if (downloaded) await safeUnlink(localPath);
    return { hasAudio: false, localPath, downloaded };
  }
}
