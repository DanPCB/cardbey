/**
 * Deterministic section variant selection from counts / media / origin.
 */

/** Preferred variants by section role (must appear in section.supportedVariants when possible). */
export const VARIANT_CATALOG = Object.freeze({
  service_categories: Object.freeze(['compact-cards', 'card-grid', 'grouped-list', 'category-grid', 'default']),
  services: Object.freeze(['compact-cards', 'card-grid', 'list', 'default']),
  products: Object.freeze(['card-grid', 'compact-cards', 'list', 'default']),
  menu: Object.freeze(['menu-list', 'card-grid', 'default']),
  testimonials: Object.freeze(['featured-quote', 'cards', 'carousel', 'default']),
  gallery: Object.freeze(['masonry-small', 'grid', 'default']),
  projects: Object.freeze(['masonry-small', 'grid', 'default']),
  trust: Object.freeze(['trust-block', 'default']),
  hero: Object.freeze(['default']),
  quote: Object.freeze(['default']),
  booking: Object.freeze(['default']),
  contact: Object.freeze(['default']),
  footer: Object.freeze(['default']),
  policies: Object.freeze(['link-list', 'default']),
});

/**
 * @param {string} sectionRole
 * @param {{
 *   itemCount: number,
 *   hasMedia?: boolean,
 *   contentOrigin?: string,
 *   supportedVariants?: string[],
 *   defaultVariant?: string,
 * }} opts
 * @returns {{ variant: string, reason: string }}
 */
export function selectSectionVariant(sectionRole, opts = {}) {
  const count = Number(opts.itemCount) || 0;
  const supported = Array.isArray(opts.supportedVariants) && opts.supportedVariants.length
    ? opts.supportedVariants
    : ['default'];
  const fallback = opts.defaultVariant && supported.includes(opts.defaultVariant)
    ? opts.defaultVariant
    : supported[0];

  /** @type {string} */
  let preferred = fallback;
  /** @type {string} */
  let reason = 'default';

  switch (sectionRole) {
    case 'service_categories':
    case 'services':
    case 'products': {
      if (count <= 0) {
        preferred = fallback;
        reason = 'empty';
      } else if (count <= 3) {
        preferred = 'compact-cards';
        reason = 'count_1_3';
      } else if (count <= 8) {
        preferred = 'card-grid';
        reason = 'count_4_8';
      } else if (sectionRole === 'service_categories') {
        preferred = count >= 9 ? 'grouped-list' : 'category-grid';
        reason = 'count_9_plus';
      } else {
        preferred = 'card-grid';
        reason = 'count_9_plus';
      }
      break;
    }
    case 'testimonials': {
      if (count <= 0) {
        preferred = fallback;
        reason = 'empty';
      } else if (count === 1) {
        preferred = 'featured-quote';
        reason = 'count_1';
      } else if (count <= 5) {
        preferred = 'cards';
        reason = 'count_2_5';
      } else {
        preferred = 'carousel';
        reason = 'count_6_plus';
      }
      break;
    }
    case 'gallery':
    case 'projects': {
      if (count <= 0 || opts.hasMedia === false) {
        preferred = fallback;
        reason = 'no_media';
      } else if (count <= 4) {
        preferred = 'masonry-small';
        reason = 'few_media';
      } else {
        preferred = 'grid';
        reason = 'many_media';
      }
      break;
    }
    case 'menu': {
      preferred = count > 8 ? 'menu-list' : count > 0 ? 'card-grid' : fallback;
      reason = count > 8 ? 'menu_long' : count > 0 ? 'menu_cards' : 'empty';
      break;
    }
    case 'trust': {
      preferred = 'trust-block';
      reason = 'trust';
      break;
    }
    case 'policies': {
      preferred = 'link-list';
      reason = 'policies';
      break;
    }
    default:
      preferred = fallback;
      reason = 'section_default';
  }

  // Effective support: blueprint list ∪ catalog for this role (advisory expansion).
  const catalog = VARIANT_CATALOG[sectionRole] ?? [];
  const effective = new Set([...supported, ...catalog]);
  if (!effective.has(preferred)) {
    return { variant: fallback, reason: `${reason}_fallback` };
  }
  // Prefer blueprint-declared when preferred is only from catalog expansion
  if (!supported.includes(preferred) && supported.includes(fallback)) {
    // Still allow catalog variants for explainable selection (Phase 5 expands effective set)
    return { variant: preferred, reason };
  }
  return { variant: preferred, reason };
}
