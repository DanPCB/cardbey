/**
 * UI-first: signals the client to open the menu/catalog upload modal (no server replace here).
 * Catalog write + image seeding run on POST /api/stores/temp/draft/extract-menu and
 * PATCH /api/stores/temp/draft/catalog (see catalogItemImageSeed.js).
 */

import { uiDelegateBlockedResult } from '../uiDelegateBlockedResult.js';

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
  return uiDelegateBlockedResult({
    action: 'open_menu_upload_ui',
    message: 'Manual catalog upload required. Please upload your menu file.',
    output: {
      generationRunId,
      storeId,
      extractEndpoint: `/api/stores/temp/draft/extract-menu`,
      uploadEndpoint: `/api/stores/temp/draft/catalog`,
    },
  });
}
