/**
 * Phase 3 — GroundedResourceBundle: fulfillment of Phase 2 resourceNeeds.
 * URI/Library satisfy needs; they do not re-infer business archetype/offerings.
 */

/** @typedef {'owner_provided'|'first_party'|'universal_library'|'uri_external'|'neutral_fallback'|'unresolved'} ResourceSourceTier */

/**
 * @typedef {{
 *   schema: 'cb-grounded-resource-bundle',
 *   version: 'v1',
 *   compositionId: string | null,
 *   archetype: string | null,
 *   resources: Array<{
 *     needId: string,
 *     purpose: string,
 *     status: 'filled'|'needs_media'|'skipped',
 *     resourceRef: string | null,
 *     url: string | null,
 *     sourceTier: ResourceSourceTier,
 *     provenance: Record<string, unknown>,
 *     rights: Record<string, unknown> | null,
 *     confidence: number | null,
 *     rejectedReasons: string[],
 *   }>,
 *   unresolvedNeeds: string[],
 *   diagnostics: Record<string, unknown>,
 * }} GroundedResourceBundle
 */

/**
 * @param {Partial<GroundedResourceBundle>} [input]
 * @returns {GroundedResourceBundle}
 */
export function createEmptyGroundedResourceBundle(input = {}) {
  return {
    schema: 'cb-grounded-resource-bundle',
    version: 'v1',
    compositionId: input.compositionId ?? null,
    archetype: input.archetype ?? null,
    resources: Array.isArray(input.resources) ? [...input.resources] : [],
    unresolvedNeeds: Array.isArray(input.unresolvedNeeds) ? [...input.unresolvedNeeds] : [],
    diagnostics: input.diagnostics && typeof input.diagnostics === 'object' ? { ...input.diagnostics } : {},
  };
}

/**
 * Flatten Phase 2 resourceNeeds into selectable slots.
 * @param {Record<string, any>} resourceNeeds
 * @returns {Array<{ needId: string, purpose: string, need: Record<string, any> }>}
 */
export function flattenResourceNeeds(resourceNeeds = {}) {
  const slots = [];
  const push = (needId, purpose, need) => {
    if (!need || typeof need !== 'object') return;
    slots.push({ needId, purpose, need: { ...need, purpose: need.purpose || purpose } });
  };
  if (resourceNeeds.heroImageNeed) push('hero', 'hero', resourceNeeds.heroImageNeed);
  if (resourceNeeds.backgroundNeed) push('background', 'background', resourceNeeds.backgroundNeed);
  const services = Array.isArray(resourceNeeds.serviceImageNeeds) ? resourceNeeds.serviceImageNeeds : [];
  services.forEach((n, i) => push(`service_${i}`, 'service', n));
  const products = Array.isArray(resourceNeeds.productImageNeeds) ? resourceNeeds.productImageNeeds : [];
  products.forEach((n, i) => push(`product_${i}`, 'product', n));
  const gallery = Array.isArray(resourceNeeds.galleryNeeds) ? resourceNeeds.galleryNeeds : [];
  gallery.forEach((n, i) => push(`gallery_${i}`, 'gallery', n));
  return slots;
}

/**
 * Source priority tiers (lower index = preferred).
 */
export const RESOURCE_SOURCE_PRIORITY = Object.freeze([
  'owner_provided',
  'first_party',
  'universal_library',
  'uri_external',
  'neutral_fallback',
]);

/**
 * Rank source tiers for comparison (0 = best).
 * @param {ResourceSourceTier} tier
 */
export function sourceTierRank(tier) {
  const i = RESOURCE_SOURCE_PRIORITY.indexOf(tier);
  return i >= 0 ? i : 99;
}

/**
 * Prefer owner over URI even if URI scores higher visually.
 * @param {{ sourceTier: ResourceSourceTier, confidence?: number|null }} a
 * @param {{ sourceTier: ResourceSourceTier, confidence?: number|null }} b
 */
export function preferCandidateBySourcePriority(a, b) {
  const ra = sourceTierRank(a.sourceTier);
  const rb = sourceTierRank(b.sourceTier);
  if (ra !== rb) return ra < rb ? a : b;
  return (a.confidence || 0) >= (b.confidence || 0) ? a : b;
}

/**
 * Business-card / OCR document imagery must not auto-fill hero unless need allows.
 * @param {{ purpose?: string, subjectHints?: string[] }} need
 * @param {{ isDocumentScan?: boolean, isLogo?: boolean }} assetMeta
 */
export function isAssetSuitableForNeed(need, assetMeta = {}) {
  const purpose = String(need?.purpose || '').toLowerCase();
  if (assetMeta.isDocumentScan && (purpose === 'hero' || purpose === 'background')) {
    return false;
  }
  if (assetMeta.isLogo && purpose === 'hero') {
    // Logo may support brand slot later; not automatic hero photography.
    return false;
  }
  return true;
}

export default {
  createEmptyGroundedResourceBundle,
  flattenResourceNeeds,
  RESOURCE_SOURCE_PRIORITY,
  sourceTierRank,
  preferCandidateBySourcePriority,
  isAssetSuitableForNeed,
};
