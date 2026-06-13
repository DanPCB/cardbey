/**
 * Catalog item commerce classification — service/booking vs product/order.
 * Single source of truth for itemType, booking flags, and storefront CTAs.
 */

import { isServiceVertical, resolveCommerceMode } from '../storeTransactionMode.js';

export const CATALOG_ITEM_TYPES = ['service', 'product', 'ticket', 'event', 'venue', 'package'];
export const PRIMARY_ACTIONS = ['book', 'add_to_cart', 'enquire'];

const BOOKING_ITEM_TYPES = new Set(['service', 'ticket', 'event', 'venue', 'package']);

const RESTAURANT_RE = /\b(restaurant|cafe|coffee|bakery|baker|food|dining|kitchen|bar|bistro|eatery|pizza)\b/i;
const RETAIL_RE = /\b(retail|supplier|shop|store|product|merchandise|boutique|florist|market|gallery|wholesale)\b/i;
const TRAVEL_PACKAGE_RE = /\b(travel|tour|golf|tourism|package|excursion|safari|cruise)\b/i;
const GENERIC_TYPE_RE = /^(general|other|misc|default)$/i;
/** Types that may be retail or service — do not infer service from type alone. */
const AMBIGUOUS_RETAIL_TYPES = ['sports', 'studio', 'shop', 'store', 'supplier', 'bar'];

/**
 * @param {string | null | undefined} businessType
 */
export function isRestaurantBusiness(businessType) {
  return RESTAURANT_RE.test(String(businessType || '').toLowerCase());
}

/**
 * @param {string | null | undefined} businessType
 */
export function isRetailBusiness(businessType) {
  return RETAIL_RE.test(String(businessType || '').toLowerCase());
}

/**
 * Service/booking context from business type and optional store name (handles stale "General" type).
 * @param {{ type?: string | null, name?: string | null, storeName?: string | null }} ctx
 */
function isServiceBusinessContextFromName(ctx = {}) {
  const combined = `${ctx.type ?? ''} ${ctx.name ?? ''} ${ctx.storeName ?? ''}`.toLowerCase();
  if (TRAVEL_PACKAGE_RE.test(combined)) return true;
  if (/\b(booking|beauty|salon|spa|repair|event|venue|ticket|function\s+room|table)\b/i.test(combined)) {
    return true;
  }
  return false;
}

export function isServiceBusinessContext(ctx = {}) {
  const type = String(ctx.type ?? '').trim();
  const typeLower = type.toLowerCase();
  if (type && !GENERIC_TYPE_RE.test(type) && isRestaurantBusiness(type)) return true;
  if (isServiceVertical(type)) {
    const ambiguous = AMBIGUOUS_RETAIL_TYPES.some((a) => typeLower.includes(a));
    if (!ambiguous) return true;
  }
  return isServiceBusinessContextFromName(ctx);
}

/**
 * @param {string | null | undefined} businessType
 * @param {'booking' | 'order' | 'inquiry'} [commerceMode]
 */
export function inferDefaultItemType(businessType, commerceMode) {
  if (isRetailBusiness(businessType)) return 'product';
  if (isRestaurantBusiness(businessType)) return 'service';
  if (isServiceVertical(businessType) || commerceMode === 'booking' || commerceMode === 'inquiry') {
    return 'service';
  }
  if (TRAVEL_PACKAGE_RE.test(String(businessType || '').toLowerCase())) return 'package';
  return 'product';
}

/**
 * @param {string | null | undefined} businessType
 * @param {'booking' | 'order' | 'inquiry'} [commerceMode]
 * @param {string | null | undefined} [businessName]
 */
export function inferCatalogSectionLabel(businessType, commerceMode, businessName) {
  const combined = `${businessType ?? ''} ${businessName ?? ''}`.toLowerCase();
  if (RESTAURANT_RE.test(combined)) return 'Menu';
  if (TRAVEL_PACKAGE_RE.test(combined)) return 'Packages';
  if (commerceMode === 'inquiry') return 'Bookings';
  if (isServiceVertical(businessType) || commerceMode === 'booking') return 'Services';
  if (isServiceBusinessContext({ type: businessType, name: businessName })) return 'Packages';
  return 'Products';
}

/**
 * @param {string | null | undefined} raw
 */
function normalizeItemType(raw) {
  const k = String(raw ?? '').toLowerCase().trim();
  if (k === 'service' || k === 'services') return 'service';
  if (k === 'product' || k === 'products') return 'product';
  if (CATALOG_ITEM_TYPES.includes(k)) return k;
  return null;
}

/**
 * @param {object | null | undefined} item
 * @param {{ businessType?: string | null, businessName?: string | null, storeName?: string | null, commerceMode?: string | null }} ctx
 */
export function normalizeCatalogItem(item, ctx = {}) {
  const businessType = ctx.businessType ?? null;
  const commerceMode = resolveCommerceMode(businessType, { commerceMode: ctx.commerceMode });
  const serviceBusiness = isServiceBusinessContext({
    type: businessType,
    name: ctx.businessName,
    storeName: ctx.storeName,
  });

  const fromItem =
    normalizeItemType(item?.itemType) ??
    normalizeItemType(item?.kind) ??
    normalizeItemType(item?.itemKind);

  let itemType = fromItem ?? inferDefaultItemType(businessType, commerceMode);
  if (serviceBusiness && !fromItem) {
    itemType = TRAVEL_PACKAGE_RE.test(`${businessType ?? ''} ${ctx.businessName ?? ''}`.toLowerCase())
      ? 'package'
      : 'service';
  }

  let bookingEnabled = item?.bookingEnabled;
  let purchaseEnabled = item?.purchaseEnabled;
  let primaryAction = null;
  if (item?.primaryAction != null) {
    const pa = String(item.primaryAction).toLowerCase().trim();
    if (PRIMARY_ACTIONS.includes(pa)) primaryAction = pa;
  }

  if (typeof bookingEnabled !== 'boolean') {
    bookingEnabled =
      BOOKING_ITEM_TYPES.has(itemType) &&
      (serviceBusiness || commerceMode === 'booking' || commerceMode === 'inquiry');
    if (isRestaurantBusiness(businessType)) {
      bookingEnabled = item?.bookingEnabled === true;
    }
  }

  if (typeof purchaseEnabled !== 'boolean') {
    if (itemType === 'product' || isRetailBusiness(businessType)) {
      purchaseEnabled = true;
    } else if (isRestaurantBusiness(businessType)) {
      purchaseEnabled = true;
    } else {
      purchaseEnabled = false;
    }
  }

  if (!primaryAction || !PRIMARY_ACTIONS.includes(primaryAction)) {
    if (bookingEnabled && !purchaseEnabled) primaryAction = 'book';
    else if (purchaseEnabled && !bookingEnabled) primaryAction = 'add_to_cart';
    else if (bookingEnabled && purchaseEnabled) {
      primaryAction = isRestaurantBusiness(businessType) ? 'add_to_cart' : 'book';
    } else {
      primaryAction = 'enquire';
    }
  }

  return {
    itemType,
    bookingEnabled,
    purchaseEnabled,
    primaryAction,
    kind: itemType === 'product' ? 'product' : 'service',
  };
}

/**
 * @param {ReturnType<typeof normalizeCatalogItem>} normalized
 */
export function resolveItemActionVisibility(normalized) {
  const showBook = normalized.bookingEnabled === true || normalized.primaryAction === 'book';
  const showCart =
    normalized.purchaseEnabled === true &&
    (normalized.primaryAction === 'add_to_cart' ||
      (normalized.bookingEnabled && normalized.primaryAction !== 'enquire'));
  const showEnquire =
    normalized.primaryAction === 'enquire' || (!showBook && !showCart);
  return { showBook, showCart, showEnquire };
}

/**
 * Map normalized item to legacy commerce mode for existing callers.
 * @param {object | null | undefined} item
 * @param {'booking' | 'order' | 'inquiry'} storeCommerceMode
 * @param {{ businessType?: string | null, businessName?: string | null }} [ctx]
 */
/**
 * Attach classification fields to a public catalog DTO (runtime backfill when DB columns empty).
 * @param {object} product
 * @param {{ businessType?: string | null, businessName?: string | null, commerceMode?: string | null }} ctx
 */
export function enrichPublicCatalogItem(product, ctx = {}) {
  const normalized = normalizeCatalogItem(product, ctx);
  return {
    ...product,
    itemType: product?.itemType ?? normalized.itemType,
    bookingEnabled: product?.bookingEnabled ?? normalized.bookingEnabled,
    purchaseEnabled: product?.purchaseEnabled ?? normalized.purchaseEnabled,
    primaryAction: product?.primaryAction ?? normalized.primaryAction,
    kind: product?.kind ?? product?.itemKind ?? normalized.kind,
    itemKind: product?.itemKind ?? normalized.kind,
  };
}

export function resolveItemCommerceModeFromClassification(item, storeCommerceMode, ctx = {}) {
  const normalized = normalizeCatalogItem(item, {
    ...ctx,
    commerceMode: storeCommerceMode,
  });
  if (normalized.primaryAction === 'book' || (normalized.bookingEnabled && !normalized.purchaseEnabled)) {
    return storeCommerceMode === 'inquiry' ? 'inquiry' : 'booking';
  }
  if (normalized.primaryAction === 'add_to_cart' && normalized.purchaseEnabled) return 'order';
  if (normalized.primaryAction === 'enquire') return 'inquiry';
  return normalized.itemType === 'product' ? 'order' : 'booking';
}
