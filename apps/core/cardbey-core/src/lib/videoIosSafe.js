/**
 * iOS Safari–safe MP4 derivatives: H.264 yuv420p AAC faststart sibling files (.ios.mp4).
 */

import fs from 'fs';
import path from 'path';
import {
  checkVideoCompatibility,
  probeVideoFile,
  transcodeToWebCompatible,
} from './videoCompat.js';

const UPLOADS_MEDIA_PREFIX = '/uploads/media/';

/**
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function deriveIosSafeVideoPublicPath(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/\.ios\.mp4(\?|#|$)/i.test(trimmed)) return trimmed;
  if (!/\.mp4(\?|#|$)/i.test(trimmed)) return null;
  return trimmed.replace(/\.mp4(\?.*)?$/i, '.ios.mp4$1');
}

/**
 * @param {string} publicPath e.g. /uploads/media/foo.mp4
 * @param {string} [uploadsDir]
 */
export function localPathFromPublicMediaPath(publicPath, uploadsDir = process.env.UPLOADS_DIR) {
  if (!publicPath?.startsWith(UPLOADS_MEDIA_PREFIX)) return null;
  const base = uploadsDir ?? path.join(process.cwd(), 'uploads', 'media');
  const filename = publicPath.slice(UPLOADS_MEDIA_PREFIX.length).replace(/\?.*$/, '');
  if (!filename || filename.includes('..')) return null;
  return path.join(base, filename);
}

/**
 * @param {string} localPath absolute path to .mp4 on disk
 * @returns {Promise<{ originalPublicPath: string, iosSafePublicPath: string, iosSafeLocalPath: string, createdDerivative: boolean }>}
 */
export async function ensureIosSafeVideoDerivativeOnDisk(localPath) {
  const filename = path.basename(localPath);
  const publicPath = `${UPLOADS_MEDIA_PREFIX}${filename}`;
  const iosFilename = filename.replace(/\.mp4$/i, '.ios.mp4');
  const iosLocalPath = path.join(path.dirname(localPath), iosFilename);
  const iosSafePublicPath = `${UPLOADS_MEDIA_PREFIX}${iosFilename}`;

  let probe;
  try {
    probe = await probeVideoFile(localPath);
  } catch (err) {
    console.warn('[VIDEO_IOS_SAFE] ffprobe failed, skipping derivative', {
      localPath,
      message: err?.message ?? err,
    });
    return {
      originalPublicPath: publicPath,
      iosSafePublicPath: publicPath,
      iosSafeLocalPath: localPath,
      createdDerivative: false,
    };
  }

  const check = checkVideoCompatibility(probe);
  if (check.compatible) {
    return {
      originalPublicPath: publicPath,
      iosSafePublicPath: publicPath,
      iosSafeLocalPath: localPath,
      createdDerivative: false,
    };
  }

  try {
    const iosExists = await fs.promises
      .access(iosLocalPath, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);

    if (!iosExists) {
      console.log('[VIDEO_IOS_SAFE] creating derivative', {
        input: localPath,
        output: iosLocalPath,
        reasons: check.reasons,
      });
      await transcodeToWebCompatible(localPath, iosLocalPath);
    }

    return {
      originalPublicPath: publicPath,
      iosSafePublicPath,
      iosSafeLocalPath: iosLocalPath,
      createdDerivative: true,
    };
  } catch (err) {
    console.error('[VIDEO_IOS_SAFE] derivative transcode failed', {
      localPath,
      message: err?.message ?? err,
    });
    return {
      originalPublicPath: publicPath,
      iosSafePublicPath: publicPath,
      iosSafeLocalPath: localPath,
      createdDerivative: false,
    };
  }
}

/**
 * Normalize hero video URL to /uploads/media/*.mp4 public path (skips *.ios.mp4).
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function normalizeHeroVideoToPublicPath(url) {
  if (!url || typeof url !== 'string') return null;
  let pathPart = url.trim();
  if (!pathPart) return null;
  try {
    if (/^https?:\/\//i.test(pathPart)) {
      pathPart = new URL(pathPart).pathname;
    }
  } catch {
    return null;
  }
  if (!pathPart.startsWith(UPLOADS_MEDIA_PREFIX)) return null;
  if (!/\.mp4$/i.test(pathPart)) return null;
  if (/\.ios\.mp4$/i.test(pathPart)) return null;
  return pathPart;
}

/**
 * @param {string} publicPath
 * @param {string} [uploadsDir]
 */
export function iosSafeSiblingExists(publicPath, uploadsDir) {
  const iosPublic = deriveIosSafeVideoPublicPath(publicPath);
  if (!iosPublic || iosPublic === publicPath) return false;
  const local = localPathFromPublicMediaPath(iosPublic, uploadsDir);
  if (!local) return false;
  try {
    return fs.existsSync(local);
  } catch {
    return false;
  }
}

/**
 * @param {string} publicPath
 * @param {string} [uploadsDir]
 * @returns {string | null} ios-safe public path when sibling file exists on disk
 */
export function resolveIosSafeVideoPublicPathIfExists(publicPath, uploadsDir) {
  const iosPublic = deriveIosSafeVideoPublicPath(publicPath);
  if (!iosPublic || iosPublic === publicPath) return null;
  return iosSafeSiblingExists(publicPath, uploadsDir) ? iosPublic : null;
}

/**
 * @param {{ source: string, output: string, status: string, error?: string | null }} entry
 */
export function logIosVideoBackfill(entry) {
  console.log('[IOS_VIDEO_BACKFILL]', entry);
}

/**
 * Create .ios.mp4 sibling via ffmpeg (H.264/AAC/faststart).
 * @param {string} inputLocalPath
 * @param {string} outputLocalPath
 * @param {{ force?: boolean, dryRun?: boolean }} [opts]
 */
export async function createIosSafeDerivativeFile(inputLocalPath, outputLocalPath, opts = {}) {
  const { force = false, dryRun = false } = opts;
  const sourcePublic = `${UPLOADS_MEDIA_PREFIX}${path.basename(inputLocalPath)}`;
  const outputPublic = `${UPLOADS_MEDIA_PREFIX}${path.basename(outputLocalPath)}`;

  const sourceExists = await fs.promises
    .access(inputLocalPath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!sourceExists) {
    logIosVideoBackfill({
      source: sourcePublic,
      output: outputPublic,
      status: 'source_missing',
      error: null,
    });
    return { status: 'source_missing', created: false };
  }

  const outputExists = await fs.promises
    .access(outputLocalPath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (outputExists && !force) {
    logIosVideoBackfill({
      source: sourcePublic,
      output: outputPublic,
      status: 'skipped_exists',
      error: null,
    });
    return { status: 'skipped_exists', created: false };
  }

  if (dryRun) {
    logIosVideoBackfill({
      source: sourcePublic,
      output: outputPublic,
      status: 'dry_run_would_create',
      error: null,
    });
    return { status: 'dry_run_would_create', created: false };
  }

  try {
    await transcodeToWebCompatible(inputLocalPath, outputLocalPath);
    logIosVideoBackfill({
      source: sourcePublic,
      output: outputPublic,
      status: 'created',
      error: null,
    });
    return { status: 'created', created: true };
  } catch (err) {
    const message = err?.message ?? String(err);
    logIosVideoBackfill({
      source: sourcePublic,
      output: outputPublic,
      status: 'error',
      error: message,
    });
    return { status: 'error', created: false, error: message };
  }
}

/**
 * Backfill one /uploads/media/*.mp4 hero to sibling .ios.mp4.
 * @param {string} publicPath
 * @param {{ force?: boolean, dryRun?: boolean, uploadsDir?: string }} [opts]
 */
export async function backfillIosSafeVideoForPublicPath(publicPath, opts = {}) {
  const normalized = normalizeHeroVideoToPublicPath(publicPath);
  if (!normalized) {
    logIosVideoBackfill({
      source: publicPath,
      output: null,
      status: 'skipped_not_local_mp4',
      error: null,
    });
    return { status: 'skipped_not_local_mp4', created: false };
  }

  const inputLocal = localPathFromPublicMediaPath(normalized, opts.uploadsDir);
  if (!inputLocal) {
    logIosVideoBackfill({
      source: normalized,
      output: null,
      status: 'skipped_not_local_mp4',
      error: null,
    });
    return { status: 'skipped_not_local_mp4', created: false };
  }

  const iosPublic = deriveIosSafeVideoPublicPath(normalized);
  const outputLocal = localPathFromPublicMediaPath(iosPublic, opts.uploadsDir);
  if (!outputLocal) {
    return { status: 'skipped_not_local_mp4', created: false };
  }

  return createIosSafeDerivativeFile(inputLocal, outputLocal, opts);
}

/**
 * Collect unique /uploads/media/*.mp4 paths from DB rows.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function collectHeroVideoMp4PublicPaths(prisma) {
  /** @type {Map<string, { source: string, refs: string[] }>} */
  const paths = new Map();

  const add = (url, ref) => {
    const normalized = normalizeHeroVideoToPublicPath(url);
    if (!normalized) return;
    const existing = paths.get(normalized);
    if (existing) {
      if (!existing.refs.includes(ref)) existing.refs.push(ref);
    } else {
      paths.set(normalized, { source: normalized, refs: [ref] });
    }
  };

  const projections = await prisma.publishedArtifactProjection.findMany({
    select: { businessId: true, slug: true, heroVideoUrl: true, projectionJson: true },
  });
  for (const row of projections) {
    if (row.heroVideoUrl) {
      add(row.heroVideoUrl, `PublishedArtifactProjection:${row.businessId}`);
    }
    const json = row.projectionJson;
    const heroUrl =
      json && typeof json === 'object' && !Array.isArray(json)
        ? json.hero?.videoUrl ?? json.hero?.video ?? null
        : null;
    if (typeof heroUrl === 'string') {
      add(heroUrl, `projectionJson.hero:${row.slug ?? row.businessId}`);
    }
  }

  const mediaRows = await prisma.media.findMany({
    where: { kind: 'VIDEO' },
    select: { id: true, url: true },
  });
  for (const row of mediaRows) {
    add(row.url, `Media:${row.id}`);
  }

  const businesses = await prisma.business.findMany({
    select: { id: true, slug: true, stylePreferences: true },
  });
  for (const biz of businesses) {
    let prefs = biz.stylePreferences;
    if (typeof prefs === 'string') {
      try {
        prefs = JSON.parse(prefs);
      } catch {
        prefs = null;
      }
    }
    if (prefs && typeof prefs === 'object') {
      add(prefs.heroVideo, `Business.stylePreferences:${biz.slug ?? biz.id}`);
      const miniHero = prefs.miniWebsite?.sections?.find?.((s) => s?.type === 'hero');
      const content = miniHero?.content;
      if (content?.videoUrl) add(content.videoUrl, `Business.miniWebsite.hero:${biz.slug ?? biz.id}`);
    }
  }

  return [...paths.values()];
}

/**
 * Attach heroVideoUrlOriginal / heroVideoUrlIosSafe on public store DTOs (read-time, no publish pipeline).
 * heroVideoUrlIosSafe is set only when the .ios.mp4 sibling exists on disk.
 * @param {Record<string, unknown>} store
 * @param {{ uploadsDir?: string }} [opts]
 */
export function enrichStoreHeroVideoUrls(store, opts = {}) {
  if (!store || typeof store !== 'object') return store;
  const original =
    (typeof store.heroVideoUrl === 'string' && store.heroVideoUrl.trim()) ||
    (typeof store.heroVideo === 'string' && store.heroVideo.trim()) ||
    null;
  if (!original) return store;

  const explicitIos =
    typeof store.heroVideoUrlIosSafe === 'string' ? store.heroVideoUrlIosSafe.trim() : null;
  const iosOnDisk =
    explicitIos ||
    resolveIosSafeVideoPublicPathIfExists(original, opts.uploadsDir) ||
    null;

  return {
    ...store,
    heroVideoUrlOriginal: original,
    ...(iosOnDisk ? { heroVideoUrlIosSafe: iosOnDisk } : {}),
    heroVideoUrl: original,
    heroVideo: original,
  };
}
