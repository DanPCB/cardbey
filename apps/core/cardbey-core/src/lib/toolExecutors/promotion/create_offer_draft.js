/**
 * Read-only offer draft builder — does not publish or activate promotions.
 */
import { executeCreateOfferDraftBuild } from '../../runtime/performerRuntime/offerDraftBuilder.js';

export async function execute(input = {}, context = {}) {
  const missionId = context?.missionId ?? input?.missionId ?? null;
  const storeId =
    input?.storeId ?? context?.storeId ?? context?.outputs?.storeId ?? null;

  const result = await executeCreateOfferDraftBuild({
    missionId,
    storeId,
    draftId: input?.draftId ?? context?.draftId ?? null,
    generationRunId: input?.generationRunId ?? context?.generationRunId ?? null,
    selectedProducts: input?.selectedProducts ?? input?.products ?? null,
    storeName: context?.storeName ?? context?.businessName ?? null,
  });

  if (!result.ok) {
    return {
      status: 'failed',
      error: {
        code: result.code ?? 'create_offer_draft_failed',
        message: result.error ?? 'Could not create offer draft',
      },
    };
  }

  return {
    status: 'ok',
    output: result.output,
  };
}
