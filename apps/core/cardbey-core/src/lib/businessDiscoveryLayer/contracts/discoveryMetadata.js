/**
 * Discovery metadata — channel-agnostic facts derived for external discoverability.
 * SEO/AI/social/directory consumers read this via BusinessDiscoveryProjection,
 * not from raw Business/Product entities.
 */

export const DISCOVERY_METADATA_VERSION = 1;

/**
 * @typedef {Object} DiscoveryMetadata
 * @property {number} version
 * @property {string|null} canonicalUrl
 * @property {string|null} publicPath
 * @property {string[]} availableLanguages
 * @property {string} primaryLanguage
 * @property {string|null} title
 * @property {string|null} description
 * @property {string|null} imageUrl
 * @property {string|null} category
 * @property {string[]} keywords
 * @property {{ lat: number|null, lng: number|null, displayLabel: string|null }} geo
 * @property {{ schemaHint: string|null, offerCount: number, hasReviews: boolean }} signals
 * @property {Record<string, unknown>} [extensions]
 */

/**
 * @param {Partial<DiscoveryMetadata> & Record<string, unknown>} input
 * @returns {DiscoveryMetadata}
 */
export function buildDiscoveryMetadata(input = {}) {
  const availableLanguages = Array.isArray(input.availableLanguages)
    ? input.availableLanguages.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim())
    : ['en'];
  const primaryLanguage =
    typeof input.primaryLanguage === 'string' && input.primaryLanguage.trim()
      ? input.primaryLanguage.trim()
      : availableLanguages[0] || 'en';

  const geoIn = input.geo && typeof input.geo === 'object' ? input.geo : {};
  const signalsIn = input.signals && typeof input.signals === 'object' ? input.signals : {};

  return Object.freeze({
    version: DISCOVERY_METADATA_VERSION,
    canonicalUrl: trimOrNull(input.canonicalUrl),
    publicPath: trimOrNull(input.publicPath),
    availableLanguages: Object.freeze([...availableLanguages]),
    primaryLanguage,
    title: trimOrNull(input.title),
    description: trimOrNull(input.description),
    imageUrl: trimOrNull(input.imageUrl),
    category: trimOrNull(input.category),
    keywords: Object.freeze(
      Array.isArray(input.keywords)
        ? input.keywords.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim())
        : [],
    ),
    geo: Object.freeze({
      lat: typeof geoIn.lat === 'number' ? geoIn.lat : null,
      lng: typeof geoIn.lng === 'number' ? geoIn.lng : null,
      displayLabel: trimOrNull(geoIn.displayLabel),
    }),
    signals: Object.freeze({
      schemaHint: trimOrNull(signalsIn.schemaHint) ?? 'LocalBusiness',
      offerCount: Number.isFinite(signalsIn.offerCount) ? Number(signalsIn.offerCount) : 0,
      hasReviews: Boolean(signalsIn.hasReviews),
    }),
    extensions:
      input.extensions && typeof input.extensions === 'object' && !Array.isArray(input.extensions)
        ? Object.freeze({ ...input.extensions })
        : Object.freeze({}),
  });
}

/**
 * @param {unknown} value
 * @returns {DiscoveryMetadata}
 */
export function assertDiscoveryMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[businessDiscoveryLayer] Invalid DiscoveryMetadata');
  }
  const v = /** @type {Record<string, unknown>} */ (value);
  if (v.version !== DISCOVERY_METADATA_VERSION) {
    throw new Error(
      `[businessDiscoveryLayer] DiscoveryMetadata.version must be ${DISCOVERY_METADATA_VERSION}`,
    );
  }
  if (typeof v.primaryLanguage !== 'string' || !v.primaryLanguage.trim()) {
    throw new Error('[businessDiscoveryLayer] DiscoveryMetadata.primaryLanguage required');
  }
  if (!Array.isArray(v.availableLanguages)) {
    throw new Error('[businessDiscoveryLayer] DiscoveryMetadata.availableLanguages required');
  }
  return /** @type {DiscoveryMetadata} */ (value);
}

function trimOrNull(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
