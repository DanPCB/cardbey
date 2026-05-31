/**
 * Shared proactive runway step executor — used by performerProactiveStepRoutes and Runtime Kernel.
 * Does not validate tools (kernel owns authority); routes may pre-check allowlist for legacy path.
 */

import { getPrismaClient } from '../prisma.js';
import { advanceProactivePipelineStep } from '../orchestrator/advanceProactivePipelineStep.js';
import { dispatchExecution } from '../orchestrator/dispatchExecution.js';
import { getTenantId } from '../missionAccess.js';
import { dispatchTaskWithAgentHint } from '../agentPlanning/agentOrchestrator.js';
import { resolveRunwayDispatchToolName } from '../missionPlan/proactiveRunwayToolAllowlist.js';
import {
  resolveCodeFixProposedPatchForApply,
  buildCanonicalCodeFixErrorOutput,
} from '../../services/codeFixCanonicalOutput.js';
import { buildStepContext, writeStepOutput, shouldPersistStepOutputToBus } from '../missionContextBus.js';
import { mergeProactiveStepStatus } from './runtimeStepState.js';
import { isRuntimePrerequisiteResolutionEnabled } from './runtimePrerequisiteResolver.js';

const isDev = process.env.NODE_ENV !== 'production';

const SOCIAL_POST_COMPLETE_TOOLS = new Set(['publish_to_social', 'connect_social_account']);

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function proactivePlanStepTitle(body) {
  const ps = body?.proactivePlanStep;
  if (ps && typeof ps === 'object' && typeof ps.title === 'string' && ps.title.trim()) {
    return ps.title.trim();
  }
  return null;
}

function landingPageUrlFromDeployChannels(channels) {
  if (!Array.isArray(channels)) return null;
  for (const ch of channels) {
    if (!ch || typeof ch !== 'object') continue;
    if (String(ch.channel) === 'landing_page' && typeof ch.landingPageUrl === 'string' && ch.landingPageUrl.trim()) {
      return ch.landingPageUrl.trim();
    }
  }
  return null;
}

async function attachSocialShareRecommendationToLaunchOutput(stepOut, { userId, prisma, stepOutputs }) {
  if (!stepOut || typeof stepOut !== 'object' || Array.isArray(stepOut)) return;
  if (String(stepOut.phase) !== 'deployed') return;
  try {
    const connectedAccounts = await prisma.oAuthConnection.findMany({
      where: { userId },
      select: { platform: true, pageName: true },
    });
    const lc = asObject(stepOutputs?.launch_campaign);
    const campaignUrl =
      landingPageUrlFromDeployChannels(stepOut.channels) ??
      (typeof stepOut.landingPageUrl === 'string' ? stepOut.landingPageUrl.trim() : null) ??
      landingPageUrlFromDeployChannels(lc.channels) ??
      (typeof lc.landingPageUrl === 'string' ? lc.landingPageUrl.trim() : null) ??
      null;

    stepOut.recommendation = {
      type: 'social_share_recommendation',
      tool: 'publish_to_social',
      priority: 'high',
      campaignUrl,
      connectedPlatforms: connectedAccounts.map((a) => a.platform),
      message:
        connectedAccounts.length > 0
          ? `Your campaign is live! Share it on ${connectedAccounts.map((a) => a.platform).join(', ')}?`
          : 'Your campaign is live! Share it on social media?',
    };
  } catch (e) {
    console.warn('[ProactiveRunwayStep] recommendation hook failed:', e?.message ?? e);
  }
}

async function resolveAgentHintForStep(missionId, stepNumber) {
  try {
    const prisma = getPrismaClient();
    const mission = await prisma.mission
      .findUnique({
        where: { id: missionId },
        select: { context: true },
      })
      .catch(() => null);

    if (!mission?.context) return 'dispatchTool';

    const ctx = typeof mission.context === 'object' && mission.context !== null ? mission.context : {};
    const agentMemory = ctx.agentMemory && typeof ctx.agentMemory === 'object' ? ctx.agentMemory : {};
    const taskGraph = agentMemory.taskGraph;

    if (!taskGraph?.tasks || !Array.isArray(taskGraph.tasks)) {
      return 'dispatchTool';
    }

    const task = taskGraph.tasks[stepNumber - 1];
    const hint = task?.agentHint;
    return typeof hint === 'string' && hint.trim() ? hint.trim() : 'dispatchTool';
  } catch {
    return 'dispatchTool';
  }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'NOT_FOUND' | 'FORBIDDEN' }>}
 */
export async function assertProactivePipelineOrMissionAccess(user, missionId) {
  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findFirst({
    where: { id: missionId },
    select: { id: true, tenantId: true, createdBy: true },
  });

  if (pipeline) {
    const tenantId = getTenantId(user);
    const allowed =
      !pipeline.tenantId ||
      pipeline.tenantId === tenantId ||
      (pipeline.createdBy && user?.id && pipeline.createdBy === user.id);
    if (!allowed) return { ok: false, reason: 'FORBIDDEN' };
    return { ok: true };
  }

  const mission = await prisma.mission.findFirst({
    where: { id: missionId },
    select: { id: true, tenantId: true, createdByUserId: true },
  });

  if (!mission) return { ok: false, reason: 'NOT_FOUND' };

  const ownerId = user?.id;
  const businessId = user?.business?.id;
  const isOwner =
    mission.createdByUserId === ownerId ||
    mission.tenantId === ownerId ||
    mission.tenantId === businessId;
  const devPlaceholder =
    mission.createdByUserId === 'temp' ||
    mission.tenantId === 'temp' ||
    mission.createdByUserId === 'dev-user-id' ||
    mission.tenantId === 'dev-user-id';
  const devBypass = isDev && ownerId && devPlaceholder;
  if (!(isOwner || devBypass)) return { ok: false, reason: 'FORBIDDEN' };
  return { ok: true };
}

/**
 * @param {{
 *   user: object;
 *   missionId: string;
 *   stepNumber: number;
 *   recommendedTool: string;
 *   proactivePlanTotal?: number;
 *   parameters?: object;
 *   body?: object;
 *   source?: string;
 *   allowGeneralChat?: boolean;
 *   stepStatusPatch?: (meta: object, status: string, extra?: object) => object;
 * }} input
 */
export async function executeProactiveRunwayStep(input) {
  const {
    user,
    missionId,
    stepNumber,
    recommendedTool,
    proactivePlanTotal = 0,
    parameters: parametersIn = {},
    body = {},
    source = 'performer_proactive_step',
    allowGeneralChat = false,
    stepStatusPatch,
  } = input;

  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      status: true,
      runState: true,
      metadataJson: true,
      targetId: true,
      executionMode: true,
    },
  });

  if (!pipeline) {
    return { ok: false, httpStatus: 404, code: 'NOT_FOUND', message: 'Mission pipeline not found' };
  }

  const st = String(pipeline.status || '').toLowerCase();
  const rs = String(pipeline.runState || '').toLowerCase();
  const wasCompleted = st === 'completed' && rs === 'done';
  const isSocialFollowUpTool = SOCIAL_POST_COMPLETE_TOOLS.has(recommendedTool);
  if (['completed', 'cancelled', 'failed'].includes(st) && !(wasCompleted && isSocialFollowUpTool)) {
    return { ok: false, httpStatus: 409, code: 'PIPELINE_TERMINAL', message: 'Mission is already in a terminal state' };
  }

  let meta = asObject(pipeline.metadataJson);
  const stepOutputs = asObject(meta.stepOutputs);

  const patchMeta = (status, extra = {}) => {
    const basePatch = { status, tool: recommendedTool, ...extra };
    meta =
      typeof stepStatusPatch === 'function'
        ? stepStatusPatch(meta, status, basePatch)
        : mergeProactiveStepStatus(meta, stepNumber, basePatch);
    return meta;
  };

  if (!(wasCompleted && isSocialFollowUpTool)) {
    const advStart = await advanceProactivePipelineStep(prisma, {
      missionId,
      executionMode: pipeline.executionMode,
      data: {
        status: 'executing',
        runState: 'running',
        metadataJson: patchMeta('running'),
      },
      source,
      correlationId: missionId,
    });
    if (!advStart.ok) {
      return {
        ok: false,
        httpStatus: advStart.code === 'NOT_GUIDED' ? 409 : advStart.code === 'NOT_FOUND' ? 404 : 500,
        code: advStart.code,
        message: advStart.message,
      };
    }
  }

  const parameters = asObject(parametersIn);
  const payload = { ...parameters };
  payload.missionId = payload.missionId || missionId;

  if (recommendedTool === 'create_promotion') {
    const rawImg = parameters.imageDataUrl ?? body.imageDataUrl;
    if (typeof rawImg === 'string' && rawImg.trim()) {
      payload.imageDataUrl = String(rawImg).trim();
    }
  }

  if (!payload.storeId && typeof meta.storeId === 'string' && meta.storeId.trim()) {
    payload.storeId = meta.storeId.trim();
  }
  if (!payload.storeId && pipeline.targetId && String(pipeline.targetId).trim()) {
    payload.storeId = String(pipeline.targetId).trim();
  }

  // Runtime Kernel prerequisite layer owns store resolution — never silently infer from latest business.
  if (!payload.storeId && !isRuntimePrerequisiteResolutionEnabled()) {
    try {
      const userBusiness = await prisma.business.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (userBusiness?.id) payload.storeId = userBusiness.id;
    } catch {
      /* best-effort legacy fallback when prerequisite resolution is disabled */
    }
  }

  if (!payload.userId && user?.id) payload.userId = user.id;

  const stepTitleForBus = proactivePlanStepTitle(body);

  if (stepNumber > 1) {
    try {
      const prior = await buildStepContext({
        missionId,
        currentStepIndex: stepNumber,
        step: { index: stepNumber, toolName: recommendedTool, name: stepTitleForBus ?? undefined },
      });
      if (prior) payload.priorStepsContext = prior;
    } catch {
      /* skip */
    }
  }

  let toolResult;

  if (recommendedTool === 'code_fix') {
    const description =
      String(body.description ?? '').trim() ||
      String(parameters.description ?? '').trim() ||
      String(parameters.prompt ?? '').trim() ||
      '';
    const filePathsFromBody = Array.isArray(body.filePaths) ? body.filePaths : null;
    const filePathsFromParams = Array.isArray(parameters.filePaths) ? parameters.filePaths : null;
    const filePaths = filePathsFromBody || filePathsFromParams || [];
    const repoContext = String(body.repoContext ?? parameters.repoContext ?? '').trim() || undefined;
    const hasSourceFilePaths = filePaths.some((p) =>
      /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php)$/i.test(String(p ?? '').trim()),
    );
    const { runCodeFixAnalysis, tryBuildStoreContentFixOutputFromIntakePatch } = await import(
      '../../services/codeFixPerformerService.js'
    );
    const intakePatch = parameters.storeContentPatch ?? body.storeContentPatch;
    const fromIntake = tryBuildStoreContentFixOutputFromIntakePatch({ storeContentPatch: intakePatch, description });
    if (fromIntake && !hasSourceFilePaths) {
      toolResult = { status: 'ok', output: fromIntake.output };
    } else {
      const analysis = await runCodeFixAnalysis({ description, filePaths, repoContext });
      if (!analysis.ok) {
        await advanceProactivePipelineStep(prisma, {
          missionId,
          executionMode: pipeline.executionMode,
          data: { status: 'failed', runState: 'error', metadataJson: patchMeta('failed', { error: analysis.message }) },
          source,
          correlationId: missionId,
        });
        return {
          ok: false,
          httpStatus: 200,
          code: 'STEP_FAILED',
          message: analysis.message,
          output: buildCanonicalCodeFixErrorOutput(analysis.message),
          stepStatus: 'failed',
        };
      }
      toolResult = { status: 'ok', output: analysis.output };
    }
  } else if (recommendedTool === 'generate_slideshow') {
    toolResult = {
      status: 'ok',
      output: {
        slideshowUrl: null,
        status: 'pending_client_export',
        promotionId: parameters.promotionId ?? payload.promotionId ?? null,
        instanceId: parameters.instanceId ?? payload.instanceId ?? null,
      },
    };
  } else if (recommendedTool === 'general_chat') {
    if (!allowGeneralChat) {
      return {
        ok: false,
        httpStatus: 422,
        code: 'TOOL_CHAT_ONLY',
        message: 'general_chat cannot execute proactive mission steps',
        stepStatus: 'rejected',
      };
    }
    toolResult = { status: 'ok', output: { message: 'OK' } };
  } else {
    const dispatchName = resolveRunwayDispatchToolName(recommendedTool);
    const ctx = {
      missionId,
      tenantId: getTenantId(user),
      userId: user?.id,
      createdBy: user?.id,
      stepOutputs,
      storeId: payload.storeId,
    };
    const agentHint = await resolveAgentHintForStep(missionId, stepNumber);
    toolResult = await dispatchExecution(
      {
        source: 'performer',
        executionType: 'proactive_step',
        missionId,
        action: dispatchName,
        correlationId: missionId,
        legacySource: source,
        context: { stepNumber, recommendedTool },
      },
      () => dispatchTaskWithAgentHint(dispatchName, { ...payload, _agentHint: agentHint }, ctx),
    );
  }

  const failed = toolResult.status === 'failed' || toolResult.status === 'blocked';
  if (failed) {
    if (!(wasCompleted && isSocialFollowUpTool)) {
      await advanceProactivePipelineStep(prisma, {
        missionId,
        executionMode: pipeline.executionMode,
        data: {
          status: 'failed',
          runState: 'error',
          metadataJson: patchMeta('failed', {
            error: toolResult.error?.message || toolResult.blocker?.message,
          }),
        },
        source,
        correlationId: missionId,
      });
    }
    return {
      ok: false,
      httpStatus: 200,
      code: 'STEP_FAILED',
      message: toolResult.error?.message || toolResult.blocker?.message || 'proactive_step_failed',
      output: toolResult.output ?? toolResult,
      stepStatus: 'failed',
    };
  }

  const isLastStep = proactivePlanTotal > 0 && stepNumber >= proactivePlanTotal;
  const stepOut = toolResult.output && typeof toolResult.output === 'object' ? toolResult.output : {};
  const blocksTerminalComplete =
    (recommendedTool === 'create_promotion' && stepOut.phase === 'awaiting_product_selection') ||
    (recommendedTool === 'launch_campaign' && stepOut.phase === 'awaiting_channel_selection') ||
    (recommendedTool === 'code_fix' && stepOut.phase === 'awaiting_approval') ||
    (recommendedTool === 'edit_artifact' && stepOut.phase === 'image_search_results');
  const pipelineComplete = isLastStep && !blocksTerminalComplete;

  if (recommendedTool === 'launch_campaign' && stepOut.phase !== 'awaiting_channel_selection') {
    await attachSocialShareRecommendationToLaunchOutput(stepOut, {
      userId: user.id,
      prisma,
      stepOutputs,
    });
  }

  const restoreCompletedAfterSocial = wasCompleted && isSocialFollowUpTool && toolResult.status === 'ok';
  const nextStatus = restoreCompletedAfterSocial ? 'completed' : pipelineComplete ? 'completed' : 'executing';
  const nextRunState = restoreCompletedAfterSocial ? 'done' : pipelineComplete ? 'done' : 'idle';

  const stepDurabilityStatus = blocksTerminalComplete ? 'running' : 'completed';

  let nextMeta = patchMeta(stepDurabilityStatus, { output: stepOut });
  nextMeta = {
    ...nextMeta,
    stepOutputs: {
      ...stepOutputs,
      [recommendedTool]: toolResult.output ?? {},
    },
  };

  const advDone = await advanceProactivePipelineStep(prisma, {
    missionId,
    executionMode: pipeline.executionMode,
    data: {
      status: nextStatus,
      runState: nextRunState,
      metadataJson: nextMeta,
    },
    source,
    correlationId: missionId,
  });

  if (!advDone.ok) {
    return {
      ok: false,
      httpStatus: advDone.code === 'NOT_GUIDED' ? 409 : advDone.code === 'NOT_FOUND' ? 404 : 500,
      code: advDone.code,
      message: advDone.message,
    };
  }

  if (shouldPersistStepOutputToBus(recommendedTool)) {
    writeStepOutput(
      missionId,
      {
        stepIndex: stepNumber,
        toolName: recommendedTool,
        stepTitle: stepTitleForBus,
      },
      stepOut,
    ).catch((e) => console.warn('[ProactiveRunwayStep] writeStepOutput:', e?.message || e));
  }

  return {
    ok: true,
    httpStatus: 200,
    stepNumber,
    output: toolResult.output ?? { status: toolResult.status },
    stepStatus: stepDurabilityStatus,
    recommendedTool,
    pipelineStatus: nextStatus,
    pipelineRunState: nextRunState,
    metadataJson: nextMeta,
  };
}

export { proactivePlanStepTitle, mergeProactiveStepStatus };
