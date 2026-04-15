/**
 * Public Store Mapper
 * Maps Business/Store data to safe public DTO
 * Never exposes sensitive data (userId, internal IDs, etc.)
 */

import { getTranslatedField } from '../services/i18n/translationUtils.js';

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

  // Parse region for city/country if available
  // For now, region is just a string, but we can extend this later
  const region = business.region || null;

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
  const heroFromPrefs = stylePrefs?.heroImage ?? stylePrefs?.heroImageUrl ?? null;
  const avatarFromPrefs = stylePrefs?.avatarImage ?? stylePrefs?.profileAvatarUrl ?? stylePrefs?.avatarImageUrl ?? null;
  const resolvedAvatarUrl = business.avatarImageUrl ?? avatarFromPrefs ?? avatarUrl;
  const resolvedHeroUrl = business.heroImageUrl ?? heroFromPrefs ?? bannerUrl;

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
  const base = {
    id: business.id,
    name,
    slug: business.slug, // Required field, should always exist
    description,
    tagline: business.tagline ?? null,
    type: business.type ?? null,
    avatarUrl: resolvedAvatarUrl,
    bannerUrl: resolvedHeroUrl, // Hero for feed/preview (was logo-derived; now heroImageUrl first)
    heroUrl: resolvedHeroUrl, // Alias for consumers that expect heroUrl
    city: null, // Can be extracted from region if needed
    country: null, // Can be extracted from region if needed
    website,
    showOwnerProfile: business.showOwnerProfile ?? false,
    ownerProfileSlug: business.user?.personalPresenceStore?.slug ?? null,
    ...(storefrontSettings != null ? { storefrontSettings } : {}),
  };

  // Map products to public shape if they exist
  const products = Array.isArray(business.products)
    ? business.products.map((p) => {
        // Use translation utilities for product fields
        const productName = getTranslatedField(p, 'name', lang) || p.name;
        const productDescription = getTranslatedField(p, 'description', lang) ?? p.description ?? null;
        const productCategory = getTranslatedField(p, 'category', lang) ?? p.category ?? null;
        
        return {
          id: p.id,
          name: productName,
          description: productDescription,
          category: productCategory,
          price: p.price ?? null,      // Price as number (could be in cents or dollars, depending on usage)
          currency: p.currency ?? null,
          imageUrl: p.imageUrl ?? null,
        };
      })
    : [];

  return {
    ...base,
    products,
  };
}

