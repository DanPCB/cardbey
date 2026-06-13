/**
 * Generate and persist explore featured video poster frames (thumbnailUrl).
 * Failures are non-fatal — callers fall back to gradient UI.
 */
import fs from 'fs';
import path from 'path';
import { createTempPath, safeUnlink } from '../../lib/tempFiles.js';
import { extractPosterJpegFromBuffer, extractPosterJpegFromFile } from '../../lib/video/extractVideoPosterFrame.js';
import { uploadBuffer } from '../../lib/storage/index.js';
import { buildPublicUrl, fileExistsOnDisk } from '../../utils/publicUrl.js';
import { validateExploreVideoPublishUrl } from './exploreVideoUrlValidation.js';

/**
 * @param {Buffer} videoBuffer
 * @param {{ originalName?: string, durationSec?: number | null, context?: string }} [opts]
 * @returns {Promise<{ ok: true, url: string } | { ok: false, error: string }>}
 */
export async function generateExploreVideoPosterFromBuffer(videoBuffer, opts = {}) {
  const context = opts.context ?? 'explore.poster';
  try {
    const jpeg = await extractPosterJpegFromBuffer(videoBuffer, {
      originalName: opts.originalName ?? 'explore-video.mp4',
      durationSec: opts.durationSec ?? null,
    });
    const upload = await uploadBuffer(
      jpeg,
      `explore-poster-${Date.now()}.jpg`,
      'image/jpeg',
      'stores',
    );
    return { ok: true, url: upload.url };
  } catch (err) {
    console.warn(`[${context}] poster generation failed (non-fatal):`, err?.message || err);
    return { ok: false, error: err?.message || 'poster_generation_failed' };
  }
}

/**
 * Resolve a local filesystem path for /uploads/* URLs when the file exists on disk.
 * @param {string} videoUrl
 */
function resolveLocalVideoPath(videoUrl) {
  const trimmed = String(videoUrl ?? '').trim();
  if (!trimmed) return null;

  let relative = null;
  if (trimmed.startsWith('/uploads/')) {
    relative = trimmed;
  } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const pathname = new URL(trimmed).pathname;
      if (pathname.startsWith('/uploads/')) relative = pathname;
    } catch {
      return null;
    }
  }

  if (!relative || !fileExistsOnDisk(relative)) return null;
  const clean = relative.startsWith('/') ? relative.slice(1) : relative;
  return path.join(process.cwd(), clean);
}

/**
 * @param {string} videoUrl
 * @param {{ req?: import('express').Request | null, durationSec?: number | null, context?: string }} [opts]
 */
export async function generateExploreVideoPosterFromUrl(videoUrl, opts = {}) {
  const context = opts.context ?? 'explore.poster.url';
  const trimmed = String(videoUrl ?? '').trim();
  if (!trimmed) return { ok: false, error: 'missing_video_url' };

  const validation = await validateExploreVideoPublishUrl(trimmed, { req: opts.req });
  if (!validation.ok) {
    return { ok: false, error: validation.code || 'video_not_playable' };
  }

  const localPath = resolveLocalVideoPath(trimmed);
  let tempVideoPath = null;

  try {
    let sourcePath = localPath;
    if (!sourcePath) {
      const headUrl = trimmed.startsWith('/')
        ? buildPublicUrl(trimmed, opts.req)
        : trimmed;
      const res = await fetch(headUrl);
      if (!res.ok) {
        return { ok: false, error: `download_failed_${res.status}` };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      tempVideoPath = createTempPath('cardbey-poster-fetch-', '.mp4');
      await fs.promises.writeFile(tempVideoPath, buf);
      sourcePath = tempVideoPath;
    }

    const outputPath = createTempPath('cardbey-poster-out-', '.jpg');
    try {
      const jpeg = await extractPosterJpegFromFile(sourcePath, outputPath, {
        durationSec: opts.durationSec ?? null,
      });
      const upload = await uploadBuffer(
        jpeg,
        `explore-poster-${Date.now()}.jpg`,
        'image/jpeg',
        'stores',
      );
      return { ok: true, url: upload.url };
    } finally {
      await safeUnlink(outputPath);
    }
  } catch (err) {
    console.warn(`[${context}] poster from url failed (non-fatal):`, err?.message || err);
    return { ok: false, error: err?.message || 'poster_generation_failed' };
  } finally {
    if (tempVideoPath) await safeUnlink(tempVideoPath);
  }
}

/**
 * Ensure projection hero has posterUrl when video hero lacks one (publish pipeline).
 * @param {object} projection
 * @param {{ req?: import('express').Request | null }} [opts]
 * @returns {Promise<object>}
 */
export async function ensureProjectionHeroPoster(projection, opts = {}) {
  const hero = projection?.hero;
  if (!hero || typeof hero !== 'object') return projection;
  const videoUrl = typeof hero.videoUrl === 'string' ? hero.videoUrl.trim() : '';
  if (!videoUrl) return projection;

  const existingPoster =
    (typeof hero.posterUrl === 'string' && hero.posterUrl.trim()) ||
    (typeof hero.imageUrl === 'string' &&
      hero.imageUrl.trim() &&
      !/\.(mp4|webm|mov)(\?|#|$)/i.test(hero.imageUrl)
      ? hero.imageUrl.trim()
      : '');
  if (existingPoster) return projection;

  const poster = await generateExploreVideoPosterFromUrl(videoUrl, {
    req: opts.req,
    context: 'publish.hero.poster',
  });
  if (!poster.ok || !poster.url) return projection;

  return {
    ...projection,
    hero: {
      ...hero,
      posterUrl: poster.url,
      imageUrl: poster.url,
    },
  };
}
