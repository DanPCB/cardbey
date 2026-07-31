/**
 * Public Store Mapper
 * Maps Business/Store data to safe public DTO
 * Never exposes sensitive data (userId, internal IDs, etc.)
 */

import { getTranslatedField } from '../services/i18n/translationUtils.js';
import { resolveHeroMediaFromBusiness } from './heroMediaResolve.js';
import { parseSocialLinks } from '../lib/socialLinks.js';
import { enrichPublicCatalogItem } from '../lib/catalog/catalogItemClassification.js';
import { migrateServiceCatalogItems } from '../lib/catalog/serviceCatalogNormalizer.js';
import { repairPublicCatalogServicePlaceholders } from '../lib/catalog/serviceCatalogPlaceholders.js';
import { publicCommerceFields } from '../lib/dbCapabilities.js';
import { resolveStoreCommercePresentation } from '../lib/businessSemantic/resolveStoreCommercePresentation.js';
import { hasBusinessColumn } from '../lib/businessColumnCapabilities.js';
import { buildStoreLocationFields } from '../lib/formatStoreLocation.js';

/**
 * @param {object | null | undefined} business
 * @returns {object}
 */
export function buildPublicStoreContact(business) {
  if (!business || typeof business !== 'object') {
    return {
      phone: null,
      email: null,
      website: null,
      address: null,
      suburb: null,
      state: null,
      postcode: null,
      mapUrl: null,
    };
  }
  const contact = {
    phone: hasBusinessColumn('phone') ? business.phone ?? null : null,
    email: hasBusinessColumn('email') ? business.email ?? null : null,
    website: hasBusinessColumn('websiteUrl') ? business.websiteUrl ?? null : null,
    address: hasBusinessColumn('address') ? business.address ?? null : null,
    suburb: hasBusinessColumn('suburb') ? business.suburb ?? null : null,
    state: hasBusinessColumn('state') ? business.state ?? null : null,
    postcode: hasBusinessColumn('postcode') ? business.postcode ?? null : null,
    mapUrl: hasBusinessColumn('mapUrl') ? business.mapUrl ?? null : null,
  };
  return contact;
}

/**
 * Map Business to PublicStore
 * @param {Object} business - Business object from Prisma (may include products relation)
 * @param {Object} options - Optional configuration
 * @param {string} options.lang - Language code (e.g., "en", "vi") for translations. If not provided, uses original fields.
 * @returns {Object} PublicStore
 */
export function toPublicStore(business, options = {}) {
  const { lang } = options;

  // Parse logo if it's a JSON string (supports url, avatarUrl, bannerUrl, heroUrl, coverUrl)
  let avatarUrl = null;
  let bannerUrl = null;
  
  if (business.logo) {
    try {
      const logoData = typeof business.logo === 'string' ? JSON.parse(business.logo) : business.logo;
      avatarUrl = logoData?.avatarUrl ?? logoData?.url ?? null;
      bannerUrl = logoData?.bannerUrl ?? logoData?.heroUrl ?? logoData?.coverUrl ?? null;
    } catch {
      // If logo is not JSON, treat as URL string (avatar only)
      avatarUrl = business.logo;
    }
  }

  const locationFields = buildStoreLocationFields(business);
  const locationLabel = locationFields.locationLabel;

  // Use translation utilities to get translated fields, falling back to originals
  const name = getTranslatedField(business, 'name', lang) || business.name;
  const description = getTranslatedField(business, 'description', lang) ?? business.description ?? null;

  // Hero/avatar: top-level (if migrated), else stylePreferences (set on publish), else logo-derived
  let stylePrefs = null;
  if (business.stylePreferences) {
    try {
      stylePrefs = typeof business.stylePreferences === 'string'
        ? JSON.parse(business.stylePreferences) : business.stylePreferences;
    } catch { stylePrefs = {}; }
  }
  const avatarFromPrefs = stylePrefs?.avatarImage ?? stylePrefs?.profileAvatarUrl ?? stylePrefs?.avatarImageUrl ?? null;
  const resolvedAvatarUrl = business.avatarImageUrl ?? avatarFromPrefs ?? avatarUrl;
  const { heroUrl: resolvedHeroUrl, heroVideo, heroImage: resolvedHeroImage } = resolveHeroMediaFromBusiness(
    business,
  );
  const resolvedBannerUrl = resolvedHeroUrl ?? bannerUrl;

  // Mini-website: expose safe snapshot for public storefront renderer.
  // Source of truth is stylePreferences.miniWebsite { sections, theme, updatedAt }.
  const miniWebsite =
    stylePrefs?.miniWebsite && typeof stylePrefs.miniWebsite === 'object' && !Array.isArray(stylePrefs.miniWebsite)
      ? stylePrefs.miniWebsite
      : null;
  const miniWebsiteSections = Array.isArray(miniWebsite?.sections) ? miniWebsite.sections : [];
  // Mini-website layout (/s/:slug → WebsitePreviewPage) only when there are sections to render.
  // Theme-only (no sections) is not enough — must match GET /api/store/:id/preview hasPublishedMiniWebsite and dashboard publicStoreHasMiniWebsiteData.
  const website =
    miniWebsiteSections.length > 0
      ? {
          sections: miniWebsiteSections,
          theme: miniWebsite?.theme != null && typeof miniWebsite.theme === 'object' && !Array.isArray(miniWebsite.theme)
            ? miniWebsite.theme
            : null,
          generatedAt: typeof miniWebsite?.updatedAt === 'string' ? miniWebsite.updatedAt : undefined,
        }
      : null;

  let storefrontSettings = null;
  if (business.storefrontSettings != null) {
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
    if (storefrontSettings !== null && (typeof storefrontSettings !== 'object' || Array.isArray(storefrontSettings))) {
      storefrontSettings = null;
    }
  }

  // Base store mapping (heroUrl + bannerUrl for compat; avatarUrl from first-class or logo)
  // type included for Explore/frontscreen services mode filtering (client-side)
  const commerce = publicCommerceFields(business);
  const resolvedCommerce = resolveStoreCommercePresentation(
    { ...business, storefrontSettings, products: business.products },
    business.products ?? [],
  );
  const catalogEnrichmentCtx = {
    businessType: resolvedCommerce.businessType ?? commerce.businessType ?? business.type,
    canonicalBusinessType: resolvedCommerce.businessType,
    businessName: business.name,
    storeName: business.name,
  };
  const base = {
    id: business.id,
    name,
    slug: business.slug, // Required field, should always exist
    description,
    tagline: business.tagline ?? null,
    type: business.type ?? null,
    transactionMode: commerce.transactionMode,
    catalogLabel: commerce.catalogLabel,
    ctaLabel: commerce.ctaLabel,
    avatarUrl: resolvedAvatarUrl,
    bannerUrl: resolvedBannerUrl,
    heroUrl: resolvedBannerUrl,
    heroVideo: heroVideo ?? null,
    heroVideoUrl: heroVideo ?? null,
    heroMediaType: heroVideo ? 'video' : resolvedHeroImage || resolvedHeroUrl ? 'image' : null,
    heroImage: resolvedHeroImage ?? (resolvedHeroUrl && !heroVideo ? resolvedHeroUrl : null),
    city: locationFields.city,
    country: locationFields.country,
    locationLabel,
    formattedAddress: locationFields.formattedAddressDisplay ?? locationFields.formattedAddress,
    locationSource: locationFields.locationSource,
    locationConfidence: locationFields.locationConfidence,
    osmPlaceId: locationFields.osmPlaceId,
    hasConfirmedCoordinates: locationFields.hasConfirmedCoordinates,
    hasReliableLocation: locationFields.hasReliableLocation,
    address: locationFields.address,
    addressLine2: locationFields.addressLine2,
    suburb: locationFields.suburb,
    state: locationFields.state,
    postcode: locationFields.postcode,
    lat: locationFields.lat,
    lng: locationFields.lng,
    website,
    showOwnerProfile: business.showOwnerProfile ?? false,
    ownerProfileSlug: business.user?.personalPresenceStore?.slug ?? null,
    socialLinks: parseSocialLinks(business.socialLinks) ?? null,
    contact: buildPublicStoreContact(business),
    ...(business.phone ? { phone: business.phone } : {}),
    ...(storefrontSettings != null ? { storefrontSettings } : {}),
    ...(commerce.businessType ? { businessType: commerce.businessType } : {}),
    ...(commerce.catalogMode ? { catalogMode: commerce.catalogMode } : {}),
    ...(commerce.generatedContentProfile ? { generatedContentProfile: commerce.generatedContentProfile } : {}),
    ...(commerce.primaryCTA ? { primaryCTA: commerce.primaryCTA } : {}),
    ...(commerce.businessProfile ? { businessProfile: commerce.businessProfile } : {}),
    ...(commerce.capabilities ? { capabilities: commerce.capabilities } : {}),
    ...(commerce.runtimeProfile ? { runtimeProfile: commerce.runtimeProfile } : {}),
    ...(commerce.dashboardWidgets?.length ? { dashboardWidgets: commerce.dashboardWidgets } : {}),
    resolvedBusinessProfile: resolvedCommerce.resolvedBusinessProfile ?? commerce.businessProfile ?? null,
    resolvedCatalogPresentation: resolvedCommerce.resolvedCatalogPresentation,
    canonicalBusinessType: resolvedCommerce.businessType,
    commerceType: resolvedCommerce.commerceType,
    catalogMode: resolvedCommerce.catalogMode ?? commerce.catalogMode,
    hasServices: resolvedCommerce.hasServices,
    includedInServices: resolvedCommerce.includedInServices,
    ...(stylePrefs?.showVideoMixes &&
    typeof stylePrefs.showVideoMixes === 'object' &&
    !Array.isArray(stylePrefs.showVideoMixes)
      ? { showVideoMixes: stylePrefs.showVideoMixes }
      : {}),
  };

  // Map products to public shape if they exist
  const products = Array.isArray(business.products)
    ? business.products.map((p) => {
        // Use translation utilities for product fields
        const productName = getTranslatedField(p, 'name', lang) || p.name;
        const productDescription = getTranslatedField(p, 'description', lang) ?? p.description ?? null;
        const productCategory = getTranslatedField(p, 'category', lang) ?? p.category ?? null;
        
        return enrichPublicCatalogItem(
          {
            id: p.id,
            name: productName,
            description: productDescription,
            category: productCategory,
            price: p.price ?? null,
            currency: p.currency ?? null,
            imageUrl: p.imageUrl ?? null,
            itemType: p.itemType ?? null,
            bookingEnabled: p.bookingEnabled ?? null,
            purchaseEnabled: p.purchaseEnabled ?? null,
            primaryAction: p.primaryAction ?? null,
            kind: p.kind ?? null,
            itemKind: p.itemKind ?? null,
            serviceCatalog: p.serviceCatalog ?? null,
          },
          catalogEnrichmentCtx,
        );
      })
    : [];

  const leakRepair = repairPublicCatalogServicePlaceholders(products, {
    ...catalogEnrichmentCtx,
    catalogLabel: commerce.catalogLabel,
  });
  const displayProducts = leakRepair.repaired ? leakRepair.products : products;

  const migrated = migrateServiceCatalogItems(displayProducts, {
    ...catalogEnrichmentCtx,
    storeId: business.id,
  });

  const publishedAt =
    business.publishedAt instanceof Date
      ? business.publishedAt.toISOString()
      : typeof business.publishedAt === 'string'
        ? business.publishedAt
        : null;

  return {
    ...base,
    products: migrated.items,
    ...(publishedAt ? { publishedAt } : {}),
  };
}

