/**
 * Adapt public store DTO → discovery projection inputs (fallback when artifact missing).
 * Prefer fromPublishedArtifact when a PublishedBusinessArtifact is available.
 */

import { publicWebBase } from '../../../utils/publicWebBase.js';
import { buildDiscoveryMetadata } from '../contracts/discoveryMetadata.js';

/**
 * @param {object|null|undefined} store - public store DTO (toPublicStore / artifact mapper)
 * @param {object} [opts]
 * @returns {object}
 */
export function mapPublicStoreToDiscoveryInput(store, opts = {}) {
  if (!store || typeof store !== 'object') {
    throw new Error('[businessDiscoveryLayer] public store required');
  }

  const businessId = store.id || store.businessId || store.storeId;
  if (!businessId) {
    throw new Error('[businessDiscoveryLayer] public store missing id');
  }

  const slug = typeof store.slug === 'string' ? store.slug.trim() : null;
  const webBase = publicWebBase();
  const canonicalUrl = slug ? `${webBase}/s/${encodeURIComponent(slug)}` : null;
  const products = Array.isArray(store.products) ? store.products : [];
  const li = store.languageIntelligence?.storefrontLocalization || opts.storefrontLocalization || null;

  const primaryLanguage =
    (typeof store.locale === 'string' && store.locale.trim()) ||
    li?.canonicalLanguage ||
    'en';

  const availableLanguages = [primaryLanguage];
  if (li?.renderedLanguage && !availableLanguages.includes(li.renderedLanguage)) {
    availableLanguages.push(li.renderedLanguage);
  }

  const discoveryMetadata = buildDiscoveryMetadata({
    title: store.name || null,
    description: store.description || store.tagline || null,
    category: store.type || store.category || null,
    primaryLanguage,
    availableLanguages,
    canonicalUrl,
    publicPath: slug ? `/s/${encodeURIComponent(slug)}` : null,
    imageUrl: store.heroImageUrl || store.avatarImageUrl || store.logoUrl || null,
    geo: {
      lat: typeof store.lat === 'number' ? store.lat : null,
      lng: typeof store.lng === 'number' ? store.lng : null,
      displayLabel: store.locationLabel || store.address || null,
    },
    signals: {
      schemaHint: 'LocalBusiness',
      offerCount: products.length,
      hasReviews: Boolean(opts.reviews?.hasPublicReviews),
    },
  });

  return {
    businessId,
    tenantId: store.userId || store.tenantId || null,
    storeId: store.storeId || businessId,
    slug,
    name: store.name || '',
    status: store.isActive === false ? 'inactive' : 'published',
    business: {
      name: store.name || '',
      category: store.type || store.category || null,
      tagline: store.tagline || null,
      shortDescription: store.description || null,
      description: store.description || null,
      ctaPrimary: store.ctaLabel || null,
      ctaSecondary: null,
      canonicalUrl,
      socialLinks: Array.isArray(store.socialLinks) ? store.socialLinks : [],
    },
    products: products.map((p, i) => ({
      id: p.id ?? `product_${i}`,
      name: p.name ?? p.title ?? 'Item',
      description: p.description ?? null,
      price: p.price ?? null,
      imageUrl: p.imageUrl ?? p.image ?? null,
      categoryId: p.categoryId ?? null,
    })),
    services: [],
    categories: [],
    reviews: opts.reviews || { count: 0, averageRating: null, hasPublicReviews: false },
    policies: opts.policies || { privacyUrl: null, termsUrl: null, returnsSummary: null },
    media: {
      logoUrl: store.avatarImageUrl || store.logoUrl || null,
      heroImageUrl: store.heroImageUrl || null,
      heroVideoUrl: store.heroVideoUrl || null,
      images: [],
      videos: [],
    },
    location: {
      address: store.address || null,
      suburb: store.suburb || null,
      city: store.city || null,
      state: store.state || null,
      postcode: store.postcode || null,
      country: store.country || null,
      lat: typeof store.lat === 'number' ? store.lat : null,
      lng: typeof store.lng === 'number' ? store.lng : null,
      displayLabel: store.locationLabel || null,
    },
    languages: {
      primaryLanguage,
      availableLanguages,
      translationApprovedForDiscovery: Boolean(opts.translationApprovedForDiscovery),
      storefrontLocalization: li,
    },
    structuredContent: {
      websiteSections: Array.isArray(store.miniWebsite?.sections)
        ? store.miniWebsite.sections
        : [],
      navigation: store.miniWebsite?.navigation || null,
      hero: null,
      sourceSeo: store.miniWebsite?.seo || null,
    },
    discoveryMetadata,
    diagnostics: {
      source: 'public_store_dto',
      sourceArtifactVersion: null,
      generatedAt: new Date().toISOString(),
      warnings: [{ code: 'fallback_public_store', message: 'Built from public DTO fallback' }],
    },
  };
}
