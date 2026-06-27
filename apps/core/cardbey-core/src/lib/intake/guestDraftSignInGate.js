/**

 * Gate 1 follow-up: guests with a draft store must sign in before post-build store actions.

 */



/** Post–store-build tools that require a signed-in store (not draft-only guest context). */

export const GUEST_POST_DRAFT_STORE_TOOLS = new Set([

  'replace_store_catalog',

  'upload_store_asset',

  'update_store_hero',

  'publish_store',

]);



/**

 * @param {import('express').Request} req

 */

export function isGuestIntakeActor(req) {

  return Boolean(req.isGuest) || !req.user?.id;

}



/**

 * @param {{ draftId?: string | null, runway?: { activeDraftId?: string | null } | null }} ctx

 */

export function hasGuestDraftContext(ctx = {}) {

  const fromDraft = typeof ctx.draftId === 'string' ? ctx.draftId.trim() : '';

  const fromRunway =

    ctx.runway && typeof ctx.runway.activeDraftId === 'string' ? ctx.runway.activeDraftId.trim() : '';

  return Boolean(fromDraft || fromRunway);

}



/**

 * Guest completed store build — draft id, mission id, or guest/temp store id.

 *

 * @param {{

 *   draftId?: string | null;

 *   runway?: { activeDraftId?: string | null; activeStoreId?: string | null; missionId?: string | null } | null;

 *   effectiveStoreId?: string | null;

 *   missionId?: string | null;

 * }} ctx

 */

export function hasGuestStoreBuildContext(ctx = {}) {

  if (hasGuestDraftContext(ctx)) return true;

  const missionId =

    (typeof ctx.missionId === 'string' && ctx.missionId.trim()) ||

    (ctx.runway && typeof ctx.runway.missionId === 'string' && ctx.runway.missionId.trim()) ||

    '';

  if (missionId) return true;

  const storeId =

    (typeof ctx.effectiveStoreId === 'string' && ctx.effectiveStoreId.trim()) ||

    (ctx.runway && typeof ctx.runway.activeStoreId === 'string' && ctx.runway.activeStoreId.trim()) ||

    '';

  return Boolean(storeId);

}



/**

 * @param {{

 *   req: import('express').Request;

 *   effectiveStoreId?: string | null;

 *   draftId?: string | null;

 *   runway?: { activeDraftId?: string | null; activeStoreId?: string | null; missionId?: string | null } | null;

 *   missionId?: string | null;

 *   tool?: string | null;

 * }} args

 */

export function shouldGateGuestPostDraftStoreAction({

  req,

  effectiveStoreId,

  draftId,

  runway,

  missionId,

  tool,

}) {

  if (!isGuestIntakeActor(req)) return false;

  if (!hasGuestStoreBuildContext({ draftId, runway, effectiveStoreId, missionId })) return false;

  const t = String(tool ?? '').trim();

  return GUEST_POST_DRAFT_STORE_TOOLS.has(t);

}



/**

 * Mission pipeline rows created in guest mode often have null createdBy.

 *

 * @param {{ createdBy?: string | null }} pipeline

 * @param {string} userId

 */

export function missionPipelineOwnedByUser(pipeline, userId) {

  if (!pipeline) return false;

  const uid = String(userId ?? '').trim();

  if (!uid) return false;

  const createdBy = String(pipeline.createdBy ?? '').trim();

  if (!createdBy) return uid.startsWith('guest_');

  return createdBy === uid;

}


