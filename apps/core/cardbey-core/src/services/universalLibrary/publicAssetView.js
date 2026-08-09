/**
 * Public catalogue projection — never expose rights evidence or protected source refs.
 */

const PUBLIC_SAFE_KEYS = new Set([
  'id',
  'title',
  'description',
  'type',
  'provider',
  'license',
  'categories',
  'tags',
  'language',
  'country',
  'thumbnail',
  'preview',
  'hostingMode',
  'qualityScore',
  'status',
  'createdAt',
  'updatedAt',
  'creatorId',
  'ownerId',
]);

/**
 * Public Core origin for HOSTED relative media (/assets, /videos, /uploads).
 * Prefer API/Core URL — not the marketing dashboard origin.
 * @returns {string | null}
 */
export function getCoreMediaPublicBase() {
  const candidates = [
    process.env.CORE_PUBLIC_URL,
    process.env.PUBLIC_API_BASE_URL,
    process.env.API_PUBLIC_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.PUBLIC_BASE_URL,
  ];
  for (const raw of candidates) {
    const s = String(raw || '').trim();
    if (!s) continue;
    try {
      let normalized = s.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
      const u = new URL(normalized);
      const host = u.hostname.toLowerCase();
      if (
        (host === 'localhost' || host === '127.0.0.1') &&
        String(process.env.NODE_ENV || '').toLowerCase() === 'production'
      ) {
        continue;
      }
      return u.origin;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Allow https media/page URLs, or same-origin relative paths for HOSTED media.
 * @param {unknown} value
 * @returns {string | null}
 */
export function safePublicMediaUrl(value) {
  const s = String(value || '').trim();
  if (!s || s.length > 2048) return null;
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('..')) {
    return s;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Absolute HTTPS (or http in non-prod) URL for HOSTED relative paths.
 * Leaves absolute CDN/REFERENCE URLs unchanged.
 * @param {unknown} value
 * @returns {string | null}
 */
export function absolutizeHostedMediaUrl(value) {
  const safe = safePublicMediaUrl(value);
  if (!safe) return null;
  if (/^https?:\/\//i.test(safe)) return safe;
  if (safe.startsWith('/')) {
    const base = getCoreMediaPublicBase();
    if (base) return `${base}${safe}`;
    return safe;
  }
  return safe;
}

/**
 * Playback URL for public clients — not raw metadata dump.
 * @param {object} asset
 * @param {Record<string, unknown>} meta
 * @returns {string | null}
 */
export function resolvePublicStreamUrl(asset, meta = {}) {
  const type = String(asset?.type || '').toLowerCase();
  if (type !== 'video' && type !== 'animation' && type !== 'audio') return null;
  const candidates = [
    meta.videoUrl,
    meta.streamUrl,
    meta.audioUrl,
    // HOSTED Originals: source file path when preview is a still
    type === 'video' || type === 'animation' || type === 'audio' ? meta.sourceFile : null,
    // Some rows may store playable file on preview
    asset?.preview,
  ];
  for (const c of candidates) {
    const url = safePublicMediaUrl(c);
    if (!url) continue;
    if (type === 'audio') {
      if (/\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(url) || /audio/i.test(url)) return url;
      if (meta.audioUrl && url === safePublicMediaUrl(meta.audioUrl)) return url;
      continue;
    }
    // Prefer explicit video CDN / file links; skip obvious stills used as posters
    if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url) && !meta.videoUrl) continue;
    if (c === asset?.preview && /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url)) continue;
    return url;
  }
  return null;
}

/**
 * Presentation readiness — separate from rightsStatus.
 * @param {object} asset
 * @param {{ preview?: unknown, thumbnail?: unknown, streamUrl?: unknown }} view
 * @returns {'PREVIEW_READY'|'PREVIEW_MISSING'|'PREVIEW_OPTIONAL'|'MEDIA_UNREACHABLE'}
 */
export function computePreviewReadiness(asset, view = {}) {
  const type = String(asset?.type || '').toLowerCase();
  const preview = String(view.preview || view.thumbnail || '').trim();
  const stream = String(view.streamUrl || '').trim();
  const needsVisualPreview = ['image', 'video', 'animation', 'template', 'preset'].includes(type);
  const optionalVisual = ['audio', 'article', 'document', 'guide'].includes(type);

  const looksDevOnly =
    /localhost|127\.0\.0\.1|file:\/\//i.test(preview) ||
    /localhost|127\.0\.0\.1|file:\/\//i.test(stream) ||
    /^[A-Za-z]:\\/.test(preview) ||
    preview.includes('/src/assets/');

  if (looksDevOnly) return 'MEDIA_UNREACHABLE';

  if (needsVisualPreview) {
    if (!preview && !(type === 'video' && stream)) return 'PREVIEW_MISSING';
    return 'PREVIEW_READY';
  }
  if (optionalVisual) {
    if (preview || stream) return 'PREVIEW_READY';
    return 'PREVIEW_OPTIONAL';
  }
  return preview ? 'PREVIEW_READY' : 'PREVIEW_MISSING';
}

/**
 * @param {object} asset
 * @param {{ admin?: boolean }} [opts]
 */
export function toPublicAssetView(asset, opts = {}) {
  if (!asset || typeof asset !== 'object') return asset;
  if (opts.admin) return asset;

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of PUBLIC_SAFE_KEYS) {
    if (key in asset) out[key] = asset[key];
  }
  // Public consumers see licence label only — not clearance internals.
  out.license = asset.license ?? null;
  // Safe discovery presentation fields (no rights evidence / source refs).
  const meta = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  out.industry = meta.industry ?? null;
  out.assetRole = meta.assetRole ?? null;
  out.premium = Boolean(meta.premium);
  out.openLicense = meta.openLicense !== false;
  out.creatorLabel = meta.creatorLabel ?? null;
  out.creatorVerified = Boolean(meta.creatorVerified);
  out.views = Number(meta.views || 0);
  out.downloads = Number(meta.downloads || 0);
  out.rating = Number(meta.rating || 0);
  out.collections = Array.isArray(meta.collections) ? meta.collections : [];
  out.useCases = Array.isArray(meta.useCases) ? meta.useCases : [];

  // HOSTED relative paths must resolve to Core (not the dashboard host).
  const thumbAbs = absolutizeHostedMediaUrl(asset.thumbnail);
  const previewAbs = absolutizeHostedMediaUrl(asset.preview);
  if (thumbAbs) out.thumbnail = thumbAbs;
  if (previewAbs) out.preview = previewAbs;

  // Playback + attribution page for REFERENCE/HOSTED media (not raw metadata).
  const streamUrl = resolvePublicStreamUrl(asset, meta);
  const streamAbs = absolutizeHostedMediaUrl(streamUrl);
  if (streamAbs) out.streamUrl = streamAbs;
  const canonicalUrl = absolutizeHostedMediaUrl(asset.sourceUrl) || safePublicMediaUrl(asset.sourceUrl);
  if (canonicalUrl && /^https?:\/\//i.test(canonicalUrl)) {
    out.canonicalUrl = canonicalUrl;
    out.sourceUrl = canonicalUrl;
  }

  out.previewReadiness = computePreviewReadiness(asset, {
    preview: out.preview,
    thumbnail: out.thumbnail,
    streamUrl: out.streamUrl,
  });

  // Explicitly omit: raw metadata, rightsStatus, duplicateOfId, discovery evidence
  if (asset.discoveryScore && typeof asset.discoveryScore === 'object') {
    out.discoveryScore = {
      discoveryScore: asset.discoveryScore.discoveryScore,
      trendingScore: asset.discoveryScore.trendingScore,
      qualityScore: asset.discoveryScore.qualityScore,
      popularityScore: asset.discoveryScore.popularityScore,
    };
  }
  return out;
}

/**
 * @param {object[]} assets
 * @param {{ admin?: boolean }} [opts]
 */
export function toPublicAssetList(assets, opts = {}) {
  return (Array.isArray(assets) ? assets : []).map((a) => toPublicAssetView(a, opts));
}
