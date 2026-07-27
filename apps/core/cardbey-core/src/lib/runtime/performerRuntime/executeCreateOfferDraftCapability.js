/**
 * Performer runtime — create_offer_draft (artifact only; no publish).
 */
import { executeCreateOfferDraftBuild } from './offerDraftBuilder.js';
import { getRuntimeByMissionId } from './runtimeState.js';
import { markRuntimeOwnedContext } from './runtimeOwnership.js';

/**
 * @param {{
 *   missionId: string;
 *   storeId: string;
 *   draftId?: string | null;
 *   generationRunId?: string | null;
 *   selectedProducts?: object[] | null;
 *   userId?: string | null;
 *   tenantId?: string | null;
 * }} params
 */
export async function executeCreateOfferDraftCapability(params) {
  const runtimeCtx = getRuntimeByMissionId(params.missionId);
  const runtimeId = runtimeCtx?.runtimeId ?? `rt-offer-draft:${params.missionId}`;

  markRuntimeOwnedContext(
    {
      missionId: params.missionId,
      storeId: params.storeId,
      source: 'performer_runtime_create_offer_draft',
      readOnly: true,
      draftOnly: true,
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    },
    runtimeId,
  );

  return executeCreateOfferDraftBuild({
    missionId: params.missionId,
    storeId: params.storeId,
    draftId: params.draftId ?? null,
    generationRunId: params.generationRunId ?? null,
    selectedProducts: params.selectedProducts ?? null,
  });
}
