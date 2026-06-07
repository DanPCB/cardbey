// DANH: kling-video-storage

import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import { randomUUID } from 'crypto';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * Downloads a video from a URL and saves it
 * to /uploads/media/. Returns the local path.
 */
export async function downloadAndStoreVideo(
  videoUrl,
  { prefix = 'kling', timeoutMs = 30_000 } = {},
) {
  mkdirSync(UPLOADS_DIR, { recursive: true });

  const filename = `${Date.now()}-${prefix}-${randomUUID().slice(0, 8)}.mp4`;
  const localPath = path.join(UPLOADS_DIR, filename);
  const publicPath = `/uploads/media/${filename}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(videoUrl, {
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Download failed: ${res.status}`);
    }

    if (!res.body) {
      throw new Error('Download failed: empty response body');
    }

    const fileStream = createWriteStream(localPath);
    await pipeline(Readable.fromWeb(res.body), fileStream);

    return {
      localPath,
      publicPath,
      filename,
    };
  } finally {
    clearTimeout(timeout);
  }
}
