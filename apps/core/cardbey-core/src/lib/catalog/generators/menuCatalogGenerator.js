/**
 * Menu catalog generator — food/menu typed items.
 */

/**
 * @param {{ categories?: object[], products?: object[], items?: object[], meta?: object }} legacyResult
 * @param {import('../../commerce/commerceProfileTypes.js').BusinessCommerceProfile} profile
 */
export function generateMenuCatalog(legacyResult, profile) {
  const raw = legacyResult?.products ?? legacyResult?.items ?? [];
  const catalogItems = raw.map((item, i) => ({
    ...item,
    id: item.id ?? `menu_${i}`,
    itemKind: 'menu_item',
    itemType: 'menu_item',
    type: 'menu_item',
    kind: 'menu_item',
    purchaseEnabled: true,
    bookingEnabled: false,
    priceMode: typeof item.price === 'number' ? 'fixed' : 'fixed',
    currencyCode: item.currencyCode ?? profile.currencyCode ?? 'AUD',
  }));

  return {
    catalogKind: 'menu_item',
    catalogItems,
    categories: legacyResult?.categories ?? [],
    meta: {
      ...(legacyResult?.meta ?? {}),
      catalogKind: 'menu_item',
      businessCommerceProfile: profile,
    },
  };
}
