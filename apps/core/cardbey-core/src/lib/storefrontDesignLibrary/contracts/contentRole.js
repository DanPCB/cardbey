/**
 * Canonical business content roles (vocabulary stub for Phase 2 classification).
 * Phase 1 — define shared strings only; no classification logic.
 */

export const BUSINESS_CONTENT_ROLES = Object.freeze([
  'product',
  'service',
  'service_category',
  'product_category',
  'menu_item',
  'menu_category',
  'project',
  'gallery',
  'testimonial',
  'trust_content',
  'about',
  'contact',
  'location',
  'policy',
  'career',
  'blog',
  'support',
  'navigation',
  'unknown',
]);

export const BUSINESS_CONTENT_ROLE_SET = new Set(BUSINESS_CONTENT_ROLES);

/** @param {unknown} role */
export function isBusinessContentRole(role) {
  return typeof role === 'string' && BUSINESS_CONTENT_ROLE_SET.has(role);
}
