/**
 * Adapt PublishedBusinessArtifact → BusinessDiscoveryProjection inputs.
 * Read-only adapter — does not mutate publish path or raw Business rows.
 */

import { publicWebBase } from '../../../utils/publicWebBase.js';
import { buildDiscoveryMetadata } from '../contracts/discoveryMetadata.js';

/**
 * @param {object|null|undefined} artifact - PublishedBusinessArtifact v1
 * @param {object} [opts]
 * @param {object|null} [opts.storefrontLocalization] - LI storefrontLocalization meta (read-only)
 * @param {boolean} [opts.translationApprovedForDiscovery]
 * @param {object|null} [opts.reviews]
 * @param {object|null} [opts.policies]
 * @returns {import('../contracts/discoveryProjection.js').BusinessDiscoveryProjection extends never ? object : object}
 */
export function mapPublishedArtifactToDiscoveryInput(artifact, opts = {}) {
  if (!artifact || typeof artifact !== 'object') {
    throw new Error('[businessDiscoveryLayer] published artifact required');
  }

  const content = artifact.content && typeof artifact.content === 'object' ? artifact.content : {};
  const brand = artifact.brand && typeof artifact.brand === 'object' ? artifact.brand : {};
  const hero = artifact.hero && typeof artifact.hero === 'object' ? artifact.hero : {};
  const website = artifact.website && typeof artifact.website === 'object' ? artifact.website : {};
  const commerce = artifact.commerce && typeof artifact.commerce === 'object' ? artifact.commerce : {};
  const media = artifact.media && typeof artifact.media === 'object' ? artifact.media : {};
  const location = artifact.location && typeof artifact.location === 'object' ? artifact.location : {};
  const channels = artifact.channels && typeof artifact.channels === 'object' ? artifact.channels : {};
  const diagnostics =
    artifact.diagnostics && typeof artifact.diagnostics === 'object' ? artifact.diagnostics : {};

  const products = Array.isArray(commerce.products) ? commerce.products : [];
  const slug = typeof artifact.slug === 'string' ? artifact.slug.trim() : null;
  const webBase = publicWebBase();
  const canonicalUrl =
    channels?.publicWebsite?.url ||
    (slug ? `${webBase}/s/${encodeURIComponent(slug)}` : null);

  const primaryLanguage =
    typeof content.locale === 'string' && content.locale.trim() ? content.locale.trim() : 'en';

  const availableLanguages = deriveAvailableLanguages({
    primaryLanguage,
    storefrontLocalization: opts.storefrontLocalization,
  });

  const categories = deriveCategories(products);
  const heroImageUrl =
    (typeof hero.imageUrl === 'string' && hero.imageUrl) ||
    (Array.isArray(media.heroAssets) ? media.heroAssets[0] : null) ||
    null;

  const discoveryMetadata = buildDiscoveryMetadata({
    title: artifact.name || null,
    description: content.shortDescription || content.description || null,
    category: artifact.category || null,
    primaryLanguage,
    availableLanguages,
    canonicalUrl,
    publicPath: slug ? `/s/${encodeURIComponent(slug)}` : null,
    imageUrl: heroImageUrl || brand.logoUrl || null,
    keywords: [artifact.category, content.tagline].filter(
      (k) => typeof k === 'string' && k.trim(),
    ),
    geo: {
      lat: typeof location.lat === 'number' ? location.lat : null,
      lng: typeof location.lng === 'number' ? location.lng : null,
      displayLabel: location.displayLabel || null,
    },
    signals: {
      schemaHint: 'LocalBusiness',
      offerCount: products.length,
      hasReviews: Boolean(opts.reviews?.hasPublicReviews),
    },
  });

  return {
    businessId: artifact.businessId || artifact.storeId,
    tenantId: artifact.tenantId || null,
    storeId: artifact.storeId || artifact.businessId || null,
    slug,
    name: artifact.name || '',
    status: artifact.status || 'unknown',
    business: {
      name: artifact.name || '',
      category: artifact.category || null,
      tagline: content.tagline || null,
      shortDescription: content.shortDescription || content.description || null,
      description: content.description || null,
      ctaPrimary: content.ctaPrimary || null,
      ctaSecondary: content.ctaSecondary || null,
      canonicalUrl,
      socialLinks: Array.isArray(content.socialLinks) ? content.socialLinks : [],
    },
    products,
    services: [],
    categories,
    reviews: opts.reviews || {
      count: 0,
      averageRating: null,
      hasPublicReviews: false,
    },
    policies: opts.policies || {
      privacyUrl: null,
      termsUrl: null,
      returnsSummary: null,
    },
    media: {
      logoUrl: brand.logoUrl || null,
      heroImageUrl,
      heroVideoUrl: hero.videoUrl || null,
      images: Array.isArray(media.images) ? media.images : [],
      videos: Array.isArray(media.videos) ? media.videos : [],
    },
    location,
    languages: {
      primaryLanguage,
      availableLanguages,
      translationApprovedForDiscovery: Boolean(opts.translationApprovedForDiscovery),
      storefrontLocalization: opts.storefrontLocalization || null,
    },
    structuredContent: {
      websiteSections: Array.isArray(website.sections) ? website.sections : [],
      navigation: website.navigation || null,
      hero,
      sourceSeo: website.seo || null,
    },
    discoveryMetadata,
    diagnostics: {
      source: 'published_artifact',
      sourceArtifactVersion: artifact.artifactVersion || diagnostics.projectionVersion || null,
      generatedAt: new Date().toISOString(),
      warnings: Array.isArray(diagnostics.warnings) ? diagnostics.warnings : [],
    },
  };
}

function deriveAvailableLanguages({ primaryLanguage, storefrontLocalization }) {
  const langs = new Set([primaryLanguage || 'en']);
  const loc = storefrontLocalization && typeof storefrontLocalization === 'object'
    ? storefrontLocalization
    : null;
  if (loc) {
    for (const key of ['canonicalLanguage', 'requestedLanguage', 'renderedLanguage']) {
      if (typeof loc[key] === 'string' && loc[key].trim()) langs.add(loc[key].trim());
    }
    if (Array.isArray(loc.availableLanguages)) {
      for (const l of loc.availableLanguages) {
        if (typeof l === 'string' && l.trim()) langs.add(l.trim());
      }
    }
  }
  return [...langs];
}

function deriveCategories(products) {
  const seen = new Map();
  for (const p of products) {
    const id = p?.categoryId;
    if (typeof id === 'string' && id.trim() && !seen.has(id)) {
      seen.set(id, { id, name: id });
    }
  }
  return [...seen.values()];
}
