/**
 * Public hero video playback — caches allowlisted hotlinks and serves with
 * Content-Disposition: inline + byte Range (iOS Safari safe).
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  decodeHeroPlaybackToken,
  ensureDurableHeroVideo,
  ensureHeroPlaybackCacheDir,
  resolveHeroPlaybackCachePath,
} from '../lib/media/externalHeroVideoPlayback.js';

const router = express.Router();

function uploadsRoot() {
  return process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR, '..')
    : path.join(process.cwd(), 'uploads');
}

function applyInlineVideoHeaders(res, size) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  if (size != null) res.setHeader('Content-Length', String(size));
}

async function ensureLocalCacheFile(sourceUrl) {
  const root = uploadsRoot();
  ensureHeroPlaybackCacheDir(root);
  const cachePath = resolveHeroPlaybackCachePath(root, sourceUrl);
  if (fs.existsSync(cachePath)) {
    const st = fs.statSync(cachePath);
    if (st.isFile() && st.size > 0) return cachePath;
  }

  // Prefer storage pipeline (R2 when enabled); also keep a local cache copy for Range serving.
  const durable = await ensureDurableHeroVideo(sourceUrl, { prefix: 'hero-ext' });
  if (durable?.publicPath?.startsWith('/uploads/')) {
    const fromUploads = path.join(root, durable.publicPath.replace(/^\/uploads\//, ''));
    if (fs.existsSync(fromUploads)) {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      if (path.resolve(fromUploads) !== path.resolve(cachePath)) {
        fs.copyFileSync(fromUploads, cachePath);
      }
      return cachePath;
    }
  }

  // Fallback: direct download to cache path via ensureDurable again is enough when S3-only;
  // stream from durable absolute URL is not available here — re-fetch once into cache.
  const res = await fetch(sourceUrl, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`hero_playback_fetch_${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('hero_playback_empty');
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, buf);
  return cachePath;
}

function streamFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const range = req.headers.range ? String(req.headers.range) : null;

  if (req.method === 'HEAD') {
    applyInlineVideoHeaders(res, size);
    return res.status(200).end();
  }

  if (range && range.startsWith('bytes=')) {
    const m = range.replace(/^bytes=/, '').match(/^(\d*)-(\d*)$/);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : size - 1;
      const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
      const safeEnd = Number.isFinite(end) ? Math.min(size - 1, end) : size - 1;
      const chunkSize = safeEnd - safeStart + 1;
      applyInlineVideoHeaders(res, chunkSize);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${safeStart}-${safeEnd}/${size}`);
      return fs.createReadStream(filePath, { start: safeStart, end: safeEnd }).pipe(res);
    }
  }

  applyInlineVideoHeaders(res, size);
  return fs.createReadStream(filePath).pipe(res);
}

/**
 * GET/HEAD /api/public/media/hero-playback/:token
 * token = base64url(https://videos.pexels.com/...)
 */
router.all('/media/hero-playback/:token', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).end();
  }
  const sourceUrl = decodeHeroPlaybackToken(req.params.token);
  if (!sourceUrl) {
    return res.status(400).json({ ok: false, error: 'invalid_hero_playback_token' });
  }
  try {
    const filePath = await ensureLocalCacheFile(sourceUrl);
    return streamFile(req, res, filePath);
  } catch (err) {
    console.warn('[hero-playback] failed', {
      host: (() => {
        try {
          return new URL(sourceUrl).host;
        } catch {
          return null;
        }
      })(),
      message: err?.message || String(err),
    });
    return res.status(502).json({ ok: false, error: 'hero_playback_unavailable' });
  }
});

export default router;
