/**
 * Resilient commerce presentation resolver — SSOT for marketplace + feed discovery.
 * Works for BusinessProfile stores, serviceCatalog items, and legacy category-only stores.
 */

import { BUSINESS_TYPES } from './types.js';
import { extractBusinessProfile } from './BusinessProfileRepository.js';
import { resolveCommerceType, resolveCatalogMode } from './BusinessJourneyResolver.js';
import { classifyBusinessType } from '../catalog/classifyBusinessType.js';
import { recommendedCatalogLabelForType } from '../catalog/classifyBusinessType.js';
import { PRODUCT_CATALOG_CLASSIFY_SELECT } from '../catalog/productCatalogPrismaSelect.js';

const SERVICE_BUSINESS_TYPES = new Set([
  'service_fixed_booking',
  'service_quote_required',
  'hybrid',
]);

/**
 * @param {object | null | undefined} store
 */
function parseStorefrontSettings(store) {
  let settings = store?.storefrontSettings;
  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = null;
    }
  }
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
}

/**
 * @param {object[]} items
 */
export function inferServiceSignalsFromItems(items = []) {
  let hasBookableServices = false;
  let hasQuoteServices = false;
  let hasServices = false;
  let hasProducts = false;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const sc =
      item.serviceCatalog && typeof item.serviceCatalog === 'object' ? item.serviceCatalog : {};
    const serviceMode = sc.serviceMode ?? item.serviceMode;
    const executionAction = String(
      sc.executionAction ?? item.executionAction ?? item.primaryAction ?? '',
    ).toLowerCase();
    const itemType = String(item.itemType ?? item.type ?? item.kind ?? '').toLowerCase();

    if (itemType === 'product') hasProducts = true;
    if (item.isGallery === true) hasServices = true;

    if (
      serviceMode === 'fixed_booking' ||
      executionAction === 'book' ||
      item.bookingEnabled === true
    ) {
      hasBookableServices = true;
      hasServices = true;
    }
    if (
      serviceMode === 'quote_required' ||
      executionAction === 'request_quote' ||
      executionAction === 'enquire' ||
      executionAction === 'inquiry'
    ) {
      hasQuoteServices = true;
      hasServices = true;
    }
    if (itemType === 'service' || itemType === 'services' || itemType === 'menu_item') {
      if (serviceMode || executionAction) hasServices = true;
      else if (itemType === 'service' || itemType === 'services') hasServices = true;
    }
  }

  return { hasBookableServices, hasQuoteServices, hasServices, hasProducts };
}

/**
 * @param {string} businessType
 * @param {{ hasServices?: boolean, hasProducts?: boolean }} signals
 */
function marketplaceBucketFromType(businessType, signals = {}) {
  if (businessType === 'food_menu') return 'food';
  if (businessType === 'product_retail') return 'products';
  if (SERVICE_BUSINESS_TYPES.has(businessType)) return 'services';
  if (signals.hasServices && !signals.hasProducts) return 'services';
  if (signals.hasProducts && !signals.hasServices) return 'products';
  return 'other';
}

/**
 * @param {object} resolved
 */
export function includedInServicesMarketplace(resolved) {
  return (
    resolved.commerceType === 'service' ||
    resolved.commerceType === 'hybrid' ||
    SERVICE_BUSINESS_TYPES.has(resolved.businessType) ||
    resolved.hasServices === true ||
    resolved.catalogMode === 'services' ||
    resolved.catalogMode === 'catalog'
  );
}

/**
 * @param {object} store
 * @param {object[]} [items]
 */
export function resolveStoreCommercePresentation(store, items = []) {
  const settings = parseStorefrontSettings(store);
  const storeItems = Array.isArray(items) && items.length > 0 ? items : store?.products ?? [];
  const itemSignals = inferServiceSignalsFromItems(storeItems);

  const profile =
    extractBusinessProfile(settings) ??
    store?.businessProfile ??
    store?.resolvedBusinessProfile ??
    null;

  let businessType = null;
  let commerceType = null;
  let catalogMode = null;
  let confidence = 0.5;
  let reasoning = 'fallback';
  let source = 'fallback';
  const businessProfilePresent = Boolean(profile?.businessType && profile?.version);

  if (businessProfilePresent) {
    businessType = profile.businessType;
    commerceType = profile.commerceType;
    catalogMode = profile.catalogMode;
    confidence = profile.metadata?.confidence ?? 0.95;
    reasoning = profile.metadata?.reasoning ?? 'businessProfile';
    source = 'businessProfile';
  } else {
    const metaType = settings.businessType ?? store?.businessType ?? null;
    const metaCatalogMode = settings.catalogMode ?? store?.catalogMode ?? null;

    if (metaType && BUSINESS_TYPES.includes(metaType)) {
      businessType = metaType;
      commerceType = resolveCommerceType(metaType);
      catalogMode = metaCatalogMode ?? resolveCatalogMode(metaType);
      confidence = 0.85;
      reasoning = 'storefront_metadata';
      source = 'metadata';
    } else if (
      itemSignals.hasQuoteServices ||
      itemSignals.hasBookableServices ||
      (itemSignals.hasServices && !itemSignals.hasProducts)
    ) {
      if (itemSignals.hasQuoteServices && !itemSignals.hasBookableServices) {
        businessType = 'service_quote_required';
      } else if (itemSignals.hasBookableServices && !itemSignals.hasQuoteServices) {
        businessType = 'service_fixed_booking';
      } else if (itemSignals.hasProducts && itemSignals.hasServices) {
        businessType = 'hybrid';
      } else {
        businessType = 'service_quote_required';
      }
      commerceType = resolveCommerceType(businessType);
      catalogMode = metaCatalogMode ?? resolveCatalogMode(businessType);
      confidence = 0.8;
      reasoning = 'service_catalog_items';
      source = 'items';
    } else {
      const classified = classifyBusinessType({
        businessName: store?.name ?? store?.storeName,
        storeName: store?.name ?? store?.storeName,
        category: store?.category ?? store?.businessCategory ?? store?.type,
        businessType: store?.type ?? store?.storeType,
        description: store?.description,
        items: storeItems,
      });
      businessType = classified.businessType;
      commerceType = resolveCommerceType(businessType);
      catalogMode = metaCatalogMode ?? classified.catalogMode ?? resolveCatalogMode(businessType);
      confidence = classified.confidence;
      reasoning = classified.reasoning;
      source = 'classifier';
    }
  }

  if (
    !businessProfilePresent &&
    (itemSignals.hasQuoteServices || itemSignals.hasBookableServices) &&
    businessType === 'product_retail'
  ) {
    businessType = itemSignals.hasQuoteServices
      ? itemSignals.hasBookableServices
        ? 'hybrid'
        : 'service_quote_required'
      : 'service_fixed_booking';
    commerceType = resolveCommerceType(businessType);
    catalogMode = catalogMode ?? resolveCatalogMode(businessType);
    source = 'items_override';
  }

  const corpus = [
    store?.name,
    store?.type,
    store?.category,
    store?.description,
  ]
    .filter(Boolean)
    .join(' ');

  const hasServices =
    itemSignals.hasServices ||
    SERVICE_BUSINESS_TYPES.has(businessType) ||
    commerceType === 'service' ||
    commerceType === 'hybrid';
  const hasQuoteServices =
    itemSignals.hasQuoteServices || businessType === 'service_quote_required';
  const hasBookableServices =
    itemSignals.hasBookableServices || businessType === 'service_fixed_booking';
  const hasProducts = itemSignals.hasProducts || businessType === 'product_retail';

  const presentation = {
    catalogLabel:
      store?.catalogLabel ?? recommendedCatalogLabelForType(businessType, corpus),
    primaryCTA: profile?.presentation?.primaryCTA ?? null,
    marketplaceBucket: marketplaceBucketFromType(businessType, {
      hasServices,
      hasProducts,
    }),
  };

  const resolved = {
    businessType,
    commerceType,
    catalogMode,
    hasServices,
    hasQuoteServices,
    hasBookableServices,
    hasProducts,
    marketplaceBucket: presentation.marketplaceBucket,
    confidence,
    reasoning,
    source,
    businessProfilePresent,
    includedInServices: false,
    includedInFood: businessType === 'food_menu',
    includedInProducts:
      businessType === 'product_retail' ||
      (commerceType === 'product' && !hasServices && businessType !== 'food_menu'),
  };

  resolved.includedInServices = includedInServicesMarketplace(resolved);

  return {
    ...resolved,
    resolvedBusinessProfile: profile,
    resolvedCatalogPresentation: presentation,
  };
}

/**
 * @param {object} store
 * @param {'food' | 'products' | 'services' | 'offers' | 'others'} category
 * @param {object[]} [items]
 */
export function storeMatchesFeedCategory(store, category, items = []) {
  const resolved = resolveStoreCommercePresentation(store, items);
  switch (category) {
    case 'services':
      return resolved.includedInServices && !resolved.includedInFood;
    case 'food':
      return resolved.includedInFood;
    case 'products':
      return resolved.includedInProducts && !resolved.includedInFood;
    default:
      return true;
  }
}

/**
 * Dev-only marketplace resolve logging.
 * @param {object} store
 * @param {object} resolved
 * @param {{ category?: string, included?: boolean }} [ctx]
 */
export function logServicesMarketplaceResolve(store, resolved, ctx = {}) {
  if (process.env.NODE_ENV === 'production') return;
  console.log(
    '[SERVICES_MARKETPLACE_RESOLVE]',
    JSON.stringify({
      storeId: store?.id ?? null,
      storeName: store?.name ?? null,
      businessProfilePresent: resolved.businessProfilePresent,
      resolvedBusinessType: resolved.businessType,
      resolvedCatalogMode: resolved.catalogMode,
      hasServices: resolved.hasServices,
      includedInServices: resolved.includedInServices,
      category: ctx.category ?? null,
      included: ctx.included ?? resolved.includedInServices,
      source: resolved.source,
    }),
  );
}

/**
 * Filter businesses for public feed category using BSL + item fallbacks.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object[]} businesses
 * @param {string | null} category
 */
export async function filterBusinessesForFeedCategory(prisma, businesses, category) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat || !['food', 'products', 'services'].includes(cat)) {
    return businesses;
  }
  if (!Array.isArray(businesses) || businesses.length === 0) return businesses;

  const ids = businesses.map((b) => b.id).filter(Boolean);
  const products = await prisma.product.findMany({
    where: { businessId: { in: ids }, deletedAt: null },
    select: PRODUCT_CATALOG_CLASSIFY_SELECT,
    take: Math.min(ids.length * 50, 500),
  });

  const byStore = new Map();
  for (const product of products) {
    const list = byStore.get(product.businessId) ?? [];
    if (list.length < 50) list.push(product);
    byStore.set(product.businessId, list);
  }

  return businesses.filter((business) => {
    const items = byStore.get(business.id) ?? [];
    const resolved = resolveStoreCommercePresentation(business, items);
    const included = storeMatchesFeedCategory(business, cat, items);
    if (cat === 'services') {
      logServicesMarketplaceResolve(business, resolved, { category: cat, included });
    }
    return included;
  });
}
