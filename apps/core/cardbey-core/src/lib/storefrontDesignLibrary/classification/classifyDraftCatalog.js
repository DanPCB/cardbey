/**
 * Classify suggested / draft catalog rows (preserve contentOrigin: suggested).
 */

import { classifyResearchCatalog, classifyResearchCatalogProducts } from './classifyResearchCatalog.js';

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean }} [opts]
 */
export function classifyDraftCatalog(catalog, context = {}, opts = {}) {
  return classifyResearchCatalog(catalog, { ...context, contentOrigin: context.contentOrigin ?? 'suggested' }, opts);
}

/**
 * @param {unknown[]} items
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean }} [opts]
 */
export function classifyDraftCatalogItems(items, context = {}, opts = {}) {
  return classifyResearchCatalogProducts(items, context, opts);
}
