/**
 * Presentation profile — catalog labels, CTAs, section titles.
 * No UI should hardcode these; consume BusinessProfile.presentation.
 */

import { recommendedCatalogLabelForType } from '../catalog/classifyBusinessType.js';

/** @param {string} businessType @param {string} corpus */
export function resolvePresentation(businessType, corpus = '') {
  const catalogLabel = recommendedCatalogLabelForType(businessType, corpus);
  const base = presentationDefaults(businessType, catalogLabel);
  return {
    ...base,
    sectionTitles: buildSectionTitles(businessType, catalogLabel),
  };
}

/** @param {string} businessType @param {string} catalogLabel */
function presentationDefaults(businessType, catalogLabel) {
  switch (businessType) {
    case 'product_retail':
      return {
        catalogLabel,
        primaryCTA: 'Add to cart',
        secondaryCTA: 'View details',
        buttonStyle: 'commerce',
        defaultBadge: null,
        navigationStyle: 'product_grid',
      };
    case 'service_fixed_booking':
      return {
        catalogLabel,
        primaryCTA: 'Book',
        secondaryCTA: 'View services',
        buttonStyle: 'booking',
        defaultBadge: 'Instant booking',
        navigationStyle: 'service_sections',
      };
    case 'service_quote_required':
      return {
        catalogLabel,
        primaryCTA: 'Request quote',
        secondaryCTA: 'Ask question',
        buttonStyle: 'quote',
        defaultBadge: 'Quote required',
        navigationStyle: 'service_sections',
      };
    case 'food_menu':
      return {
        catalogLabel,
        primaryCTA: 'Order',
        secondaryCTA: 'View menu',
        buttonStyle: 'order',
        defaultBadge: null,
        navigationStyle: 'menu_categories',
      };
    case 'hybrid':
      return {
        catalogLabel,
        primaryCTA: 'Shop',
        secondaryCTA: 'Book',
        buttonStyle: 'mixed',
        defaultBadge: null,
        navigationStyle: 'catalog_sections',
      };
    default:
      return {
        catalogLabel: 'Catalog',
        primaryCTA: 'Contact',
        secondaryCTA: 'Learn more',
        buttonStyle: 'default',
        defaultBadge: null,
        navigationStyle: 'default',
      };
  }
}

/** @param {string} businessType @param {string} catalogLabel */
function buildSectionTitles(businessType, catalogLabel) {
  switch (businessType) {
    case 'service_fixed_booking':
      return [catalogLabel, 'Book services'];
    case 'service_quote_required':
      return [catalogLabel, 'Request a quote', 'Projects'];
    case 'food_menu':
      return ['Menu', 'Popular', 'Specials'];
    case 'hybrid':
      return ['Services', 'Products', 'Catalog'];
    default:
      return [catalogLabel];
  }
}

/**
 * @param {import('./types.js').BusinessPresentation} presentation
 * @param {number} [itemCount]
 */
export function formatSectionTitle(presentation, itemCount) {
  const label = presentation?.catalogLabel ?? 'Catalog';
  return itemCount != null && itemCount > 0 ? `${label} (${itemCount})` : label;
}
