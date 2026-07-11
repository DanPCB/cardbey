/**
 * Product catalog generator — wraps legacy product-shaped build output.
 */

/**
 * @param {{ categories?: object[], products?: object[], items?: object[], meta?: object }} legacyResult
 * @param {import('../../commerce/commerceProfileTypes.js').BusinessCommerceProfile} profile
 */
export function generateProductCatalog(legacyResult, profile) {
  const raw = legacyResult?.products ?? legacyResult?.items ?? [];
  const catalogItems = raw.map((item, i) => ({
    ...item,
    id: item.id ?? `prod_${i}`,
    itemKind: 'product',
    itemType: 'product',
    type: 'product',
    kind: 'product',
    purchaseEnabled: item.purchaseEnabled !== false,
    bookingEnabled: false,
    priceMode: 'fixed',
    currencyCode: item.currencyCode ?? profile.currencyCode ?? 'AUD',
    currency: item.currency ?? item.currencyCode ?? profile.currencyCode ?? 'AUD',
  }));

  return {
    catalogKind: 'product',
    catalogItems,
    categories: legacyResult?.categories ?? [],
    meta: {
      ...(legacyResult?.meta ?? {}),
      catalogKind: 'product',
      businessCommerceProfile: profile,
    },
  };
}
