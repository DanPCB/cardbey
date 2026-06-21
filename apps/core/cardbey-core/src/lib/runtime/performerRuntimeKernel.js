/**
 * Performer Runtime Kernel — authoritative mission step execution (Phase 2 foundation).
 */

import { appendEvent } from '../missionBlackboard.js';
import { assertExecutableTool, normalizeToolName } from './runtimeToolRegistry.js';
import {
  getProactiveStepRecord,
  isProactiveStepCompleted,
  mergeProactiveStepStatus,
} from './runtimeStepState.js';
import {
  assertProactivePipelineOrMissionAccess,
  executeProactiveRunwayStep,
} from './proactiveRunwayStepExecutor.js';
import {
  isRuntimePrerequisiteResolutionEnabled,
  resolveMissionPrerequisites,
} from './runtimePrerequisiteResolver.js';
import { recordPrerequisiteBlock } from './runtimePrerequisiteService.js';
import { readRuntimePrerequisites, RUNTIME_PREREQ_STATUS } from './runtimePrerequisiteState.js';
import { buildPrerequisiteGuidance } from './runtimeGuidanceService.js';
import {
  isPerformerRuntimeKernelEnabled as kernelMandatoryKernelEnabled,
  isRuntimeStepExecutionEnabled as kernelMandatoryStepEnabled,
  isSharedRuntimeToolRegistryEnabled as kernelMandatoryRegistryEnabled,
} from './kernelMandatory.js';
import { recordKernelExecution } from './kernelAudit.js';
import {
  isMissionPipelineCancelledRow,
} from './missionCancellationGuard.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function isPerformerRuntimeKernelEnabled() {
  return kernelMandatoryKernelEnabled();
}

export function isRuntimeStepExecutionEnabled() {
  return kernelMandatoryStepEnabled();
}

export function isSharedRuntimeToolRegistryEnabled() {
  return kernelMandatoryRegistryEnabled();
}

async function emitStepLifecycleEvent(missionId, eventType, payload, traceId) {
  try {
    await appendEvent(missionId, eventType, payload, traceId ? { traceId } : {});
  } catch (e) {
    console.warn(`[RuntimeKernel] ${eventType} blackboard emit failed:`, e?.message || e);
  }
}

/**
 * @param {{
 *   user: object;
 *   missionId: string;
 *   stepId?: string|null;
 *   stepNumber: number;
 *   requestedTool: string;
 *   source?: string;
 *   traceId?: string|null;
 *   requestId?: string|null;
 *   targetContext?: object|null;
 *   continuationContract?: object|null;
 *   body?: object;
 *   parameters?: object;
 *   proactivePlanTotal?: number;
 *   forceRetry?: boolean;
 * }} input
 */
export async function executeMissionStep(input) {
  const req = input && typeof input === 'object' ? input : {};
  const missionId = String(req.missionId ?? '').trim();
  const stepNumber = Math.floor(Number(req.stepNumber));
  const requestedTool = String(req.requestedTool ?? '').trim().toLowerCase();
  const source = String(req.source ?? 'runtime_kernel').trim() || 'runtime_kernel';
  const traceId = typeof req.traceId === 'string' ? req.traceId.trim() : null;
  const requestId = typeof req.requestId === 'string' ? req.requestId.trim() : null;
  const proactivePlanTotal = Math.max(0, Math.floor(Number(req.proactivePlanTotal) || 0));
  const forceRetry = req.forceRetry === true;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const parameters = req.parameters && typeof req.parameters === 'object' ? req.parameters : {};

  if (!missionId || !Number.isFinite(stepNumber) || stepNumber < 1 || !requestedTool) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'INVALID_REQUEST',
      message: 'missionId, stepNumber, and requestedTool are required',
    };
  }

  const access = await assertProactivePipelineOrMissionAccess(req.user, missionId);
  if (!access.ok) {
    return {
      ok: false,
      httpStatus: access.reason === 'NOT_FOUND' ? 404 : 403,
      code: access.reason ?? 'FORBIDDEN',
      message: 'Mission pipeline not found or access denied',
    };
  }

  const toolAssert = assertExecutableTool(requestedTool);
  if (!toolAssert.ok) {
    await emitStepLifecycleEvent(
      missionId,
      'mission.step.rejected',
      {
        stepNumber,
        requestedTool,
        code: toolAssert.code,
        message: toolAssert.message,
        source,
        requestId,
      },
      traceId,
    );
    return {
      ok: false,
      httpStatus: 422,
      code: toolAssert.code,
      message: toolAssert.message,
      stepStatus: 'rejected',
      requestedTool,
      canonicalTool: normalizeToolName(requestedTool) || requestedTool,
    };
  }

  const { getPrismaClient } = await import('../prisma.js');
  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      runState: true,
      targetId: true,
      targetType: true,
      metadataJson: true,
    },
  });

  if (!pipeline) {
    return {
      ok: false,
      httpStatus: 404,
      code: 'NOT_FOUND',
      message: 'Mission pipeline not found',
    };
  }

  if (isMissionPipelineCancelledRow(pipeline)) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'MISSION_CANCELLED',
      message: 'Mission was cancelled',
      executionState: 'cancelled',
    };
  }

  const meta = pipeline?.metadataJson ?? {};
  if (!forceRetry && isProactiveStepCompleted(meta, stepNumber)) {
    const row = getProactiveStepRecord(meta, stepNumber);
    const stepOutputs = meta && typeof meta === 'object' ? meta.stepOutputs : {};
    const out =
      stepOutputs && typeof stepOutputs === 'object'
        ? stepOutputs[toolAssert.canonicalTool] ?? stepOutputs[requestedTool]
        : null;
    return {
      ok: true,
      httpStatus: 200,
      alreadyCompleted: true,
      stepNumber,
      stepStatus: 'completed',
      recommendedTool: toolAssert.canonicalTool,
      output: out ?? {},
      message: 'Step already completed',
    };
  }

  await emitStepLifecycleEvent(
    missionId,
    'mission.step.started',
    {
      stepNumber,
      requestedTool,
      canonicalTool: toolAssert.canonicalTool,
      source,
      requestId,
      continuationContract: req.continuationContract ?? null,
    },
    traceId,
  );

  if (isRuntimePrerequisiteResolutionEnabled() && pipeline) {
    const existingPrereq = readRuntimePrerequisites(meta);
    if (
      existingPrereq &&
      str(existingPrereq.status) === RUNTIME_PREREQ_STATUS.WAITING &&
      !forceRetry
    ) {
      return {
        ok: false,
        httpStatus: 412,
        code: 'PREREQUISITE_REQUIRED',
        prerequisiteBlocked: true,
        stepStatus: 'blocked',
        requirementsMet: false,
        missingRequirements: existingPrereq.missingRequirements ?? [],
        suggestedActions: existingPrereq.suggestedActions ?? [],
        resumableIntent: existingPrereq.resumableIntent ?? null,
        blockingReason: existingPrereq.blockingReason ?? 'store_required',
        storeCandidates: existingPrereq.storeCandidates ?? [],
        runtimeGuidance: [
          buildPrerequisiteGuidance({
            missionId,
            prerequisite: existingPrereq,
            storeCandidates: existingPrereq.storeCandidates,
          }),
        ],
        stepNumber,
        requestedTool,
        canonicalTool: toolAssert.canonicalTool,
      };
    }

    const prereq = await resolveMissionPrerequisites({
      user: req.user,
      mission: pipeline,
      requestedTool: toolAssert.canonicalTool,
      targetContext: req.targetContext ?? null,
      continuationContract: req.continuationContract ?? null,
      stepNumber,
      parameters,
    });

    if (!prereq.requirementsMet) {
      await recordPrerequisiteBlock(prisma, missionId, prereq);
      await emitStepLifecycleEvent(
        missionId,
        'runtime.prerequisite.required',
        {
          stepNumber,
          requestedTool,
          canonicalTool: toolAssert.canonicalTool,
          blockingReason: prereq.blockingReason,
          missingRequirements: prereq.missingRequirements,
          suggestedActions: prereq.suggestedActions,
          resumableIntent: prereq.resumableIntent,
          source,
          requestId,
        },
        traceId,
      );
      return {
        ok: false,
        httpStatus: 412,
        code: 'PREREQUISITE_REQUIRED',
        prerequisiteBlocked: true,
        stepStatus: 'blocked',
        requirementsMet: false,
        missingRequirements: prereq.missingRequirements ?? [],
        suggestedActions: prereq.suggestedActions ?? [],
        resumableIntent: prereq.resumableIntent ?? null,
        blockingReason: prereq.blockingReason ?? null,
        storeCandidates: prereq.storeCandidates ?? [],
        runtimeGuidance: [
          buildPrerequisiteGuidance({
            missionId,
            prerequisite: {
              missingRequirements: prereq.missingRequirements,
              suggestedActions: prereq.suggestedActions,
              resumableIntent: prereq.resumableIntent,
              storeCandidates: prereq.storeCandidates,
            },
            storeCandidates: prereq.storeCandidates,
          }),
        ],
        stepNumber,
        requestedTool,
        canonicalTool: toolAssert.canonicalTool,
      };
    }
  }

  const stepStatusPatch = (metadataJson, status, extra = {}) =>
    mergeProactiveStepStatus(metadataJson, stepNumber, {
      status,
      tool: toolAssert.canonicalTool,
      requestedTool,
      source,
      ...(extra && typeof extra === 'object' ? extra : {}),
    });

  const result = await executeProactiveRunwayStep({
    user: req.user,
    missionId,
    stepNumber,
    recommendedTool: toolAssert.canonicalTool,
    proactivePlanTotal,
    parameters,
    body,
    source,
    allowGeneralChat: false,
    stepStatusPatch,
  });

  if (!result.ok) {
    const failStatus = result.stepStatus === 'rejected' ? 'rejected' : 'failed';
    await emitStepLifecycleEvent(
      missionId,
      failStatus === 'rejected' ? 'mission.step.rejected' : 'mission.step.failed',
      {
        stepNumber,
        requestedTool,
        canonicalTool: toolAssert.canonicalTool,
        code: result.code,
        message: result.message,
        source,
        requestId,
      },
      traceId,
    );
    return {
      ...result,
      requestedTool,
      canonicalTool: toolAssert.canonicalTool,
      stepNumber,
    };
  }

  await emitStepLifecycleEvent(
    missionId,
    'mission.step.completed',
    {
      stepNumber,
      requestedTool,
      canonicalTool: toolAssert.canonicalTool,
      stepStatus: result.stepStatus,
      source,
      requestId,
    },
    traceId,
  );

  await recordKernelExecution({
    missionId,
    toolName: toolAssert.canonicalTool,
    source,
    userId: req.user?.id ?? null,
    success: true,
    capability: toolAssert.canonicalTool,
  });

  return {
    ok: true,
    httpStatus: 200,
    stepNumber,
    stepStatus: result.stepStatus,
    recommendedTool: toolAssert.canonicalTool,
    requestedTool,
    canonicalTool: toolAssert.canonicalTool,
    output: result.output,
    pipelineStatus: result.pipelineStatus,
    pipelineRunState: result.pipelineRunState,
    metadataJson: result.metadataJson,
  };
}

export const performerRuntimeKernel = {
  executeMissionStep,
  isPerformerRuntimeKernelEnabled,
  isRuntimeStepExecutionEnabled,
  isSharedRuntimeToolRegistryEnabled,
};

export default performerRuntimeKernel;
