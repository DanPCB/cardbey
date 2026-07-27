/**
 * Service catalog generator — produces typed ServiceCatalogItem records.
 */

import { normalizeCanonicalServices } from '../canonicalServiceNormalizer.js';
import {
  classifyConversionAction,
  formatServiceDisplayPrice,
  inferServiceBookingMode,
  inferServicePriceMode,
} from './serviceCatalogHelpers.js';

/**
 * @param {object} blueprintItem
 * @param {number} index
 * @param {string} categoryId
 * @param {object} ctx
 * @returns {import('../../commerce/commerceProfileTypes.js').ServiceCatalogItem}
 */
export function blueprintItemToServiceCatalogItem(blueprintItem, index, categoryId, ctx = {}) {
  const src = blueprintItem ?? {};
  const name = String(src.name ?? `Service ${index + 1}`).trim();
  const conversion = classifyConversionAction(name);
  const hasPriceEvidence =
    src.priceProvenance === 'owner' ||
    src.priceProvenance === 'research' ||
    (ctx.allowBlueprintPrices === true && src.fromPrice != null);

  const priceMode = conversion?.priceMode ?? inferServicePriceMode(src, { hasPriceEvidence });
  const bookingMode = conversion?.bookingMode ?? inferServiceBookingMode(src);
  const currencyCode = ctx.currencyCode ?? 'AUD';

  /** @type {import('../../commerce/commerceProfileTypes.js').ServiceCatalogItem} */
  const item = {
    id: src.id ?? `svc_${index}`,
    itemKind: 'service',
    itemType: 'service',
    type: 'service',
    kind: 'service',
    name,
    description: src.description ?? null,
    categoryId,
    category: src.categoryKey ?? src.category,
    serviceMode: src.serviceMode === 'fixed_booking' ? 'on_site' : 'mobile',
    bookingMode,
    priceMode,
    bookingEnabled: bookingMode === 'instant' || bookingMode === 'request',
    purchaseEnabled: false,
    primaryAction: bookingMode === 'quote_first' || bookingMode === 'contact_only' ? 'enquire' : 'book',
    executionAction:
      bookingMode === 'quote_first' ? 'request_quote' : bookingMode === 'contact_only' ? 'contact' : 'book',
    pricingModel: priceMode === 'hourly' ? 'hourly' : priceMode === 'starting_from' ? 'from_price' : priceMode === 'free' ? 'custom' : 'custom',
    currencyCode,
    currency: currencyCode,
    durationMinutes: src.durationMinutes ?? undefined,
    estimateDurationLabel: src.estimateDurationLabel ?? undefined,
    imageQueryHint: src.imageQueryHint ?? undefined,
    priceProvenance: hasPriceEvidence ? (src.priceProvenance ?? 'blueprint') : null,
    active: true,
  };

  if (conversion?.recordType === 'conversion_action') {
    item.recordType = 'conversion_action';
    item.transactionMode = conversion.transactionMode;
    item.priceMode = 'quote_required';
    item.bookingMode = 'quote_first';
    item.primaryAction = 'enquire';
    item.executionAction = 'request_quote';
  }

  if (conversion?.urgencySupported) item.urgencySupported = true;

  if (priceMode === 'free') {
    item.price = 0;
    item.displayPrice = 'Free';
  } else if (priceMode === 'quote_required') {
    item.price = undefined;
    item.fromPrice = undefined;
    item.displayPrice = 'Quote required';
  } else if (priceMode === 'starting_from' && hasPriceEvidence && src.fromPrice != null) {
    item.fromPrice = src.fromPrice;
    item.priceUnit = src.priceUnit;
    item.displayPrice = formatServiceDisplayPrice(item, currencyCode);
  } else if (priceMode === 'hourly' && hasPriceEvidence && src.fromPrice != null) {
    item.fromPrice = src.fromPrice;
    item.priceUnit = 'hour';
    item.displayPrice = formatServiceDisplayPrice(item, currencyCode);
  } else {
    item.price = undefined;
    item.fromPrice = undefined;
    item.displayPrice = 'Quote required';
    item.priceMode = 'quote_required';
  }

  if (src.tags) item.tags = src.tags;
  return item;
}

/**
 * @param {{ categories: object[], items: object[], meta?: object }} blueprintResult
 * @param {import('../../commerce/commerceProfileTypes.js').BusinessCommerceProfile} profile
 * @param {{ allowBlueprintPrices?: boolean, targetCount?: number }} [opts]
 */
export function generateServiceCatalogFromBlueprint(blueprintResult, profile, opts = {}) {
  const categories = blueprintResult?.categories ?? [];
  const rawItems = blueprintResult?.items ?? [];
  const ctx = {
    currencyCode: profile.currencyCode ?? 'AUD',
    allowBlueprintPrices: opts.allowBlueprintPrices === true,
  };

  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const services = rawItems.map((src, i) =>
    blueprintItemToServiceCatalogItem(
      src,
      i,
      src.categoryId ?? categories[0]?.id,
      ctx,
    ),
  );

  const normalized = normalizeCanonicalServices(services, categories);
  const items = normalized.items;

  return {
    catalogKind: 'service',
    catalogItems: items,
    categories,
    meta: {
      ...(blueprintResult?.meta ?? {}),
      catalogKind: 'service',
      businessCommerceProfile: profile,
      canonicalNormalization: { mergedCount: normalized.mergedCount },
    },
  };
}

/**
 * @param {import('../../commerce/commerceProfileTypes.js').CatalogItem[]} items
 * @param {import('../../commerce/commerceProfileTypes.js').BusinessCommerceProfile} profile
 */
export function stampServiceCatalogItems(items, profile) {
  return (items ?? []).map((item, i) => {
    if (!item || typeof item !== 'object') return item;
    if (item.itemKind === 'service' || item.itemType === 'service') return item;
    return blueprintItemToServiceCatalogItem(item, i, item.categoryId, {
      currencyCode: profile.currencyCode,
      allowBlueprintPrices: false,
    });
  });
}
