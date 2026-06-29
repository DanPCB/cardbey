/**
 * Map PublishedBusinessArtifact → PublicStore DTO (same shape as toPublicStore).
 */

import { getTranslatedField } from '../i18n/translationUtils.js';
import { parseSocialLinks } from '../../lib/socialLinks.js';
import { enrichPublicCatalogItem } from '../../lib/catalog/catalogItemClassification.js';
import { publicCommerceFields } from '../../lib/dbCapabilities.js';
import { buildPublicStoreContact } from '../../utils/publicStoreMapper.js';
import { buildStoreLocationFields } from '../../lib/formatStoreLocation.js';

export function publishedBusinessArtifactToPublicStore(projection, options = {}) {
  const { lang, business = null } = options;
  const name =
    (business && getTranslatedField(business, 'name', lang)) || projection.name || business?.name;
  const description =
    (business && getTranslatedField(business, 'description', lang)) ||
    projection.content?.description ||
    projection.content?.shortDescription ||
    null;
  const tagline = projection.content?.tagline ?? business?.tagline ?? null;

  const hero = projection.hero ?? {};
  const heroVideo = hero.videoUrl ?? null;
  const heroImage = hero.imageUrl ?? hero.posterUrl ?? null;
  const heroUrl = heroVideo ?? heroImage ?? null;
  const heroMediaType = hero.type === 'video' || heroVideo ? 'video' : heroImage ? 'image' : null;

  const sections = Array.isArray(projection.website?.sections) ? projection.website.sections : [];
  const website =
    sections.length > 0
      ? {
          sections,
          theme:
            projection.website?.theme != null &&
            typeof projection.website.theme === 'object' &&
            !Array.isArray(projection.website.theme)
              ? projection.website.theme
              : null,
          generatedAt: projection.publishedAt ?? undefined,
        }
      : null;

  let storefrontSettings = null;
  if (business?.storefrontSettings != null) {
    try {
      const raw = business.storefrontSettings;
      storefrontSettings =
        typeof raw === 'object' && raw !== null && !Array.isArray(raw)
          ? raw
          : typeof raw === 'string'
            ? JSON.parse(raw)
            : null;
    } catch {
      storefrontSettings = null;
    }
  }

  const dbProducts = Array.isArray(business?.products) ? business.products : [];
  const projectionProducts = Array.isArray(projection.commerce?.products) ? projection.commerce.products : [];
  // Republish can rebuild projection from draft items while Product rows are still empty — prefer DB when
  // present, otherwise fall back to projection commerce so /s/:slug featured + catalog sections resolve.
  const businessType = projection.category ?? business?.type ?? null;
  const businessName = name ?? business?.name ?? null;
  const mapProduct = (p) =>
    enrichPublicCatalogItem(
      {
        id: p.id,
        name: (lang && getTranslatedField(p, 'name', lang)) || p.name,
        description: (lang && getTranslatedField(p, 'description', lang)) ?? p.description ?? null,
        category: (lang && getTranslatedField(p, 'category', lang)) ?? p.category ?? null,
        price: p.price ?? null,
        currency: p.currency ?? null,
        imageUrl: p.imageUrl ?? null,
        itemType: p.itemType ?? null,
        bookingEnabled: p.bookingEnabled ?? null,
        purchaseEnabled: p.purchaseEnabled ?? null,
        primaryAction: p.primaryAction ?? null,
        kind: p.kind ?? null,
        itemKind: p.itemKind ?? null,
      },
      { businessType, businessName },
    );

  const products =
    dbProducts.length > 0
      ? dbProducts.map(mapProduct)
      : projectionProducts.map((p) =>
          enrichPublicCatalogItem(
            {
              id: p.id,
              name: p.name,
              description: p.description ?? null,
              price: p.price ?? null,
              imageUrl: p.imageUrl ?? null,
              category: p.category ?? p.categoryId ?? null,
              currency: p.currency ?? null,
              itemType: p.itemType ?? null,
              bookingEnabled: p.bookingEnabled ?? null,
              purchaseEnabled: p.purchaseEnabled ?? null,
              primaryAction: p.primaryAction ?? null,
              kind: p.kind ?? null,
            },
            { businessType, businessName },
          ),
        );

  const locationFromProjection = projection.location && typeof projection.location === 'object'
    ? projection.location
    : null;
  const locationFields = business
    ? buildStoreLocationFields(business)
    : {
        address: locationFromProjection?.address ?? null,
        suburb: locationFromProjection?.suburb ?? null,
        city: locationFromProjection?.city ?? null,
        state: locationFromProjection?.state ?? null,
        postcode: locationFromProjection?.postcode ?? null,
        country: locationFromProjection?.country ?? null,
        lat: locationFromProjection?.lat ?? null,
        lng: locationFromProjection?.lng ?? null,
        locationLabel: locationFromProjection?.displayLabel ?? null,
      };

  const publishedAtIso =
    business?.publishedAt instanceof Date
      ? business.publishedAt.toISOString()
      : typeof business?.publishedAt === 'string'
        ? business.publishedAt
        : projection.publishedAt ?? null;

  return {
    id: projection.businessId ?? projection.storeId,
    name,
    slug: projection.slug,
    ...(publishedAtIso ? { publishedAt: publishedAtIso } : {}),
    description,
    tagline,
    type: businessType,
    ...publicCommerceFields(business, {
      type: businessType,
      name: businessName,
      transactionMode: business?.transactionMode,
      catalogLabel: business?.catalogLabel,
      ctaLabel: projection.content?.ctaPrimary ?? business?.ctaLabel,
    }),
    avatarUrl: projection.brand?.logoUrl ?? business?.avatarImageUrl ?? null,
    bannerUrl: heroUrl,
    heroUrl,
    heroVideo,
    heroVideoUrl: heroVideo,
    heroMediaType,
    heroImage: heroImage && !heroVideo ? heroImage : hero.posterUrl ?? heroImage,
    city: locationFields.locationLabel,
    country: locationFields.country,
    locationLabel: locationFields.locationLabel,
    address: locationFields.address,
    suburb: locationFields.suburb,
    state: locationFields.state,
    postcode: locationFields.postcode,
    lat: locationFields.lat,
    lng: locationFields.lng,
    website,
    showOwnerProfile: business?.showOwnerProfile ?? false,
    ownerProfileSlug: business?.user?.personalPresenceStore?.slug ?? null,
    socialLinks:
      parseSocialLinks(projection.content?.socialLinks) ??
      parseSocialLinks(business?.socialLinks) ??
      null,
    contact: buildPublicStoreContact(business),
    ...(business?.phone ? { phone: business.phone } : {}),
    ...(storefrontSettings != null ? { storefrontSettings } : {}),
    ...(business?.provenance != null ? { provenance: business.provenance } : {}),
    ...(business?.claimStatus != null ? { claimStatus: business.claimStatus } : {}),
    ...(typeof business?.captureCount === 'number' ? { captureCount: business.captureCount } : {}),
    products,
    _projectionMeta: {
      version: projection.artifactVersion,
      source: projection.diagnostics?.source,
    },
  };
}
