/**
 * Single source of truth: service (booking) vs product (order) commerce mode.
 * Used at publish, API mapping, catalog generation, and mirrored in dashboard storeTransactionMode.ts.
 */

import {
  inferCatalogSectionLabel,
  inferDefaultItemType,
  isServiceBusinessContext,
  normalizeCatalogItem,
  resolveItemCommerceModeFromClassification,
} from './catalog/catalogItemClassification.js';
import { classifyBusinessVertical } from './classifyBusinessVertical.js';
import { getStoreCatalogPresentation, shouldOverrideStoredCatalogLabel } from './catalog/catalogPresentation.js';
import { buildCatalogGenerationProfile } from './catalog/buildCatalogGenerationProfile.js';

export const COMMERCE_MODES = ['booking', 'order', 'inquiry'];

export const SERVICE_VERTICALS = [
  'beauty',
  'health',
  'sports',
  'arts_and_crafts',
  'arts & crafts',
  'arts and crafts',
  'hair',
  'salon',
  'spa',
  'fitness',
  'wellness',
  'medical',
  'dental',
  'coaching',
  'consulting',
  'service',
  'services',
  'barber',
  'physio',
  'clinic',
  'nail',
  'lash',
  'wax',
  'yoga',
  'pilates',
  'gym',
  'massage',
  'therapy',
  'tattoo',
  'studio',
  'travel',
  'tour',
  'tours',
  'golf',
  'agency',
  'photography',
  'photo',
  'repair',
  'repairs',
  'class',
  'classes',
  'lesson',
  'lessons',
  'workshop',
  'appointment',
  'booking',
  'tourism',
  'event',
  'venue',
  'ticket',
  'package',
  'packages',
  'function room',
  'function_room',
  'supplier',
];

const INQUIRY_HINTS = /\b(custom|quote|bespoke|consultation|enquir|inquiry|estimate|tailor)\b/i;
const FOODISH_RE =
  /\b(restaurant|cafe|coffee|bakery|baker|food|dining|kitchen|bar|bistro|eatery|pizza|noodle|noodles|takeaway|take-away|sushi|thai|ramen|burger|kebab)\b/i;
const PRODUCTISH_RE = /\b(retail|shop|store|product|merchandise|boutique|florist|market|gallery)\b/i;

/**
 * @param {string | null | undefined} businessType
 * @returns {boolean}
 */
export function isServiceVertical(businessType) {
  if (!businessType) return false;
  const normalized = String(businessType).toLowerCase().trim();
  if (!normalized) return false;
  return SERVICE_VERTICALS.some((v) => normalized.includes(v));
}

/**
 * @param {string | null | undefined} businessType
 * @param {{ commerceMode?: string | null }} [options]
 * @returns {'booking' | 'order' | 'inquiry'}
 */
export function resolveCommerceMode(businessType, options = {}) {
  const explicit = String(options.commerceMode ?? '').trim().toLowerCase();
  if (COMMERCE_MODES.includes(explicit)) return explicit;

  const classification = classifyBusinessVertical({
    businessType,
    businessName: options.businessName ?? options.storeName ?? null,
    category: options.category ?? null,
    commerceMode: options.commerceVerticalMode ?? null,
    businessVertical: options.businessVertical ?? null,
  });
  return classification.legacyCommerceMode;
}

/**
 * @param {'booking' | 'order' | 'inquiry'} commerceMode
 * @returns {'booking' | 'order'}
 */
export function commerceModeToTransactionMode(commerceMode) {
  return commerceMode === 'booking' ? 'booking' : 'order';
}

/**
 * @param {'booking' | 'order' | 'inquiry'} commerceMode
 * @param {string | null | undefined} [businessType]
 * @param {{ ctaLabel?: string | null, ctaAction?: string | null, catalogLabel?: string | null }} [overrides]
 */
export function resolveCommerceFromMode(commerceMode, businessType, overrides = {}) {
  const trimmedCta = String(overrides.ctaLabel ?? '').trim();
  const trimmedAction = String(overrides.ctaAction ?? '').trim();
  const trimmedCatalog = String(overrides.catalogLabel ?? '').trim();
  const classification = classifyBusinessVertical({
    businessType,
    businessName: overrides.businessName ?? overrides.storeName ?? null,
    category: overrides.category ?? null,
  });

  if (commerceMode === 'booking') {
    return {
      commerceMode: 'booking',
      transactionMode: 'booking',
      catalogLabel: trimmedCatalog || inferCatalogSectionLabel(businessType, 'booking'),
      ctaLabel: trimmedCta || classification.ctaLabel || 'Book now',
      ctaAction: trimmedAction || 'booking',
      businessVertical: classification.businessVertical,
      commerceVerticalMode: classification.commerceMode,
    };
  }
  if (commerceMode === 'inquiry') {
    return {
      commerceMode: 'inquiry',
      transactionMode: 'order',
      catalogLabel: trimmedCatalog || classification.catalogLabel || 'Services',
      ctaLabel: trimmedCta || classification.ctaLabel || 'Enquire now',
      ctaAction: trimmedAction || 'inquiry',
      businessVertical: classification.businessVertical,
      commerceVerticalMode: classification.commerceMode,
    };
  }

  const isProducts = classification.commerceMode === 'products';
  const foodish = classification.businessVertical === 'food' || FOODISH_RE.test(String(businessType || ''));
  return {
    commerceMode: 'order',
    transactionMode: 'order',
    catalogLabel: trimmedCatalog || (foodish ? 'Menu' : isProducts ? 'Products' : 'Products'),
    ctaLabel: trimmedCta || classification.ctaLabel || (foodish ? 'Order now' : isProducts ? 'Shop now' : 'Add to cart'),
    ctaAction: trimmedAction || 'order',
    businessVertical: classification.businessVertical,
    commerceVerticalMode: classification.commerceMode,
  };
}

/**
 * @param {object | null | undefined} item
 * @param {'booking' | 'order' | 'inquiry'} storeCommerceMode
 * @returns {'service' | 'product'}
 */
export function resolveItemKind(item, storeCommerceMode, businessType) {
  const normalized = normalizeCatalogItem(item, {
    businessType,
    commerceMode: storeCommerceMode,
  });
  return normalized.kind;
}

/**
 * @param {object | null | undefined} item
 * @param {'booking' | 'order' | 'inquiry'} storeCommerceMode
 * @param {{ businessType?: string | null, businessName?: string | null }} [ctx]
 * @returns {'booking' | 'order' | 'inquiry'}
 */
export function resolveItemCommerceMode(item, storeCommerceMode, ctx = {}) {
  return resolveItemCommerceModeFromClassification(item, storeCommerceMode, ctx);
}

/**
 * Resolve store + item commerce for draft/publish.
 * @param {{ storeType?: string | null, businessType?: string | null, commerceMode?: string | null, transactionMode?: string | null, items?: object[] | null, ctaLabel?: string | null, ctaAction?: string | null, catalogLabel?: string | null }} input
 */
export function resolveStoreCommerce(input = {}) {
  const businessType = input.businessType ?? input.storeType ?? null;
  const businessName = input.businessName ?? input.storeName ?? null;
  const classification = classifyBusinessVertical({
    category: input.category ?? null,
    businessType,
    businessName,
    commerceMode: input.commerceVerticalMode ?? null,
    businessVertical: input.businessVertical ?? null,
  });

  let commerceMode = resolveCommerceMode(businessType, {
    commerceMode: input.commerceMode,
    businessName,
    category: input.category ?? null,
    businessVertical: classification.businessVertical,
    commerceVerticalMode: classification.commerceMode,
  });

  if (input.transactionMode === 'booking') commerceMode = 'booking';
  else if (input.transactionMode === 'order' && !input.commerceMode) {
    if (classification.businessVertical === 'food' || classification.businessVertical === 'retail') {
      commerceMode = 'order';
    } else if (isServiceBusinessContext({ type: businessType, name: businessName })) {
      commerceMode = 'booking';
    } else {
      commerceMode = resolveCommerceMode(businessType, { commerceMode: 'order', businessName });
    }
  }

  const itemCtx = { businessType, businessName };
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length > 0) {
    const itemModes = items.map((it) => resolveItemCommerceMode(it, commerceMode, itemCtx));
    const hasBooking = itemModes.some((m) => m === 'booking' || m === 'inquiry');
    const hasOrder = itemModes.some((m) => m === 'order');
    if (hasBooking && !hasOrder) commerceMode = commerceMode === 'inquiry' ? 'inquiry' : 'booking';
    else if (hasOrder && !hasBooking) commerceMode = 'order';
  }

  const catalogProfile = buildCatalogGenerationProfile({
    businessName,
    businessType,
    category: input.category ?? null,
    items: input.items,
  });
  const presentation = getStoreCatalogPresentation(
    {
      name: businessName,
      type: businessType,
      catalogLabel: input.catalogLabel,
      catalogMode: input.catalogMode ?? catalogProfile.catalogMode,
    },
    input.items,
  );

  const resolved = resolveCommerceFromMode(commerceMode, businessType, {
    ctaLabel: input.ctaLabel ?? catalogProfile.ctaLabel,
    ctaAction: input.ctaAction ?? catalogProfile.ctaAction,
    catalogLabel: shouldOverrideStoredCatalogLabel(input.catalogLabel, presentation.catalogLabel)
      ? presentation.catalogLabel
      : input.catalogLabel,
    businessName,
    category: input.category ?? null,
  });
  if (!input.catalogLabel?.trim() || shouldOverrideStoredCatalogLabel(input.catalogLabel, presentation.catalogLabel)) {
    resolved.catalogLabel = presentation.catalogLabel;
  }
  resolved.businessType = catalogProfile.businessType;
  resolved.catalogMode = catalogProfile.catalogMode;
  resolved.generatedContentProfile = catalogProfile.generatedContentProfile;
  resolved.primaryCTA = catalogProfile.primaryCTA;
  return resolved;
}

export { normalizeCatalogItem, inferDefaultItemType, inferCatalogSectionLabel, isServiceBusinessContext };

/**
 * Normalize CTA copy for service/booking stores — DB default is often "Order now".
 * @param {{ businessType?: string | null, transactionMode?: string | null, ctaLabel?: string | null }} input
 * @returns {string}
 */
export function coerceServiceCtaLabel({ businessType, transactionMode, ctaLabel, businessName } = {}) {
  const trimmed = String(ctaLabel ?? '').trim();
  const classification = classifyBusinessVertical({
    businessType,
    businessName: businessName ?? null,
  });
  if (transactionMode === 'booking') {
    if (!trimmed || /^order\s+now$/i.test(trimmed) || /^add\s+to\s+cart$/i.test(trimmed) || /^shop\s+now$/i.test(trimmed)) {
      return classification.ctaLabel === 'Contact business' ? 'Book now' : classification.ctaLabel || 'Book now';
    }
    return trimmed;
  }
  if (transactionMode === 'order') {
    if (!trimmed || /^book(\s+now|\s+appointment)?$/i.test(trimmed)) {
      if (classification.businessVertical === 'retail') return 'Shop now';
      if (classification.businessVertical === 'food') return 'Order now';
      return 'Order now';
    }
    return trimmed;
  }
  const isFoodOrRetail =
    classification.businessVertical === 'food' || classification.businessVertical === 'retail';
  const isService =
    !isFoodOrRetail &&
    (transactionMode === 'booking' ||
      (transactionMode !== 'order' && isServiceVertical(businessType)));
  if (isService) {
    if (!trimmed || /^order\s+now$/i.test(trimmed) || /^add\s+to\s+cart$/i.test(trimmed) || /^shop\s+now$/i.test(trimmed)) {
      return classification.ctaLabel || 'Book now';
    }
    return trimmed;
  }
  if (!trimmed || /^book(\s+now|\s+appointment)?$/i.test(trimmed)) {
    return classification.ctaLabel || 'Order now';
  }
  return trimmed;
}

/** @deprecated Prefer resolveStoreCommerce — kept for existing callers */
export function resolveTransactionCommerce(businessType) {
  const mode = resolveCommerceMode(businessType);
  const resolved = resolveCommerceFromMode(mode, businessType);
  return {
    transactionMode: resolved.transactionMode,
    catalogLabel: resolved.catalogLabel,
    ctaLabel: resolved.ctaLabel,
    ctaAction: resolved.ctaAction,
  };
}
