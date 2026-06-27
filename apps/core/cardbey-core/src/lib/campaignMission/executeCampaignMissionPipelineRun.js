/**
 * Shared implementation for campaign checkpoint pipeline runs (launch_campaign missions).
 */

import { getPrismaClient } from '../prisma.js';
import { approveMissionPipeline } from '../missionPipelineService.js';
import { canTransitionMissionPipeline } from '../missionPipelineTransitions.js';
import { resolveAccessibleMission } from '../missionAccess.js';
import { isMissionPipelineCancelledRow } from '../runtime/missionCancellationGuard.js';
import { evaluateStructuredCheckpointRunResult } from '../storeMission/executeStoreMissionPipelineRun.js';

async function ensureCampaignMissionReadyForRun(prisma, missionId, currentStatus) {
  let status = currentStatus;
  const load = async () =>
    prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { status: true, requiresConfirmation: true },
    });

  let row = await load();
  if (!row) return { ok: false, error: 'not_found' };
  status = row.status;

  if (status === 'queued' || status === 'executing') {
    return { ok: true, status };
  }

  if (status === 'requested' && canTransitionMissionPipeline('requested', 'planned')) {
    await prisma.missionPipeline.update({ where: { id: missionId }, data: { status: 'planned' } });
    row = await load();
    if (!row) return { ok: false, error: 'not_found' };
    status = row.status;
  }

  if (status === 'planned') {
    const next = row.requiresConfirmation ? 'awaiting_confirmation' : 'queued';
    if (canTransitionMissionPipeline('planned', next)) {
      await prisma.missionPipeline.update({ where: { id: missionId }, data: { status: next } });
      row = await load();
      if (!row) return { ok: false, error: 'not_found' };
      status = row.status;
    }
  }

  if (status === 'queued') return { ok: true, status: 'queued' };
  if (status === 'awaiting_confirmation') return approveMissionPipeline(missionId);

  return { ok: false, error: 'invalid_state', status };
}

/**
 * @param {object} opts
 * @param {import('../prisma.js').PrismaClient} [opts.prisma]
 * @param {object} opts.user
 * @param {string} opts.missionId
 * @param {Record<string, unknown>} [opts.body]
 * @param {string} [opts.auditSource]
 */
export async function executeCampaignMissionPipelineRun(opts = {}) {
  const prisma = opts.prisma ?? getPrismaClient();
  const missionId = String(opts.missionId ?? '').trim();
  const user = opts.user && typeof opts.user === 'object' ? opts.user : { id: 'temp' };

  if (!missionId) {
    return {
      ok: false,
      statusCode: 400,
      error: 'MISSION_REQUIRED',
      message: 'Campaign pipeline requires missionId',
    };
  }

  const access = await resolveAccessibleMission(user, missionId);
  if (!access.ok || access.kind !== 'mission_pipeline') {
    return {
      ok: false,
      statusCode: 404,
      error: 'not_found',
      message: 'Mission pipeline not found or access denied',
    };
  }

  const mission = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { id: true, type: true, status: true, runState: true, outputsJson: true, metadataJson: true },
  });
  if (!mission) {
    return {
      ok: false,
      statusCode: 404,
      error: 'not_found',
      message: 'Mission pipeline not found',
    };
  }

  if (isMissionPipelineCancelledRow(mission)) {
    return {
      ok: false,
      statusCode: 409,
      error: 'mission_cancelled',
      message: 'Mission was cancelled',
    };
  }

  const missionType = String(mission.type ?? '').trim().toLowerCase();
  if (missionType !== 'launch_campaign') {
    return {
      ok: false,
      statusCode: 400,
      error: 'unsupported_mission_type',
      message: `Campaign pipeline only supports type:launch_campaign. Got: ${mission.type}`,
    };
  }

  if (mission.status === 'awaiting_input') {
    const checkpointCount = await prisma.missionPipelineStep.count({
      where: { missionId, stepKind: 'checkpoint' },
    });
    if (checkpointCount > 0) {
      const out =
        mission.outputsJson && typeof mission.outputsJson === 'object' ? mission.outputsJson : {};
      return {
        ok: true,
        missionId,
        campaignId: typeof out.campaignId === 'string' ? out.campaignId : '',
        promotionId: typeof out.promotionId === 'string' ? out.promotionId : '',
        status: 'awaiting_input',
        mode: 'checkpoint_pipeline',
        orchestration: { stepsRun: 0, stoppedReason: 'awaiting_checkpoint' },
      };
    }
  }

  const RUNNABLE_STATUSES = ['awaiting_confirmation', 'queued', 'requested', 'executing'];
  if (!RUNNABLE_STATUSES.includes(mission.status)) {
    return {
      ok: false,
      statusCode: 409,
      error: 'invalid_status',
      message: `Mission is ${mission.status}, expected one of: ${RUNNABLE_STATUSES.join(', ')}`,
    };
  }

  const prep = await ensureCampaignMissionReadyForRun(prisma, missionId, mission.status);
  if (!prep.ok) {
    return {
      ok: false,
      statusCode: 409,
      error: prep.error || 'prepare_failed',
      message: prep.error || 'Could not prepare campaign mission for run',
      ...(prep.status != null ? { pipelineStatus: prep.status } : {}),
    };
  }

  const body = opts.body && typeof opts.body === 'object' ? opts.body : {};
  const meta =
    mission.metadataJson && typeof mission.metadataJson === 'object' ? { ...mission.metadataJson } : {};
  const nextMeta = {
    ...meta,
    ...(typeof body.campaignContext === 'string' && body.campaignContext.trim()
      ? { campaignContext: body.campaignContext.trim(), goal: body.campaignContext.trim() }
      : {}),
    ...(typeof body.storeId === 'string' && body.storeId.trim() ? { storeId: body.storeId.trim() } : {}),
    ...(typeof body.hint === 'string' && body.hint.trim() ? { hint: body.hint.trim() } : {}),
    source: opts.auditSource ?? meta.source ?? 'create_campaign',
  };
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { metadataJson: nextMeta },
  });

  const structuredMarker = await prisma.missionPipelineStep.count({
    where: { missionId, toolName: 'market_research' },
  });
  if (structuredMarker === 0) {
    return {
      ok: false,
      statusCode: 409,
      error: 'pipeline_not_structured',
      message: 'Campaign mission has no structured steps — ensureStructuredCampaignCheckpointSteps must run first.',
    };
  }

  const pendingSteps = await prisma.missionPipelineStep.count({
    where: { missionId, status: 'pending' },
  });

  if (pendingSteps > 0) {
    const { runMissionUntilBlocked } = await import('../missionPipelineOrchestrator.js');
    const orch = await runMissionUntilBlocked(missionId);
    const mAfter = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { status: true, runState: true, outputsJson: true },
    });
    const out = mAfter?.outputsJson && typeof mAfter.outputsJson === 'object' ? mAfter.outputsJson : {};
    const orchestration = { stepsRun: orch.stepsRun, stoppedReason: orch.stoppedReason };
    const runEval = evaluateStructuredCheckpointRunResult(orch, mAfter);
    if (!runEval.ok) {
      return {
        ok: false,
        statusCode: runEval.statusCode,
        error: runEval.error,
        message: runEval.message,
        missionId,
        pipelineStatus: mAfter?.status ?? orch.status,
        orchestration,
      };
    }
    return {
      ok: true,
      missionId,
      campaignId: typeof out.campaignId === 'string' ? out.campaignId : '',
      promotionId: typeof out.promotionId === 'string' ? out.promotionId : '',
      status: mAfter?.status || orch.status || 'awaiting_input',
      mode: 'checkpoint_pipeline',
      orchestration,
    };
  }

  const mDone = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { status: true, runState: true, outputsJson: true },
  });
  const outDone = mDone?.outputsJson && typeof mDone.outputsJson === 'object' ? mDone.outputsJson : {};
  return {
    ok: true,
    missionId,
    campaignId: typeof outDone.campaignId === 'string' ? outDone.campaignId : '',
    promotionId: typeof outDone.promotionId === 'string' ? outDone.promotionId : '',
    status: mDone?.status || 'completed',
    mode: 'checkpoint_pipeline',
    orchestration: { stepsRun: 0, stoppedReason: 'no_pending_steps' },
  };
}
