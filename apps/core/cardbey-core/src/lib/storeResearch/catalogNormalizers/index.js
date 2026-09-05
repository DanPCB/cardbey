/**
 * Phase 5 — Business-type catalog normalizers.
 * Real extracted items stay sourced; gaps may receive labelled suggestions.
 */

/**
 * @param {object[]} items
 * @param {string} businessKind
 */
export function RestaurantMenuNormalizer(items, businessKind) {
  if (businessKind !== 'restaurant' && businessKind !== 'cafe') return items;
  return items.map((item) => ({
    ...item,
    category: item.category || 'Menu',
    contentOrigin: item.contentOrigin ?? 'sourced',
  }));
}

/**
 * @param {object[]} items
 * @param {string} businessKind
 */
export function BakeryCatalogNormalizer(items, businessKind) {
  if (businessKind !== 'bakery') return items;
  return items.map((item) => ({
    ...item,
    category: item.category || 'Bakery',
    contentOrigin: item.contentOrigin ?? 'sourced',
  }));
}

/**
 * @param {object[]} items
 * @param {string} businessKind
 */
export function RetailProductNormalizer(items, businessKind) {
  if (businessKind !== 'retail' && businessKind !== 'products') return items;
  return items.map((item) => ({
    ...item,
    category: item.category || 'Products',
    contentOrigin: item.contentOrigin ?? 'sourced',
  }));
}

/**
 * @param {object[]} items
 * @param {string} businessKind
 */
export function ServiceCatalogNormalizer(items, businessKind) {
  if (!['services', 'trades', 'handyman', 'home_services'].includes(businessKind)) return items;
  return items.map((item) => ({
    ...item,
    category: item.category || 'Services',
    serviceMode: item.serviceMode || (item.price == null ? 'quote_required' : 'fixed_booking'),
    contentOrigin: item.contentOrigin ?? 'sourced',
  }));
}

/**
 * @param {object[]} items
 * @param {string} businessKind
 */
export function BeautyServiceNormalizer(items, businessKind) {
  if (businessKind !== 'beauty' && businessKind !== 'salon') return items;
  return items.map((item) => ({
    ...item,
    category: item.category || 'Services',
    durationMinutes: item.durationMinutes ?? null,
    contentOrigin: item.contentOrigin ?? 'sourced',
  }));
}

/**
 * @param {object[]} items
 * @param {string} businessKind
 */
export function BookingServiceNormalizer(items, businessKind) {
  const kind = String(businessKind ?? '').toLowerCase();
  const isBookableKind =
    kind === 'beauty' ||
    kind === 'salon' ||
    kind === 'spa' ||
    kind === 'service_fixed_booking' ||
    kind === 'services';
  if (!isBookableKind) return items;
  // Never stamp Book on retail / florist / product catalogs.
  if (
    kind === 'product_retail' ||
    kind === 'retail' ||
    kind === 'food_menu' ||
    /\b(florist|flowers?|floral|retail|product)\b/i.test(kind)
  ) {
    return items;
  }
  return items.map((item) => {
    const role = String(item?.contentRole ?? item?.type ?? item?.itemType ?? '').toLowerCase();
    const name = String(item?.name ?? '');
    if (
      role === 'product' ||
      role === 'product_category' ||
      item?.kind === 'product' ||
      /\b(florist|flowers?|bouquet|bloom)\b/i.test(name)
    ) {
      return item;
    }
    return {
      ...item,
      executionAction: item.executionAction || (item.price == null ? 'request_quote' : 'book'),
      contentOrigin: item.contentOrigin ?? 'sourced',
    };
  });
}

const NORMALIZERS = [
  RestaurantMenuNormalizer,
  BakeryCatalogNormalizer,
  RetailProductNormalizer,
  ServiceCatalogNormalizer,
  BeautyServiceNormalizer,
  BookingServiceNormalizer,
];

/**
 * @param {object[]} catalogItems
 * @param {string} businessKind
 * @returns {object[]}
 */
export function normalizeResearchCatalog(catalogItems, businessKind) {
  let out = Array.isArray(catalogItems) ? [...catalogItems] : [];
  for (const fn of NORMALIZERS) {
    out = fn(out, businessKind);
  }
  return out;
}

/**
 * Label industry blueprint filler items as suggested — never sourced.
 * @param {object[]} items
 */
export function markSuggestedCatalogItems(items) {
  return (items ?? []).map((item) => ({
    ...item,
    contentOrigin: 'suggested',
    status: 'suggested',
    sources: [],
    label: item.label ?? 'Suggested starter item',
  }));
}
