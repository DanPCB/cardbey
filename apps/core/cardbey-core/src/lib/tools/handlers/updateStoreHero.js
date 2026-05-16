import { resolvePostBuildUiContext } from '../resolveStoreIdFromContext.js';

/**
 * @param {{ blackboardContext?: Record<string, unknown> | null, storeContext?: Record<string, unknown> | null, missionId?: string | null }} ctx
 */
export async function handleUpdateStoreHero(ctx) {
  const { storeId, generationRunId, draftId } = await resolvePostBuildUiContext(ctx);
  if (!storeId) {
    return {
      action: 'message',
      message: "I couldn't find the store to update. Which store's hero image would you like to change?",
    };
  }
  return {
    action: 'open_ui',
    ui: 'hero_customizer',
    storeId,
    generationRunId,
    draftId,
    message: "Let's update your hero image. You can upload your own or pick from our library.",
  };
}
