/**
 * Shared catalog size limits for draft generation, seeds, and API preview caps.
 * Enrich/image pipelines use CATALOG_ENRICH_BATCH / CATALOG_IMAGE_ENRICH_MAX separately.
 *
 * Generation authority:
 * - Evidence-driven catalogs use exact detected item count (no padding).
 * - CATALOG_ITEM_MIN applies only to explicit template/seed fallback generation.
 * - CATALOG_DISPLAY_PAGE_SIZE is UI pagination only — never mutates canonical catalogs.
 * - Import/research/crawl use CATALOG_ITEM_LIMIT as the safety ceiling (not 24).
 */
export const CATALOG_ITEM_LIMIT = 300;
/** @deprecated Use evidence-driven count for authoritative catalogs. Template/seed fallback floor only. */
export const CATALOG_ITEM_MIN = 24;
export const CATALOG_ITEM_MAX = 300;
/** Alias: bounded exhaustive import/crawl/research ceiling (sources exhausted or this cap). */
export const CATALOG_IMPORT_SAFETY_CEILING = CATALOG_ITEM_LIMIT;
export const CATALOG_CATEGORY_TARGET = 50; // max items per category (prompt guidance)
export const CATALOG_ENRICH_BATCH = 30; // description enrich batch size (unchanged)
/** Max missing images to enrich per pass (loop or background job may run multiple passes). */
export const CATALOG_IMAGE_ENRICH_MAX = 50;
/** Concurrent item image fetches within one enrich batch. */
export const CATALOG_IMAGE_FETCH_CONCURRENCY = 5;
/** Website deep-crawl product pages to follow per store. */
export const CATALOG_CRAWL_MAX_PAGES = 12;

/** UI pagination default — display only, not generation authority. */
export const CATALOG_DISPLAY_PAGE_SIZE = 24;

/** Explicit template/seed fallback generation floor (not evidence authority). */
export const CATALOG_SEED_TEMPLATE_MIN = 24;

/** Paginated store product APIs (GET .../products). */
export const API_PRODUCTS_DEFAULT_LIMIT = 50;
export const API_PRODUCTS_MAX_LIMIT = CATALOG_ITEM_LIMIT;

/**
 * Resolve generation target count.
 * @param {{ evidenceAuthoritative?: boolean; evidenceItemCount?: number; targetCount?: number; allowTemplateFallback?: boolean }} opts
 */
export function resolveCatalogGenerationTarget(opts = {}) {
  if (opts.evidenceAuthoritative) {
    const n = Number(opts.evidenceItemCount);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  }
  const requested = Number(opts.targetCount);
  const base = Number.isFinite(requested) && requested > 0 ? requested : CATALOG_DISPLAY_PAGE_SIZE;
  const floor = opts.allowTemplateFallback === false ? 0 : CATALOG_SEED_TEMPLATE_MIN;
  return Math.max(floor, Math.min(CATALOG_ITEM_LIMIT, base));
}
