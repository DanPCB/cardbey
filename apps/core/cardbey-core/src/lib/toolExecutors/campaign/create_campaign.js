/**
 * create_campaign — structured launch_campaign checkpoint pipeline via Runtime Kernel.
 */
import { getPrismaClient } from '../../prisma.js';
import { EXECUTION_STATES } from '../../telemetry/executionStates.js';
import { ensureStructuredCampaignCheckpointSteps } from '../../campaignMission/ensureStructuredCampaignCheckpointSteps.js';
import { executeCampaignMissionPipelineRun } from '../../campaignMission/executeCampaignMissionPipelineRun.js';

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
  const storeId = pickString(context?.storeId, input?.storeId);

  if (!missionId) {
    return {
      status: 'blocked',
      blocker: {
        code: 'MISSION_REQUIRED',
        message: 'Campaign creation requires an active mission context',
      },
      output: {
        executionState: EXECUTION_STATES.BLOCKED,
        intentLabel: 'create_campaign',
      },
    };
  }

  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { id: true, type: true, targetId: true },
  });

  if (!mission) {
    return {
      status: 'failed',
      error: { code: 'MISSION_NOT_FOUND', message: 'Mission pipeline not found' },
    };
  }

  const missionType = String(mission.type || '').trim().toLowerCase();
  if (missionType !== 'launch_campaign') {
    await prisma.missionPipeline.update({
      where: { id: missionId },
      data: {
        type: 'launch_campaign',
        targetType: storeId || mission.targetId ? 'store' : 'generic',
        ...(storeId ? { targetId: storeId } : {}),
      },
    });
  }

  const locale = pickString(input?.locale, context?.locale) || 'en';
  await ensureStructuredCampaignCheckpointSteps(prisma, missionId, {
    logPrefix: '[create_campaign]',
    locale,
  });

  const campaignContext = pickString(
    input?.campaignContext,
    input?.hint,
    input?.goal,
    input?.userMessage,
    input?.rawUserText,
  );
  const userLike = userId ? { id: userId, tenantId: tenantId || userId } : { id: tenantId || 'temp' };

  const runResult = await executeCampaignMissionPipelineRun({
    prisma,
    user: userLike,
    missionId,
    body: {
      storeId: storeId || mission.targetId || undefined,
      campaignContext,
      hint: pickString(input?.hint, campaignContext),
      locale,
      sourceTool: pickString(input?._sourceTool, input?.sourceTool),
    },
    auditSource: 'proactive_runway_create_campaign',
  });

  if (!runResult?.ok) {
    return {
      status: 'failed',
      error: {
        code: runResult?.error || 'CREATE_CAMPAIGN_FAILED',
        message: runResult?.message || 'Campaign creation failed',
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
      intentLabel: 'create_campaign',
      missionId: runResult.missionId ?? missionId,
      campaignId: runResult.campaignId ?? null,
      promotionId: runResult.promotionId ?? null,
      mode: runResult.mode,
      status: runResult.status,
      dispatchedVia: 'runtime_kernel',
    },
  };
}

export default { execute };
