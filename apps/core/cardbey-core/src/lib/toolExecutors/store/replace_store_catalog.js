/**
 * UI-first: signals the client to open the menu/catalog upload modal (no server replace here).
 * Catalog write + image seeding run on POST /api/stores/temp/draft/extract-menu and
 * PATCH /api/stores/temp/draft/catalog (see catalogItemImageSeed.js).
 */

/**
 * @param {object} [input]
 * @param {string} [input.generationRunId]
 * @param {string} [input.storeId]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const generationRunId =
    input?.generationRunId ??
    context?.stepOutputs?.structured_store_build?.generationRunId ??
    null;
  const storeId = input?.storeId ?? context?.storeId ?? null;
  return {
    status: 'ok',
    output: {
      action: 'open_menu_upload_ui',
      generationRunId,
      storeId,
      message: 'Ready to replace your catalog. Please upload your menu file.',
      extractEndpoint: `/api/stores/temp/draft/extract-menu`,
      uploadEndpoint: `/api/stores/temp/draft/catalog`,
    },
  };
}
