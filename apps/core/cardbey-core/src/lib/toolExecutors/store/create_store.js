/**
 * create_store — proactive runway store creation via canonical checkpoint pipeline.
 */
import { getPrismaClient } from '../../prisma.js';
import { EXECUTION_STATES } from '../../telemetry/executionStates.js';
import { normalizeBuildStoreInput } from '../../storeMission/buildStoreInputV1.js';
import { ensureStructuredStoreCheckpointSteps } from '../../storeMission/ensureStructuredStoreCheckpointSteps.js';
import { executeStoreMissionPipelineRun } from '../../storeMission/executeStoreMissionPipelineRun.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const missionId = pickString(context?.missionId, input?.missionId);
  const userId = pickString(context?.userId, input?.userId, context?.createdBy);
  const tenantId = pickString(context?.tenantId, input?.tenantId, userId);

  if (!missionId) {
    return {
      status: 'blocked',
      blocker: {
        code: 'MISSION_REQUIRED',
        message: 'Store creation requires an active mission context',
      },
      output: {
        executionState: EXECUTION_STATES.BLOCKED,
        intentLabel: 'create_store',
      },
    };
  }

  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { id: true, type: true },
  });

  if (!mission) {
    return {
      status: 'failed',
      error: { code: 'MISSION_NOT_FOUND', message: 'Mission pipeline not found' },
    };
  }

  const missionType = String(mission.type || '').trim().toLowerCase();
  if (missionType === 'create_store') {
    await prisma.missionPipeline.update({
      where: { id: missionId },
      data: { type: 'store', targetType: 'store' },
    });
  }

  await ensureStructuredStoreCheckpointSteps(prisma, missionId, {
    logPrefix: '[create_store]',
  });

  const intentModeRaw = pickString(input?.intentMode, input?.mode === 'mini_website' ? 'website' : '');
  const normalized = normalizeBuildStoreInput(
    {
      ...input,
      businessName: pickString(input?.businessName, input?.storeName, input?.name),
      businessType: pickString(input?.businessType, input?.storeType),
      location: pickString(input?.location),
      intentMode: intentModeRaw === 'website' ? 'website' : 'store',
      rawUserText: pickString(input?.rawUserText, input?.prompt, input?.goal, input?.userMessage),
      missionId,
      userId,
      tenantId,
    },
    { sourceType: 'operator' },
  );

  const userLike = userId ? { id: userId, tenantId: tenantId || userId } : { id: tenantId || 'temp' };

  const runResult = await executeStoreMissionPipelineRun({
    prisma,
    user: userLike,
    missionId,
    body: normalized,
    auditSource: 'proactive_runway_create_store',
  });

  if (!runResult?.ok) {
    return {
      status: 'failed',
      error: {
        code: runResult?.error || 'CREATE_STORE_FAILED',
        message: runResult?.message || 'Store creation failed',
      },
      output: {
        executionState: EXECUTION_STATES.FAILED,
        missionId,
      },
    };
  }

  return {
    status: 'ok',
    output: {
      executionState: EXECUTION_STATES.EXECUTED,
      intentLabel: 'create_store',
      intentMode: normalized.intentMode,
      missionId: runResult.missionId ?? missionId,
      jobId: runResult.jobId,
      generationRunId: runResult.generationRunId,
      draftId: runResult.draftId,
      mode: runResult.mode,
      status: runResult.status,
      dispatchedVia: 'proactive_runway',
    },
  };
}

export default { execute };
