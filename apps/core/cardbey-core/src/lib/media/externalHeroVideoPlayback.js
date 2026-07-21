/**
 * Durable playback for third-party hotlinked hero videos (e.g. Pexels).
 * Those origins often return Content-Disposition: attachment, which breaks iOS Safari <video>.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { downloadAndStoreVideo } from '../video/downloadVideo.js';

const ALLOWED_HOST_SUFFIXES = [
  'videos.pexels.com',
  'player.vimeo.com',
  'cdn.coverr.co',
  'assets.coverr.co',
  'storage.coverr.co',
  'cdn.pixabay.com',
  'assets.mixkit.co',
];

/** @type {Map<string, Promise<{ publicPath: string, storageKey?: string }>>} */
const inflight = new Map();

export function isAllowlistedExternalHeroVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function needsDurableHeroVideoIngest(url) {
  return isAllowlistedExternalHeroVideoUrl(url);
}

export function hashExternalHeroVideoUrl(url) {
  return crypto.createHash('sha256').update(String(url).trim()).digest('hex').slice(0, 24);
}

/**
 * Download + store once per source URL. Safe to call from request handlers (deduped).
 * @returns {Promise<{ publicPath: string, storageKey?: string, created: boolean } | null>}
 */
export async function ensureDurableHeroVideo(url, { prefix = 'hero-ext' } = {}) {
  const source = String(url || '').trim();
  if (!needsDurableHeroVideoIngest(source)) return null;

  const key = hashExternalHeroVideoUrl(source);
  if (inflight.has(key)) {
    const existing = await inflight.get(key);
    return existing ? { ...existing, created: false } : null;
  }

  const work = (async () => {
    const stored = await downloadAndStoreVideo(source, {
      prefix: `${prefix}-${key.slice(0, 8)}`,
      timeoutMs: 90_000,
    });
    if (!stored?.publicPath) {
      throw new Error('durable_hero_ingest_empty');
    }
    return {
      publicPath: stored.iosSafePublicPath || stored.publicPath,
      storageKey: stored.storageKey,
    };
  })();

  inflight.set(key, work);
  try {
    const result = await work;
    return { ...result, created: true };
  } finally {
    inflight.delete(key);
  }
}

/**
 * Rewrite a public absolute/relative hero URL to Cardbey playback when source is hotlinked.
 * @param {string | null | undefined} url
 * @param {(path: string) => string} absolutize - turns /uploads/... into absolute for clients
 */
export function rewriteHotlinkHeroVideoForPlayback(url, absolutize) {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw || !needsDurableHeroVideoIngest(raw)) return raw;
  const encoded = Buffer.from(raw, 'utf8').toString('base64url');
  const proxyPath = `/api/public/media/hero-playback/${encoded}`;
  return typeof absolutize === 'function' ? absolutize(proxyPath) : proxyPath;
}

export function decodeHeroPlaybackToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const url = Buffer.from(token, 'base64url').toString('utf8');
    if (!needsDurableHeroVideoIngest(url)) return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveHeroPlaybackCachePath(uploadsDir, sourceUrl) {
  const hash = hashExternalHeroVideoUrl(sourceUrl);
  return path.join(uploadsDir, 'media', 'external-hero', `${hash}.mp4`);
}

export function ensureHeroPlaybackCacheDir(uploadsDir) {
  const dir = path.join(uploadsDir, 'media', 'external-hero');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
