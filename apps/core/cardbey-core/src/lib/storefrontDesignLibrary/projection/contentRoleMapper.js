/**
 * Canonical BusinessContentRole → section role mapping.
 * One explicit layer — do not map all rows into services.
 */

/** @type {Readonly<Record<string, string | null>>} */
export const CONTENT_ROLE_TO_SECTION = Object.freeze({
  service_category: 'service_categories',
  service: 'services',
  product_category: 'products',
  product: 'products',
  menu_category: 'menu',
  menu_item: 'menu',
  project: 'projects',
  gallery: 'gallery',
  testimonial: 'testimonials',
  trust_content: 'trust',
  about: 'about',
  location: 'location', // may remount to service_area by blueprint
  policy: 'policies',
  career: 'footer',
  contact: 'contact',
  blog: 'footer',
  support: 'footer',
  navigation: null, // always hidden — no section body
  unknown: '_unknown_review',
});

/** Roles that must never land in offering sections. */
export const FORBIDDEN_OFFERING_ROLES = Object.freeze([
  'policy',
  'career',
  'navigation',
  'testimonial',
  'trust_content',
  'blog',
  'support',
]);

export const OFFERING_SECTION_ROLES = Object.freeze([
  'services',
  'service_categories',
  'products',
  'menu',
  'featured_items',
]);

/**
 * @param {string} contentRole
 * @param {{ hasServiceAreaSection?: boolean, hasLocationSection?: boolean }} [opts]
 * @returns {string | null} target section role, or null if intentionally unmapped/hidden
 */
export function mapContentRoleToSection(contentRole, opts = {}) {
  const role = String(contentRole ?? '').trim();
  if (!role) return null;

  if (role === 'location') {
    if (opts.hasServiceAreaSection && !opts.hasLocationSection) return 'service_area';
    if (opts.hasLocationSection) return 'location';
    if (opts.hasServiceAreaSection) return 'service_area';
    return 'location';
  }

  if (role === 'blog') return 'footer'; // footer_only via visibility rules
  if (role === 'support') return 'footer';

  if (Object.prototype.hasOwnProperty.call(CONTENT_ROLE_TO_SECTION, role)) {
    return CONTENT_ROLE_TO_SECTION[role];
  }
  return null;
}

/**
 * @param {string} contentRole
 * @param {string} sectionRole
 */
export function isForbiddenPlacement(contentRole, sectionRole) {
  if (!FORBIDDEN_OFFERING_ROLES.includes(contentRole)) return false;
  return OFFERING_SECTION_ROLES.includes(sectionRole);
}
