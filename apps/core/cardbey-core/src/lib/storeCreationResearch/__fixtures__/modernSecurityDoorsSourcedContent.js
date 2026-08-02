/**
 * Modern Security Doors end-to-end sourced-content fixture (tests only).
 * Proves generic role routing — not hardcoded in production classifiers.
 */

import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../storefrontDesignLibrary/classification/__fixtures__/modernSecurityDoorsNav.js';

export const MODERN_SECURITY_DOORS_IDENTITY = Object.freeze({
  name: 'Modern Security Doors',
  location: '54/68 Eucumbene Dr, Ravenhall VIC 3023',
  website: 'https://modernsecuritydoors.com.au',
});

/** Expected offering labels (source-derived). */
export const MSD_EXPECTED_OFFERING_NAMES = Object.freeze([
  'Plantation Shutters Melbourne',
  'Fly Doors',
  'Fly Screen',
  'Security Windows',
  'Convert manual to electric Rollershutter',
  'Sheer & Curtain',
  'Security Doors & Screen',
  'Roller Shutters',
  'Roller Blinds',
  'Glass Door Melbourne',
]);

/** Expected non-offering labels. */
export const MSD_EXPECTED_NON_OFFERING = Object.freeze({
  Testimonials: 'testimonial',
  'Why Choose Us': 'trust_content',
  Career: 'career',
  'Return & Guarantee': 'policy',
  'Payment Policy': 'policy',
  'Customer Policy': 'policy',
  'Terms & Conditions': 'policy',
});

/**
 * Build classified product rows from the nav fixture (as research would after Phase 2).
 */
export function buildModernSecurityDoorsClassifiedProducts() {
  return MODERN_SECURITY_DOORS_NAV_FIXTURE.map((row, index) => {
    const role = row.expectedRole;
    const isOffering = [
      'product',
      'product_category',
      'service',
      'service_category',
      'menu_item',
      'menu_category',
    ].includes(role);
    return {
      id: `msd_${index}`,
      name: row.name,
      title: row.name,
      contentRole: role,
      roleConfidence: 0.92,
      roleReason: 'fixture_expected_role',
      contentOrigin: 'sourced',
      catalogSource: 'research',
      sourceUrl: row.url ? `https://modernsecuritydoors.com.au${row.url}` : undefined,
      type: row.type || role,
      category: isOffering ? row.name : 'Services',
      categoryId: isOffering ? `msd_cat_${index}` : 'orphan_cat',
      price: null,
      priceWasNotExplicitlyProvided: true,
    };
  });
}

export { MODERN_SECURITY_DOORS_NAV_FIXTURE };
