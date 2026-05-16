import { resolvePostBuildUiContext } from '../resolveStoreIdFromContext.js';

/**
 * @param {{ blackboardContext?: Record<string, unknown> | null, storeContext?: Record<string, unknown> | null, missionId?: string | null }} ctx
 */
export async function handleUploadStoreAsset(ctx) {
  const { storeId, generationRunId } = await resolvePostBuildUiContext(ctx);
  if (!storeId) {
    return {
      action: 'message',
      message: "I couldn't find the store to upload a logo to. Which store would you like to update?",
    };
  }
  return {
    action: 'open_ui',
    ui: 'logo_upload',
    storeId,
    generationRunId,
    message: 'Ready to upload your logo. Please select a file.',
  };
}
