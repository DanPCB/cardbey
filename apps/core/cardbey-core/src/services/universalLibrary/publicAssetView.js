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
  // Public reuse gate (enum only — not clearance evidence / discovery docs).
  if (asset.rightsStatus != null) out.rightsStatus = asset.rightsStatus;
  // Playback + attribution page for REFERENCE/HOSTED media (not raw metadata).
  const streamUrl = resolvePublicStreamUrl(asset, meta);
  if (streamUrl) out.streamUrl = streamUrl;
  const canonicalUrl = safePublicMediaUrl(asset.sourceUrl);
  if (canonicalUrl) {
    out.canonicalUrl = canonicalUrl;
    out.sourceUrl = canonicalUrl;
  }
  // Explicitly omit: raw metadata, duplicateOfId, discovery evidence
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
