// DANH: kling-video-storage

import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import { randomUUID } from 'crypto';
import { uploadBuffer, isS3StorageEnabled } from '../storage/index.js';
import { normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * Downloads a video from a URL and stores it via the configured storage driver.
 */
export async function downloadAndStoreVideo(
  videoUrl,
  { prefix = 'kling', timeoutMs = 30_000 } = {},
) {
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

    const chunks = [];
    for await (const chunk of Readable.fromWeb(res.body)) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const filename = `${Date.now()}-${prefix}-${randomUUID().slice(0, 8)}.mp4`;

    if (isS3StorageEnabled()) {
      const { key, url } = await uploadBuffer(buffer, filename, 'video/mp4', 'videos');
      const publicPath = normalizeMediaUrlForStorage(url, null);
      return {
        localPath: null,
        publicPath,
        filename: path.basename(key),
        iosSafePublicPath: publicPath,
        iosSafeLocalPath: null,
        createdIosDerivative: false,
        heroVideoUrlOriginal: publicPath,
        heroVideoUrlIosSafe: publicPath,
        storageKey: key,
      };
    }

    mkdirSync(UPLOADS_DIR, { recursive: true });
    const localPath = path.join(UPLOADS_DIR, filename);
    const publicPath = `/uploads/media/${filename}`;
    const fileStream = createWriteStream(localPath);
    await pipeline(Readable.from([buffer]), fileStream);

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
