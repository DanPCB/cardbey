/**
 * Estimated readiness impact + effort for finding codes (Phase 2).
 */

/** @type {Record<string, { percent: number, minutes: number, label: string }>} */
export const IMPACT_BY_CODE = {
  PROFILE_MISSING_NAME: { percent: 12, minutes: 2, label: 'Add business name' },
  PROFILE_PLACEHOLDER_NAME: { percent: 6, minutes: 2, label: 'Fix business name' },
  PROFILE_MISSING_CATEGORY: { percent: 5, minutes: 2, label: 'Set category' },
  PROFILE_MISSING_DESCRIPTION: { percent: 7, minutes: 8, label: 'Add description' },
  PROFILE_PLACEHOLDER_DESCRIPTION: { percent: 4, minutes: 8, label: 'Improve description' },
  PROFILE_MISSING_CONTACT: { percent: 8, minutes: 3, label: 'Add contact' },
  PROFILE_MISSING_LOCATION: { percent: 7, minutes: 5, label: 'Add location' },
  PROFILE_MISSING_HOURS: { percent: 5, minutes: 5, label: 'Add opening hours' },
  BRANDING_MISSING_LOGO: { percent: 6, minutes: 5, label: 'Add logo' },
  BRANDING_MISSING_HERO: { percent: 8, minutes: 5, label: 'Upload hero' },
  BRANDING_HERO_VIDEO_NOT_PLAYABLE: { percent: 10, minutes: 10, label: 'Fix hero video' },
  BRANDING_HERO_LOW_RESOLUTION: { percent: 3, minutes: 5, label: 'Upgrade hero image' },
  CATALOG_EMPTY: { percent: 15, minutes: 15, label: 'Add catalog items' },
  CATALOG_NO_ACTIVE_ITEMS: { percent: 12, minutes: 10, label: 'Publish catalog items' },
  CATALOG_MISSING_NAME: { percent: 8, minutes: 5, label: 'Name catalog items' },
  CATALOG_MISSING_PRICE: { percent: 9, minutes: 10, label: 'Add prices' },
  CATALOG_MISSING_DESCRIPTION: { percent: 5, minutes: 15, label: 'Add descriptions' },
  CATALOG_MISSING_IMAGE: { percent: 4, minutes: 15, label: 'Add product images' },
  CATALOG_EMPTY_CATEGORY: { percent: 3, minutes: 5, label: 'Assign categories' },
  CATALOG_DRAFT_ITEMS: { percent: 2, minutes: 5, label: 'Review drafts' },
  CATALOG_DUPLICATE_ITEMS: { percent: 2, minutes: 10, label: 'Resolve duplicates' },
  CATALOG_INVALID_SERVICE_TIERS: { percent: 7, minutes: 10, label: 'Fix service tiers' },
  STOREFRONT_HIDDEN: { percent: 14, minutes: 5, label: 'Make store visible' },
  STOREFRONT_MISSING_CTA: { percent: 6, minutes: 3, label: 'Configure CTA' },
  STOREFRONT_INVALID_CTA: { percent: 5, minutes: 3, label: 'Fix CTA destination' },
  STOREFRONT_BLOCKING_MEDIA: { percent: 10, minutes: 10, label: 'Fix blocking media' },
  COMMERCE_MISSING_PATH: { percent: 8, minutes: 8, label: 'Add customer path' },
  COMMERCE_MISSING_NOTIFICATION: { percent: 6, minutes: 3, label: 'Set notifications' },
  COMMERCE_MISSING_FULFILMENT: { percent: 4, minutes: 5, label: 'Set fulfilment' },
  MARKETING_MISSING_TAGLINE: { percent: 2, minutes: 5, label: 'Add tagline' },
  TRUST_UNVERIFIED_CLAIMS: { percent: 2, minutes: 10, label: 'Verify claims' },
  // Vertical
  VERTICAL_RESTAURANT_MENU_COVERAGE: { percent: 6, minutes: 20, label: 'Expand menu coverage' },
  VERTICAL_RESTAURANT_FEATURED_DISHES: { percent: 4, minutes: 10, label: 'Feature dishes' },
  VERTICAL_RETAIL_PRICING: { percent: 8, minutes: 10, label: 'Complete retail pricing' },
  VERTICAL_RETAIL_STOCK_VISIBILITY: { percent: 3, minutes: 5, label: 'Show stock status' },
  VERTICAL_SERVICE_DESCRIPTIONS: { percent: 6, minutes: 15, label: 'Improve service copy' },
  VERTICAL_SERVICE_QUOTE_PATH: { percent: 7, minutes: 8, label: 'Enable quote path' },
  VERTICAL_SERVICE_BOOKING: { percent: 7, minutes: 10, label: 'Enable booking' },
  VERTICAL_CREATOR_PUBLIC_PROFILE: { percent: 8, minutes: 10, label: 'Complete public profile' },
  VERTICAL_CREATOR_FEATURED_WORK: { percent: 6, minutes: 15, label: 'Add featured work' },
  VERTICAL_CREATOR_CONTACT: { percent: 5, minutes: 3, label: 'Add creator contact' },
};

/**
 * @param {string} code
 * @returns {{ estimatedImpactPercent: number, estimatedEffortMinutes: number, impactLabel: string }}
 */
export function impactForFindingCode(code) {
  const hit = IMPACT_BY_CODE[code];
  if (hit) {
    return {
      estimatedImpactPercent: hit.percent,
      estimatedEffortMinutes: hit.minutes,
      impactLabel: hit.label,
    };
  }
  return {
    estimatedImpactPercent: 3,
    estimatedEffortMinutes: 5,
    impactLabel: 'Improve store',
  };
}
