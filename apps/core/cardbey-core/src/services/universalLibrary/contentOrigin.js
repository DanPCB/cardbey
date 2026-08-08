/**
 * Phase 3 — content origin & catalogue quality classification.
 */

export const CONTENT_ORIGIN = Object.freeze({
  REAL_FIRST_PARTY: 'REAL_FIRST_PARTY',
  REAL_CREATOR: 'REAL_CREATOR',
  REAL_BUSINESS: 'REAL_BUSINESS',
  REAL_PROVIDER: 'REAL_PROVIDER',
  AI_USER_GENERATED: 'AI_USER_GENERATED',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
  DEVELOPMENT_FIXTURE: 'DEVELOPMENT_FIXTURE',
  LEGACY_UNKNOWN: 'LEGACY_UNKNOWN',
});

export const CATALOGUE_QUALITY = Object.freeze({
  UNREVIEWED: 'UNREVIEWED',
  APPROVED: 'APPROVED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  REJECTED: 'REJECTED',
  FIXTURE_ONLY: 'FIXTURE_ONLY',
});

/**
 * @param {object} asset
 */
export function getContentOrigin(asset) {
  const meta = asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  if (meta.contentOrigin) return String(meta.contentOrigin);
  return CONTENT_ORIGIN.LEGACY_UNKNOWN;
}

/**
 * @param {object} asset
 */
export function getCatalogueQuality(asset) {
  const meta = asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  if (meta.catalogueQualityStatus) return String(meta.catalogueQualityStatus);
  return CATALOGUE_QUALITY.UNREVIEWED;
}

/**
 * @param {object} asset
 */
export function isDevelopmentFixture(asset) {
  const origin = getContentOrigin(asset);
  const quality = getCatalogueQuality(asset);
  if (origin === CONTENT_ORIGIN.DEVELOPMENT_FIXTURE) return true;
  if (quality === CATALOGUE_QUALITY.FIXTURE_ONLY) return true;
  return false;
}

/**
 * Heuristic: Phase 2F rich-seed matrix titles / seedKeys.
 * @param {object} asset
 */
export function looksLikeRichSeedFixture(asset) {
  const title = String(asset?.title || '');
  const meta = asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  const seedKey = String(meta.seedKey || '');
  if (/^seed-[a-z0-9-]+-(video|image|logo|icon|template|background|music|article|guide|promo|qr|packaging|storefront|menu|business-card|social-post|animation|document)-v\d+$/i.test(seedKey)) {
    return true;
  }
  if (/ — (Soft|Bold|Modern|Classic) \(/i.test(title)) return true;
  if (['creator_cardbey_studio', 'creator_atelier_north', 'creator_signal_media', 'creator_local_lens', 'creator_orbit_design'].includes(String(asset?.creatorId || ''))) {
    if (meta.seedKey || meta.assetRole) return true;
  }
  if (String(asset?.provider || '') === 'seed' && meta.seedKey && meta.seedKey !== 'seed-hero-retail') {
    // matrix seeds from seed provider
    if (meta.industry && meta.assetRole) return true;
  }
  return false;
}

export function fixturesEnabled() {
  // Explicit opt-in only — never default on in production or staging.
  const raw = String(process.env.ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1 || '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
}
