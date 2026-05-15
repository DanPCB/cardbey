import { resolvePostBuildUiContext } from '../resolveStoreIdFromContext.js';

/**
 * @param {{ blackboardContext?: Record<string, unknown> | null, storeContext?: Record<string, unknown> | null, missionId?: string | null }} ctx
 */
export async function handleReplaceStoreCatalog(ctx) {
  const { storeId, generationRunId, draftId } = await resolvePostBuildUiContext(ctx);
  if (!storeId) {
    return {
      action: 'message',
      message: "I couldn't find the store to update. Which store would you like to add products to?",
    };
  }
  return {
    action: 'open_ui',
    ui: 'product_import',
    storeId,
    generationRunId,
    draftId,
    message: "Let's add your real menu items. I'll guide you through replacing the placeholder products.",
  };
}
