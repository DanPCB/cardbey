/**
 * Resolve draft context from intent payload (stub). Real implementation will load draft/store from DB.
 */

export async function resolveDraftContext(payload) {
  return { missionId: undefined, storeId: null, draftId: null };
}
