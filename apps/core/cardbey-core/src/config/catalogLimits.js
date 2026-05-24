/**
 * Shared catalog size limits for draft generation, seeds, and API preview caps.
 * Enrich/image pipelines use CATALOG_ENRICH_BATCH / CATALOG_IMAGE_ENRICH_MAX separately.
 */
export const CATALOG_ITEM_LIMIT = 300;
export const CATALOG_ITEM_MIN = 24;
export const CATALOG_ITEM_MAX = 300;
export const CATALOG_CATEGORY_TARGET = 50; // max items per category (prompt guidance)
export const CATALOG_ENRICH_BATCH = 30; // description enrich batch size (unchanged)
export const CATALOG_IMAGE_ENRICH_MAX = 50; // image enrich cap per batch
