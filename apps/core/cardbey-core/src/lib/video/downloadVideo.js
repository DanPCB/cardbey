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

    let iosSafePublicPath = publicPath;
    let iosSafeLocalPath = localPath;
    let createdIosDerivative = false;
    try {
      const { ensureIosSafeVideoDerivativeOnDisk } = await import('../videoIosSafe.js');
      const derivative = await ensureIosSafeVideoDerivativeOnDisk(localPath);
      iosSafePublicPath = derivative.iosSafePublicPath;
      iosSafeLocalPath = derivative.iosSafeLocalPath;
      createdIosDerivative = derivative.createdDerivative;
      if (createdIosDerivative) {
        console.log('[VIDEO_IOS_SAFE] kling download derivative ready', {
          original: publicPath,
          iosSafe: iosSafePublicPath,
        });
      }
    } catch (derivErr) {
      console.warn('[VIDEO_IOS_SAFE] derivative step failed (non-fatal):', derivErr?.message ?? derivErr);
    }

    return {
      localPath,
      publicPath,
      filename,
      iosSafePublicPath,
      iosSafeLocalPath,
      createdIosDerivative,
      heroVideoUrlOriginal: publicPath,
      heroVideoUrlIosSafe: iosSafePublicPath,
    };
  } finally {
    clearTimeout(timeout);
  }
}
