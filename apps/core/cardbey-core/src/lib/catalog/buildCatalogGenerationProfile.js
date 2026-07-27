/**
 * Build catalog generation profile from Business Semantic Layer (BSL).
 * @deprecated Consumers should prefer buildBusinessProfile from businessSemantic/.
 */

import { buildBusinessProfile, businessProfileToLegacyCatalogProfile } from '../businessSemantic/index.js';
import { normalizeServiceCatalogItem, toServiceCatalogJson } from './serviceCatalogNormalizer.js';

/**
 * @param {object} input - same shape as classifyBusinessType input
 */
export function buildCatalogGenerationProfile(input = {}) {
  const result = buildBusinessProfile(input);
  const legacy = businessProfileToLegacyCatalogProfile(result.profile);
  return {
    ...legacy,
    businessProfile: result.profile,
    confidence: result.confidence,
    reasoning: result.reasoning,
    recommendedCatalogLabel: legacy.catalogLabel,
    suggestedSubcategories: legacy.suggestedSubcategories,
    primaryCTA: legacy.primaryCTA,
    defaultCTA: legacy.primaryCTA,
    generatedContentProfile: legacy.generatedContentProfile,
    categoryHints: legacy.categoryHints,
  };
}

/**
 * Apply generation profile defaults to draft catalog items.
 * @param {object[]} items
 * @param {ReturnType<typeof buildCatalogGenerationProfile>} profile
 * @param {{ businessType?: string | null, businessName?: string | null }} ctx
 */
export function applyCatalogProfileToItems(items, profile, ctx = {}) {
  if (!Array.isArray(items) || !profile) return items;
  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const base = { ...item };
    if (profile.businessType === 'product_retail') {
      return {
        ...base,
        itemType: 'product',
        type: 'product',
        kind: 'product',
        purchaseEnabled: true,
        bookingEnabled: false,
        primaryAction: 'add_to_cart',
        executionAction: 'add_to_cart',
      };
    }
    if (profile.businessType === 'food_menu') {
      return {
        ...base,
        itemType: 'service',
        type: 'menu_item',
        kind: 'service',
        purchaseEnabled: true,
        bookingEnabled: false,
        primaryAction: 'add_to_cart',
        executionAction: 'add_to_cart',
      };
    }
    if (profile.businessType === 'hybrid') {
      const isProduct = norm(item.itemType ?? item.type ?? item.kind) === 'product';
      if (isProduct) return base;
    }

    const serviceMode =
      profile.businessType === 'service_quote_required' ? 'quote_required' : 'fixed_booking';
    const enriched = normalizeServiceCatalogItem(
      {
        ...base,
        serviceMode,
        itemType: 'service',
        type: 'service',
      },
      { ...ctx, itemType: 'service' },
    );
    return {
      ...base,
      itemType: 'service',
      type: 'service',
      kind: 'service',
      serviceMode: enriched.serviceMode,
      pricingModel: enriched.pricingModel,
      fromPrice: enriched.fromPrice,
      price: enriched.price ?? base.price,
      durationMinutes: enriched.durationMinutes ?? base.durationMinutes,
      executionAction: enriched.executionAction,
      primaryAction: enriched.executionAction === 'book' ? 'book' : 'enquire',
      bookingEnabled: enriched.executionAction === 'book',
      purchaseEnabled: false,
      serviceCatalog: toServiceCatalogJson(enriched),
    };
  });
}

function norm(value) {
  return String(value ?? '').toLowerCase().trim();
}

/**
 * Build category objects from suggested subcategories.
 * @param {string[]} suggestedSubcategories
 * @param {string} [prefix]
 */
export function buildCategoriesFromProfile(suggestedSubcategories, prefix = 'cat') {
  const labels = (suggestedSubcategories ?? []).filter((s) => s && s !== 'All');
  return labels.map((label, i) => ({
    id: `${prefix}_${i}`,
    name: label,
    label,
  }));
}
