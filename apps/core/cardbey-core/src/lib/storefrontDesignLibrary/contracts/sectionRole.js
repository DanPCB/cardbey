/**
 * Canonical storefront section roles (structural vocabulary only).
 * Phase 1 — no classification or projection logic.
 */

export const SECTION_ROLES = Object.freeze([
  'hero',
  'service_categories',
  'services',
  'products',
  'menu',
  'featured_items',
  'projects',
  'gallery',
  'trust',
  'testimonials',
  'about',
  'process',
  'service_area',
  'booking',
  'quote',
  'offers',
  'brands',
  'contact',
  'location',
  'hours',
  'policies',
  'footer',
]);

export const SECTION_ROLE_SET = new Set(SECTION_ROLES);

/** @param {unknown} role */
export function isSectionRole(role) {
  return typeof role === 'string' && SECTION_ROLE_SET.has(role);
}
