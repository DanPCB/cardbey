/**
 * Current storefront renderer capability contract + semantic→renderer mappings.
 * Gaps are explicit — shadow comparison surfaces them.
 */

import { STOREFRONT_ACTIONS } from '../contracts/storefrontAction.js';

export const ADAPTER_VERSION = 1;
export const COMPARISON_VERSION = 1;
export const RENDER_VIEW_MODEL_VERSION = 1;
export const LEGACY_EXTRACTOR_VERSION = 1;

/**
 * @typedef {{
 *   rendererId: string,
 *   version: number,
 *   supportedSectionRoles: string[],
 *   supportedVariantsByRole: Record<string, string[]>,
 *   supportedActions: string[],
 *   supportsFooterOnly: boolean,
 *   supportsCollapsedSections: boolean,
 *   supportsGroupedServices: boolean,
 *   supportsOriginBadges: boolean,
 * }} RendererCapabilities
 */

/** @type {Readonly<RendererCapabilities>} */
export const CURRENT_RENDERER_CAPABILITIES = Object.freeze({
  rendererId: 'cardbey-legacy-storefront-v1',
  version: 1,
  // Roles the live React path can render reasonably today
  supportedSectionRoles: Object.freeze([
    'hero',
    'services',
    'products',
    'menu',
    'gallery',
    'testimonials',
    'about',
    'booking',
    'contact',
    'location',
    'hours',
    'footer',
    // Partial / fallback-only below — listed so mapping exists, capability flags clarify gaps
    'service_categories',
    'projects',
    'trust',
    'quote',
    'service_area',
    'policies',
    'featured_items',
    'offers',
    'brands',
    'process',
  ]),
  supportedVariantsByRole: Object.freeze({
    hero: Object.freeze(['default']),
    services: Object.freeze(['default', 'list', 'card-grid', 'compact-cards']),
    service_categories: Object.freeze(['default', 'card-grid', 'compact-cards']), // grouped-list unsupported
    products: Object.freeze(['default', 'card-grid', 'compact-cards', 'list']),
    menu: Object.freeze(['default', 'menu-list', 'card-grid']),
    gallery: Object.freeze(['default', 'grid', 'masonry-small']),
    projects: Object.freeze(['default', 'grid', 'masonry-small']),
    testimonials: Object.freeze(['default', 'cards', 'featured-quote', 'carousel']),
    trust: Object.freeze(['default']), // trust-block → content-block fallback
    about: Object.freeze(['default']),
    booking: Object.freeze(['default']),
    quote: Object.freeze(['default']),
    contact: Object.freeze(['default']),
    location: Object.freeze(['default']),
    hours: Object.freeze(['default']),
    service_area: Object.freeze(['default']),
    policies: Object.freeze(['default', 'link-list']),
    footer: Object.freeze(['default']),
    featured_items: Object.freeze(['default']),
    offers: Object.freeze(['default']),
    brands: Object.freeze(['default']),
    process: Object.freeze(['default']),
  }),
  supportedActions: Object.freeze([...STOREFRONT_ACTIONS]),
  supportsFooterOnly: false, // legacy folds footer-only into footer links
  supportsCollapsedSections: false, // collapsed → hidden in public compatibility view
  supportsGroupedServices: false,
  supportsOriginBadges: false,
});

/**
 * Projection Renderer Cutover V1 — native semantic sections (no flatten of categories/policies/trust).
 * Collapsed still follows legacy public policy (unsupported → hidden).
 */
/** @type {Readonly<RendererCapabilities>} */
export const PROJECTION_CUTOVER_RENDERER_CAPABILITIES = Object.freeze({
  rendererId: 'cardbey-projection-cutover-v1',
  version: 1,
  supportedSectionRoles: Object.freeze([
    'hero',
    'service_categories',
    'services',
    'products',
    'menu',
    'projects',
    'gallery',
    'trust',
    'testimonials',
    'about',
    'booking',
    'quote',
    'contact',
    'location',
    'hours',
    'service_area',
    'policies',
    'footer',
    'featured_items',
    'offers',
    'brands',
    'process',
  ]),
  supportedVariantsByRole: Object.freeze({
    ...CURRENT_RENDERER_CAPABILITIES.supportedVariantsByRole,
    service_categories: Object.freeze([
      'default',
      'card-grid',
      'compact-cards',
      'grouped-list',
      'category-grid',
    ]),
    trust: Object.freeze(['default', 'trust-block', 'feature-list']),
    policies: Object.freeze(['default', 'link-list', 'footer_only']),
  }),
  supportedActions: Object.freeze([...STOREFRONT_ACTIONS]),
  supportsFooterOnly: true,
  supportsCollapsedSections: false,
  supportsGroupedServices: true,
  supportsOriginBadges: false,
});

/**
 * Projection section role → preferred renderer type.
 * @type {Readonly<Record<string, { rendererType: string, fallbackRendererType?: string, fallbackReason?: string }>>}
 */
export const SEMANTIC_TO_RENDERER_TYPE = Object.freeze({
  hero: Object.freeze({ rendererType: 'hero' }),
  service_categories: Object.freeze({
    rendererType: 'service-category-grid',
    fallbackRendererType: 'service-list',
    fallbackReason: 'grouped_service_categories_unsupported',
  }),
  services: Object.freeze({ rendererType: 'service-list' }),
  products: Object.freeze({ rendererType: 'product-grid' }),
  menu: Object.freeze({ rendererType: 'menu-list' }),
  projects: Object.freeze({ rendererType: 'portfolio-grid' }),
  gallery: Object.freeze({ rendererType: 'gallery' }),
  trust: Object.freeze({
    rendererType: 'trust-features',
    fallbackRendererType: 'content-block',
    fallbackReason: 'dedicated_trust_section_unsupported',
  }),
  testimonials: Object.freeze({ rendererType: 'testimonial-list' }),
  about: Object.freeze({ rendererType: 'rich-text' }),
  process: Object.freeze({ rendererType: 'process-steps' }),
  service_area: Object.freeze({ rendererType: 'service-area' }),
  booking: Object.freeze({ rendererType: 'booking-cta' }),
  quote: Object.freeze({ rendererType: 'quote-cta' }),
  contact: Object.freeze({ rendererType: 'contact' }),
  location: Object.freeze({ rendererType: 'location' }),
  hours: Object.freeze({ rendererType: 'business-hours' }),
  policies: Object.freeze({
    rendererType: 'policy-links',
    fallbackRendererType: 'footer-links',
    fallbackReason: 'dedicated_policies_section_unsupported',
  }),
  footer: Object.freeze({ rendererType: 'footer' }),
  featured_items: Object.freeze({ rendererType: 'featured-items' }),
  offers: Object.freeze({ rendererType: 'offers' }),
  brands: Object.freeze({ rendererType: 'brands' }),
});

/** Infer semantic role from legacy renderer section type / key. */
export const LEGACY_TYPE_TO_SEMANTIC = Object.freeze({
  hero: 'hero',
  Hero: 'hero',
  services: 'services',
  service: 'services',
  'service-list': 'services',
  products: 'products',
  'product-grid': 'products',
  menu: 'menu',
  'menu-list': 'menu',
  gallery: 'gallery',
  projects: 'projects',
  portfolio: 'projects',
  testimonials: 'testimonials',
  testimonial: 'testimonials',
  about: 'about',
  booking: 'booking',
  contact: 'contact',
  location: 'location',
  hours: 'hours',
  footer: 'footer',
  trust: 'trust',
  quote: 'quote',
});

/** Render-facing action labels (Phase 3 vocabulary; display-tuned). */
export const RENDER_ACTION_LABELS = Object.freeze({
  request_quote: 'Request a quote',
  call: 'Call now',
  book: 'Book now',
  buy: 'Buy now',
  add_to_cart: 'Add to cart',
  order: 'Order now',
  reserve: 'Reserve a table',
  enquire: 'Enquire',
  contact: 'Contact us',
  get_directions: 'Get directions',
  view_services: 'View services',
  view_products: 'View products',
});

/**
 * @param {Partial<RendererCapabilities>} [overrides]
 * @returns {RendererCapabilities}
 */
export function resolveRendererCapabilities(overrides = {}) {
  return Object.freeze({
    ...CURRENT_RENDERER_CAPABILITIES,
    ...overrides,
    supportedSectionRoles: Object.freeze([
      ...(overrides.supportedSectionRoles ?? CURRENT_RENDERER_CAPABILITIES.supportedSectionRoles),
    ]),
    supportedActions: Object.freeze([
      ...(overrides.supportedActions ?? CURRENT_RENDERER_CAPABILITIES.supportedActions),
    ]),
    supportedVariantsByRole: Object.freeze({
      ...CURRENT_RENDERER_CAPABILITIES.supportedVariantsByRole,
      ...(overrides.supportedVariantsByRole ?? {}),
    }),
  });
}
