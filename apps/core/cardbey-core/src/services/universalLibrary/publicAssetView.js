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
  // Explicitly omit: sourceUrl, metadata (may contain evidence), rightsStatus, duplicateOfId, raw discovery signals
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
