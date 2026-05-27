/**
 * Performer runtime — revise_offer_draft (new version only; no publish).
 */
import { executeReviseOfferDraftBuild } from './offerDraftBuilder.js';
import { getRuntimeByMissionId } from './runtimeState.js';
import { markRuntimeOwnedContext } from './runtimeOwnership.js';

/**
 * @param {{
 *   missionId: string;
 *   storeId: string;
 *   previousOfferDraft: object;
 *   revisionNotes: string;
 *   createdFromExecutionId?: string | null;
 *   draftId?: string | null;
 *   generationRunId?: string | null;
 *   selectedProducts?: object[] | null;
 *   userId?: string | null;
 *   tenantId?: string | null;
 * }} params
 */
export async function executeReviseOfferDraftCapability(params) {
  const runtimeCtx = getRuntimeByMissionId(params.missionId);
  const runtimeId = runtimeCtx?.runtimeId ?? `rt-offer-revise:${params.missionId}`;

  markRuntimeOwnedContext(
    {
      missionId: params.missionId,
      storeId: params.storeId,
      source: 'performer_runtime_revise_offer_draft',
      readOnly: true,
      draftOnly: true,
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    },
    runtimeId,
  );

  return executeReviseOfferDraftBuild({
    missionId: params.missionId,
    storeId: params.storeId,
    previousOfferDraft: params.previousOfferDraft,
    revisionNotes: params.revisionNotes,
    createdFromExecutionId: params.createdFromExecutionId ?? null,
    draftId: params.draftId ?? null,
    generationRunId: params.generationRunId ?? null,
    selectedProducts: params.selectedProducts ?? null,
  });
}
