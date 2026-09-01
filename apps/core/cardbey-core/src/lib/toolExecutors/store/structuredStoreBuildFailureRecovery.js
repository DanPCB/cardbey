/**
 * Persist structured_store_build failure state so missions and drafts recover cleanly.
 */
import { mergeCanonicalOutputs } from '../../orchestrator/pipelineCanonicalResults.js';
import { safeMissionPipelineUpdate } from '../../safePipelineUpdate.js';
import { transitionDraftStoreStatus } from '../../../kernel/transitions/transitionService.js';
import { DraftErrorCode, RecommendedAction } from '../../../services/errors/draftErrorCodes.js';
import { mapErrorToDraftFailure } from '../../../services/errors/mapErrorToDraftFailure.js';

/** Map classifyGenerateDraftFailure codes to DraftErrorCode values. */
export function draftErrorCodeFromFailureClassified(classified) {
  const code = classified?.code != null ? String(classified.code) : '';
  if (code === 'STORE_BUILD_RUNTIME_DEPENDENCY_MISSING') {
    return DraftErrorCode.STORE_BUILD_RUNTIME_DEPENDENCY_MISSING;
  }
  if (code === 'GENERATE_DRAFT_FAILED') {
    return DraftErrorCode.GENERATE_DRAFT_FAILED;
  }
  return DraftErrorCode.INTERNAL_ERROR;
}

/**
 * Ensure draft is not left in generating after generateDraft throws.
 * Idempotent when generateDraft already transitioned to failed.
 */
export async function ensureDraftFailedAfterGenerateError(
  prisma,
  draftId,
  classified,
  generationRunId,
) {
  if (!draftId) return;
  const row = await prisma.draftStore.findUnique({
    where: { id: draftId },
    select: { status: true, errorCode: true },
  }).catch(() => null);
  const status = (row?.status || '').toLowerCase();
  if (status === 'failed' || status === 'ready' || status === 'committed') return;

  const errorCode = draftErrorCodeFromFailureClassified(classified);
  const failure = mapErrorToDraftFailure({
    code: errorCode,
    message: classified?.message ?? classified?.developerMessage ?? '',
  });

  await transitionDraftStoreStatus({
    prisma,
    draftId,
    toStatus: 'failed',
    fromStatus: status === 'generating' ? 'generating' : undefined,
    actorType: 'automation',
    correlationId: generationRunId ?? null,
    reason: 'GENERATE_DRAFT_FAILED',
    extraData: {
      error: failure.errorMessage,
      errorCode: failure.errorCode,
      recommendedAction: failure.recommendedAction ?? RecommendedAction.retry,
    },
  }).catch(() => {});
}

/**
 * Write structured_store_build failure slice to mission.outputsJson for UI restore/debug.
 */
export async function persistStructuredStoreBuildFailureOutputs(
  prisma,
  missionId,
  {
    draftId,
    generationRunId,
    jobId,
    classified,
  },
) {
  if (!missionId) return;
  const errorCode = draftErrorCodeFromFailureClassified(classified);
  const failureSlice = {
    ok: false,
    draftId: draftId ?? null,
    generationRunId: generationRunId ?? null,
    jobId: jobId ?? null,
    failureCode: classified?.code ?? errorCode,
    errorCode,
    error: classified?.message ?? "We couldn't finish preparing your store draft.",
    developerCode: classified?.developerCode ?? null,
  };
  try {
    const pipeRow = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { outputsJson: true },
    });
    const outputsJson = mergeCanonicalOutputs(pipeRow?.outputsJson, {
      ...(draftId ? { draftId } : {}),
      ...(generationRunId ? { generationRunId } : {}),
      ...(jobId ? { jobId } : {}),
      structured_store_build: failureSlice,
    });
    await safeMissionPipelineUpdate(
      prisma,
      {
        where: { id: missionId },
        data: { outputsJson },
      },
      { missionId, label: 'structured_store_build.failure_outputs' },
    );
  } catch (err) {
    console.warn(
      '[structured_store_build] failure outputs persist skipped:',
      err?.message ?? err,
    );
  }
}
