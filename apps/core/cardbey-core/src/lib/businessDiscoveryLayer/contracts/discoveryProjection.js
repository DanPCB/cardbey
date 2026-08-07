/**
 * BusinessDiscoveryProjection — canonical publishing projection for all discovery consumers.
 *
 * Consumers (SEO, AI search, social, directory, APIs, storefront index cards) MUST read this
 * contract — not raw Business / Store / Product / Translation / Language / Review entities.
 */

import { assertDiscoveryMetadata, buildDiscoveryMetadata } from './discoveryMetadata.js';

export const BUSINESS_DISCOVERY_PROJECTION_VERSION = 'bdl.v1';

/**
 * @typedef {Object} DiscoveryProduct
 * @property {string} id
 * @property {string} name
 * @property {string|null} description
 * @property {unknown} price
 * @property {string|null} imageUrl
 * @property {string|null} categoryId
 */

/**
 * @typedef {Object} DiscoveryService
 * @property {string} id
 * @property {string} name
 * @property {string|null} description
 * @property {string|null} ctaLabel
 */

/**
 * @typedef {Object} DiscoveryCategory
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {Object} DiscoveryReviewSummary
 * @property {number} count
 * @property {number|null} averageRating
 * @property {boolean} hasPublicReviews
 */

/**
 * @typedef {Object} DiscoveryPolicyBrief
 * @property {string|null} privacyUrl
 * @property {string|null} termsUrl
 * @property {string|null} returnsSummary
 */

/**
 * @typedef {Object} DiscoveryLanguageState
 * @property {string} primaryLanguage
 * @property {string[]} availableLanguages
 * @property {boolean} translationApprovedForDiscovery
 * @property {object|null} storefrontLocalization
 */

/**
 * @typedef {Object} BusinessDiscoveryProjection
 * @property {string} projectionVersion
 * @property {string} projectionId
 * @property {string} businessId
 * @property {string|null} tenantId
 * @property {string|null} storeId
 * @property {string|null} slug
 * @property {string} name
 * @property {string|null} status
 * @property {object} business
 * @property {DiscoveryProduct[]} products
 * @property {DiscoveryService[]} services
 * @property {DiscoveryCategory[]} categories
 * @property {DiscoveryReviewSummary} reviews
 * @property {DiscoveryPolicyBrief} policies
 * @property {object} media
 * @property {object} location
 * @property {DiscoveryLanguageState} languages
 * @property {object} structuredContent
 * @property {import('./discoveryMetadata.js').DiscoveryMetadata} discoveryMetadata
 * @property {object} diagnostics
 */

/**
 * @param {Partial<BusinessDiscoveryProjection> & Record<string, unknown>} input
 * @returns {BusinessDiscoveryProjection}
 */
export function buildBusinessDiscoveryProjection(input = {}) {
  const businessId =
    typeof input.businessId === 'string' && input.businessId.trim()
      ? input.businessId.trim()
      : null;
  if (!businessId) {
    throw new Error('[businessDiscoveryLayer] BusinessDiscoveryProjection.businessId required');
  }

  const slug = trimOrNull(input.slug);
  const name =
    typeof input.name === 'string' && input.name.trim() ? input.name.trim() : '';

  const languagesIn = input.languages && typeof input.languages === 'object' ? input.languages : {};
  const availableLanguages = Array.isArray(languagesIn.availableLanguages)
    ? languagesIn.availableLanguages.filter((l) => typeof l === 'string' && l.trim())
    : ['en'];
  const primaryLanguage =
    typeof languagesIn.primaryLanguage === 'string' && languagesIn.primaryLanguage.trim()
      ? languagesIn.primaryLanguage.trim()
      : availableLanguages[0] || 'en';

  const reviewsIn = input.reviews && typeof input.reviews === 'object' ? input.reviews : {};
  const policiesIn = input.policies && typeof input.policies === 'object' ? input.policies : {};
  const mediaIn = input.media && typeof input.media === 'object' ? input.media : {};
  const locationIn = input.location && typeof input.location === 'object' ? input.location : {};
  const structuredIn =
    input.structuredContent && typeof input.structuredContent === 'object'
      ? input.structuredContent
      : {};
  const businessIn = input.business && typeof input.business === 'object' ? input.business : {};
  const diagnosticsIn =
    input.diagnostics && typeof input.diagnostics === 'object' ? input.diagnostics : {};

  const discoveryMetadata =
    input.discoveryMetadata && typeof input.discoveryMetadata === 'object'
      ? assertDiscoveryMetadata(input.discoveryMetadata)
      : buildDiscoveryMetadata({
          title: name || null,
          description: trimOrNull(businessIn.shortDescription) ?? trimOrNull(businessIn.description),
          category: trimOrNull(businessIn.category),
          primaryLanguage,
          availableLanguages,
          canonicalUrl: trimOrNull(businessIn.canonicalUrl),
          publicPath: slug ? `/s/${encodeURIComponent(slug)}` : null,
          imageUrl: trimOrNull(mediaIn.heroImageUrl) ?? trimOrNull(mediaIn.logoUrl),
          geo: {
            lat: typeof locationIn.lat === 'number' ? locationIn.lat : null,
            lng: typeof locationIn.lng === 'number' ? locationIn.lng : null,
            displayLabel: trimOrNull(locationIn.displayLabel),
          },
          signals: {
            schemaHint: 'LocalBusiness',
            offerCount: Array.isArray(input.products) ? input.products.length : 0,
            hasReviews: Boolean(reviewsIn.hasPublicReviews),
          },
        });

  const projectionId =
    typeof input.projectionId === 'string' && input.projectionId.trim()
      ? input.projectionId.trim()
      : `bdl_${businessId}_${slug || 'noslug'}`;

  return Object.freeze({
    projectionVersion: BUSINESS_DISCOVERY_PROJECTION_VERSION,
    projectionId,
    businessId,
    tenantId: trimOrNull(input.tenantId),
    storeId: trimOrNull(input.storeId) ?? businessId,
    slug,
    name,
    status: trimOrNull(input.status) ?? 'unknown',
    business: Object.freeze({
      name,
      category: trimOrNull(businessIn.category),
      tagline: trimOrNull(businessIn.tagline),
      shortDescription: trimOrNull(businessIn.shortDescription),
      description: trimOrNull(businessIn.description),
      ctaPrimary: trimOrNull(businessIn.ctaPrimary),
      ctaSecondary: trimOrNull(businessIn.ctaSecondary),
      canonicalUrl: trimOrNull(businessIn.canonicalUrl) ?? discoveryMetadata.canonicalUrl,
      socialLinks: Array.isArray(businessIn.socialLinks)
        ? Object.freeze([...businessIn.socialLinks])
        : Object.freeze([]),
    }),
    products: Object.freeze(normalizeProducts(input.products)),
    services: Object.freeze(normalizeServices(input.services)),
    categories: Object.freeze(normalizeCategories(input.categories)),
    reviews: Object.freeze({
      count: Number.isFinite(reviewsIn.count) ? Number(reviewsIn.count) : 0,
      averageRating:
        typeof reviewsIn.averageRating === 'number' ? reviewsIn.averageRating : null,
      hasPublicReviews: Boolean(reviewsIn.hasPublicReviews),
    }),
    policies: Object.freeze({
      privacyUrl: trimOrNull(policiesIn.privacyUrl),
      termsUrl: trimOrNull(policiesIn.termsUrl),
      returnsSummary: trimOrNull(policiesIn.returnsSummary),
    }),
    media: Object.freeze({
      logoUrl: trimOrNull(mediaIn.logoUrl),
      heroImageUrl: trimOrNull(mediaIn.heroImageUrl),
      heroVideoUrl: trimOrNull(mediaIn.heroVideoUrl),
      images: Object.freeze(
        Array.isArray(mediaIn.images)
          ? mediaIn.images.filter((u) => typeof u === 'string' && u.trim())
          : [],
      ),
      videos: Object.freeze(
        Array.isArray(mediaIn.videos)
          ? mediaIn.videos.filter((u) => typeof u === 'string' && u.trim())
          : [],
      ),
    }),
    location: Object.freeze({
      address: trimOrNull(locationIn.address),
      suburb: trimOrNull(locationIn.suburb),
      city: trimOrNull(locationIn.city),
      state: trimOrNull(locationIn.state),
      postcode: trimOrNull(locationIn.postcode),
      country: trimOrNull(locationIn.country),
      lat: typeof locationIn.lat === 'number' ? locationIn.lat : null,
      lng: typeof locationIn.lng === 'number' ? locationIn.lng : null,
      displayLabel: trimOrNull(locationIn.displayLabel),
    }),
    languages: Object.freeze({
      primaryLanguage,
      availableLanguages: Object.freeze([...availableLanguages]),
      translationApprovedForDiscovery: Boolean(languagesIn.translationApprovedForDiscovery),
      storefrontLocalization:
        languagesIn.storefrontLocalization && typeof languagesIn.storefrontLocalization === 'object'
          ? Object.freeze({ ...languagesIn.storefrontLocalization })
          : null,
    }),
    structuredContent: Object.freeze({
      websiteSections: Array.isArray(structuredIn.websiteSections)
        ? Object.freeze([...structuredIn.websiteSections])
        : Object.freeze([]),
      navigation: structuredIn.navigation ?? null,
      hero: structuredIn.hero && typeof structuredIn.hero === 'object'
        ? Object.freeze({ ...structuredIn.hero })
        : null,
      sourceSeo: structuredIn.sourceSeo ?? null,
    }),
    discoveryMetadata,
    diagnostics: Object.freeze({
      source: trimOrNull(diagnosticsIn.source) ?? 'unknown',
      sourceArtifactVersion: trimOrNull(diagnosticsIn.sourceArtifactVersion),
      generatedAt: trimOrNull(diagnosticsIn.generatedAt) ?? new Date().toISOString(),
      warnings: Object.freeze(
        Array.isArray(diagnosticsIn.warnings) ? [...diagnosticsIn.warnings] : [],
      ),
    }),
  });
}

/**
 * @param {unknown} value
 * @returns {BusinessDiscoveryProjection}
 */
export function assertBusinessDiscoveryProjection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[businessDiscoveryLayer] Invalid BusinessDiscoveryProjection');
  }
  const v = /** @type {Record<string, unknown>} */ (value);
  if (v.projectionVersion !== BUSINESS_DISCOVERY_PROJECTION_VERSION) {
    throw new Error(
      `[businessDiscoveryLayer] projectionVersion must be ${BUSINESS_DISCOVERY_PROJECTION_VERSION}`,
    );
  }
  if (typeof v.businessId !== 'string' || !v.businessId.trim()) {
    throw new Error('[businessDiscoveryLayer] businessId required');
  }
  if (typeof v.projectionId !== 'string' || !v.projectionId.trim()) {
    throw new Error('[businessDiscoveryLayer] projectionId required');
  }
  if (typeof v.name !== 'string') {
    throw new Error('[businessDiscoveryLayer] name required');
  }
  assertDiscoveryMetadata(v.discoveryMetadata);
  return /** @type {BusinessDiscoveryProjection} */ (value);
}

function trimOrNull(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function normalizeProducts(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p, i) => {
    const row = p && typeof p === 'object' ? p : {};
    return Object.freeze({
      id: String(row.id ?? `product_${i}`),
      name: typeof row.name === 'string' ? row.name : 'Item',
      description: trimOrNull(row.description),
      price: row.price ?? null,
      imageUrl: trimOrNull(row.imageUrl),
      categoryId: trimOrNull(row.categoryId),
    });
  });
}

function normalizeServices(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => {
    const row = s && typeof s === 'object' ? s : {};
    return Object.freeze({
      id: String(row.id ?? `service_${i}`),
      name: typeof row.name === 'string' ? row.name : 'Service',
      description: trimOrNull(row.description),
      ctaLabel: trimOrNull(row.ctaLabel),
    });
  });
}

function normalizeCategories(list) {
  if (!Array.isArray(list)) return [];
  return list.map((c, i) => {
    const row = c && typeof c === 'object' ? c : {};
    return Object.freeze({
      id: String(row.id ?? `category_${i}`),
      name: typeof row.name === 'string' ? row.name : 'Category',
    });
  });
}
