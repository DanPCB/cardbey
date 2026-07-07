/**
 * Prisma Product fields that exist on the current schema for service-catalog enrichment.
 * Do not select kind/itemKind/type — those are derived in enrichPublicCatalogItem.
 */

export const PRODUCT_CATALOG_PRISMA_SELECT = {
  id: true,
  name: true,
  price: true,
  description: true,
  imageUrl: true,
  category: true,
  currency: true,
  itemType: true,
  bookingEnabled: true,
  purchaseEnabled: true,
  primaryAction: true,
  serviceCatalog: true,
};

/** Lightweight select for feed category filtering. */
export const PRODUCT_CATALOG_CLASSIFY_SELECT = {
  businessId: true,
  itemType: true,
  serviceCatalog: true,
  bookingEnabled: true,
  primaryAction: true,
};
