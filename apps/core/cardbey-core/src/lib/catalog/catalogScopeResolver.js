/**
 * Resolve store / draft scope for catalog planner tools.
 */

/**
 * @param {...unknown} values
 * @returns {string | null}
 */
export function pickString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export function resolveCatalogScope(input = {}, context = {}) {
  const stepOutputs =
    context.stepOutputs && typeof context.stepOutputs === 'object' ? context.stepOutputs : {};
  const validated = stepOutputs.validate_store_context?.output ?? stepOutputs.validate_store_context ?? {};

  const storeId = pickString(
    input.storeId,
    validated.storeId,
    context.storeId,
    context.activeStoreId,
  );
  const draftId = pickString(
    input.draftId,
    validated.draftId,
    context.draftId,
    context.activeDraftId,
    context.generationRunId,
  );
  const userId = pickString(context.userId, input.userId);
  const missionId = pickString(input.missionId, context.missionId, context.activeMissionId);

  return { storeId, draftId, userId, missionId };
}

/**
 * @param {unknown} preview
 * @returns {number}
 */
export function countDraftPreviewItems(preview) {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return 0;
  const row = /** @type {Record<string, unknown>} */ (preview);
  if (Array.isArray(row.items)) return row.items.length;
  const catalog = row.catalog;
  if (catalog && typeof catalog === 'object' && !Array.isArray(catalog)) {
    const products = /** @type {Record<string, unknown>} */ (catalog).products;
    if (Array.isArray(products)) return products.length;
  }
  return 0;
}
