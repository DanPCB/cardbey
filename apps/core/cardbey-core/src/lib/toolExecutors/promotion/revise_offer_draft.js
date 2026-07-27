/**
 * Read-only offer draft revision — new version only; does not publish.
 */
import { executeReviseOfferDraftBuild } from '../../runtime/performerRuntime/offerDraftBuilder.js';

export async function execute(input = {}, context = {}) {
  const missionId = context?.missionId ?? input?.missionId ?? null;
  const storeId = input?.storeId ?? context?.storeId ?? context?.outputs?.storeId ?? null;
  const revisionNotes = String(input?.revisionNotes ?? '').trim();

  const result = await executeReviseOfferDraftBuild({
    missionId,
    storeId,
    previousOfferDraft: input?.previousOfferDraft,
    revisionNotes,
    createdFromExecutionId: input?.createdFromExecutionId ?? null,
    draftId: input?.draftId ?? context?.draftId ?? null,
    generationRunId: input?.generationRunId ?? context?.generationRunId ?? null,
    selectedProducts: input?.selectedProducts ?? input?.products ?? null,
    storeName: context?.storeName ?? context?.businessName ?? null,
  });

  if (!result.ok) {
    return {
      status: 'failed',
      error: {
        code: result.code ?? 'revise_offer_draft_failed',
        message: result.error ?? 'Could not revise offer draft',
      },
    };
  }

  return {
    status: 'ok',
    output: result.output,
  };
}
