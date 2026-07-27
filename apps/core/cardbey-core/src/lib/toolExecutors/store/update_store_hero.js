/**
 * UI-first: signals the client to open the hero image update UX (no server-side hero apply here).
 */

import { uiDelegateBlockedResult } from '../uiDelegateBlockedResult.js';

/**
 * @param {object} [input]
 * @param {string} [input.generationRunId]
 * @param {string} [input.storeId]
 * @param {string} [input.imageQuery]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const generationRunId =
    input?.generationRunId ??
    context?.stepOutputs?.structured_store_build?.generationRunId ??
    null;
  const storeId = input?.storeId ?? context?.storeId ?? null;
  const imageQuery = input?.imageQuery ?? null;
  return uiDelegateBlockedResult({
    action: 'open_hero_ui',
    message: 'Hero image update requires your input in the UI.',
    output: {
      generationRunId,
      storeId,
      imageQuery,
    },
  });
}
