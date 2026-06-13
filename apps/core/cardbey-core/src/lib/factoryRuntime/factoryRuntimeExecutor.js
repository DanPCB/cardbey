/**
 * Factory Runtime Executor — sequential stage orchestration under Performer Runtime.
 */

import { dispatchTool } from '../toolDispatcher.js';
import { markRuntimeOwnedContext } from '../runtime/performerRuntime/runtimeOwnership.js';
import { applyOutputMapping, resolveInputMapping } from './factoryDefinition.js';
import { getFactory } from './factoryRegistry.js';
import {
  createFactoryExecutionState,
  persistFactoryPending,
} from './factoryApprovalService.js';
import {
  FACTORY_STATUS_AWAITING_APPROVAL,
  FACTORY_STATUS_AWAITING_FINAL_ASSET_APPROVAL,
  FACTORY_STATUS_COMPLETED,
  FACTORY_STATUS_FAILED,
} from './factoryConstants.js';
import { resolvePlanFromState } from './factoryApprovalPolicy.js';
import { finalizeFactoryArtifactFromPolicy } from './factoryArtifactPolicy.js';
import { getFactoryStageHandler } from './factoryStageHandlerRegistry.js';
import { getPath } from './factoryPathUtils.js';
import {
  emitFactoryExecutionCompleted,
  emitFactoryExecutionPaused,
  emitFactoryExecutionStarted,
  emitFactoryRequiredArtifactMissing,
  emitFactoryStageCompleted,
  emitFactoryStageFailed,
  emitFactoryStageStarted,
  emitFactoryStageTimeout,
} from './factoryTelemetry.js';

/**
 * @param {{
 *   factoryId: string;
 *   missionId: string;
 *   userId: string;
 *   intent?: string;
 *   context?: Record<string, unknown>;
 *   resumeState?: object;
 * }} request
 */
export async function runFactoryExecution(request) {
  const factoryId = typeof request?.factoryId === 'string' ? request.factoryId.trim() : '';
  const missionId = typeof request?.missionId === 'string' ? request.missionId.trim() : '';
  const userId = typeof request?.userId === 'string' ? request.userId.trim() : '';
  const intent = typeof request?.intent === 'string' ? request.intent.trim() : '';
  const context = request?.context && typeof request.context === 'object' ? request.context : {};

  if (!factoryId || !missionId || !userId) {
    return {
      ok: false,
      status: FACTORY_STATUS_FAILED,
      error: { code: 'validation', message: 'factoryId, missionId, and userId are required' },
    };
  }

  const definition = getFactory(factoryId);
  if (!definition) {
    return {
      ok: false,
      status: FACTORY_STATUS_FAILED,
      error: { code: 'factory_not_found', message: `Unknown factory: ${factoryId}` },
    };
  }

  const state = request.resumeState
    ? { ...request.resumeState, updatedAt: new Date().toISOString() }
    : createFactoryExecutionState({
        factoryId,
        missionId,
        userId,
        intent,
        context: { ...context, missionId, storeId: context.storeId ?? null },
      });

  if (!request.resumeState) {
    emitFactoryExecutionStarted({ factoryId, missionId, userId, executionId: state.executionId });
  }

  const stages = definition.stages ?? [];
  let stageIndex = typeof state.stageIndex === 'number' ? state.stageIndex : 0;

  while (stageIndex < stages.length) {
    const stage = stages[stageIndex];
    state.currentStageId = stage.stageId;
    state.stageIndex = stageIndex;

    if (stage.requiresApproval && !state.resumeFromApproval) {
      const missing = validateRequiredArtifacts(stage, state);
      if (missing.length) {
        emitFactoryRequiredArtifactMissing({
          factoryId,
          missionId,
          userId,
          stageId: stage.stageId,
          missing,
          executionId: state.executionId,
        });
        state.status = FACTORY_STATUS_FAILED;
        state.error = {
          code: 'required_artifact_missing',
          message: `Missing required artifacts: ${missing.join(', ')}`,
        };
        await persistFactoryPending(state);
        return {
          ok: false,
          status: FACTORY_STATUS_FAILED,
          executionId: state.executionId,
          factoryId,
          missionId,
          stageId: stage.stageId,
          error: state.error,
        };
      }

      const approvalStatus = resolveApprovalPauseStatus(stage);
      state.status = approvalStatus;
      state.pendingApprovalKind = stage.approvalKind ?? 'plan';
      await persistFactoryPending(state);
      emitFactoryExecutionPaused({
        factoryId,
        missionId,
        userId,
        stageId: stage.stageId,
        stageIndex,
        executionId: state.executionId,
        approvalKind: stage.approvalKind ?? 'plan',
      });
      return {
        ok: true,
        status: approvalStatus,
        executionId: state.executionId,
        factoryId,
        missionId,
        stageId: stage.stageId,
        stageIndex,
        stageOutputs: state.stageOutputs,
        plan: resolvePlanFromState(state, definition),
      };
    }

    if (
      state.resumeFromApproval &&
      stage.requiresApproval &&
      state.resumedApprovalStageId === stage.stageId
    ) {
      state.resumeFromApproval = false;
      state.resumedApprovalStageId = null;
      stageIndex += 1;
      continue;
    }

    emitFactoryStageStarted({
      factoryId,
      missionId,
      userId,
      stageId: stage.stageId,
      stageIndex,
      executionId: state.executionId,
    });

    try {
      const stageResult = await runFactoryStageWithTimeout(stage, state, definition);
      if (!stageResult.ok) {
        state.status = FACTORY_STATUS_FAILED;
        state.error = stageResult.error;
        emitFactoryStageFailed({
          factoryId,
          missionId,
          userId,
          stageId: stage.stageId,
          stageIndex,
          error: stageResult.error?.message,
        });
        await persistFactoryPending(state);
        return {
          ok: false,
          status: FACTORY_STATUS_FAILED,
          executionId: state.executionId,
          factoryId,
          missionId,
          stageId: stage.stageId,
          stageIndex,
          error: stageResult.error,
        };
      }

      state.stageOutputs[stage.stageId] = stageResult.output ?? {};
      if (stageResult.artifactRef) {
        state.artifactRefs = [...(state.artifactRefs ?? []), stageResult.artifactRef];
      }

      const postMissing = validateStageRequiredArtifacts(stage, state);
      if (postMissing.length) {
        emitFactoryRequiredArtifactMissing({
          factoryId,
          missionId,
          userId,
          stageId: stage.stageId,
          missing: postMissing,
          executionId: state.executionId,
        });
        state.status = FACTORY_STATUS_FAILED;
        state.error = {
          code: 'required_artifact_missing',
          message: `Stage ${stage.stageId} missing outputs: ${postMissing.join(', ')}`,
        };
        await persistFactoryPending(state);
        return {
          ok: false,
          status: FACTORY_STATUS_FAILED,
          executionId: state.executionId,
          factoryId,
          missionId,
          stageId: stage.stageId,
          error: state.error,
        };
      }

      emitFactoryStageCompleted({
        factoryId,
        missionId,
        userId,
        stageId: stage.stageId,
        stageIndex,
        executionId: state.executionId,
      });
    } catch (err) {
      const message = err?.message ?? String(err);
      emitFactoryStageFailed({
        factoryId,
        missionId,
        userId,
        stageId: stage.stageId,
        stageIndex,
        error: message,
      });
      state.status = FACTORY_STATUS_FAILED;
      await persistFactoryPending(state);
      return {
        ok: false,
        status: FACTORY_STATUS_FAILED,
        executionId: state.executionId,
        factoryId,
        missionId,
        stageId: stage.stageId,
        error: { code: err?.code ?? 'stage_failed', message },
      };
    }

    stageIndex += 1;
  }

  state.status = FACTORY_STATUS_COMPLETED;
  state.stageIndex = stages.length;
  await persistFactoryPending(state);

  const finalizeOut = state.stageOutputs?.artifact_finalize ?? {};
  emitFactoryExecutionCompleted({
    factoryId,
    missionId,
    userId,
    executionId: state.executionId,
    artifactId: finalizeOut.artifactId ?? null,
  });

  return {
    ok: true,
    status: FACTORY_STATUS_COMPLETED,
    executionId: state.executionId,
    factoryId,
    missionId,
    stageOutputs: state.stageOutputs,
    artifact: finalizeOut,
    artifactRefs: state.artifactRefs,
    plan: resolvePlanFromState(state, definition),
  };
}

/**
 * @param {object} stage
 * @param {object} state
 * @param {object} definition
 */
async function runFactoryStageWithTimeout(stage, state, definition) {
  const timeoutMs = typeof stage.timeoutMs === 'number' ? stage.timeoutMs : null;
  if (!timeoutMs) {
    return runFactoryStage(stage, state, definition);
  }

  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      emitFactoryStageTimeout({
        factoryId: state.factoryId,
        missionId: state.missionId,
        userId: state.userId,
        stageId: stage.stageId,
        timeoutMs,
        executionId: state.executionId,
      });
      resolve({
        ok: false,
        error: {
          code: 'stage_timeout',
          message: `Stage ${stage.stageId} exceeded timeoutMs ${timeoutMs}`,
        },
      });
    }, timeoutMs);
  });

  const result = await Promise.race([runFactoryStage(stage, state, definition), timeoutPromise]);
  clearTimeout(timer);
  return result;
}

/**
 * @param {object} stage
 * @param {object} state
 */
function validateStageRequiredArtifacts(stage, state) {
  const required = Array.isArray(stage.requiredArtifacts) ? stage.requiredArtifacts : [];
  const output = state.stageOutputs?.[stage.stageId] ?? {};
  return required.filter((key) => {
    const val = output[key] ?? getPath(output, key);
    return val == null || (typeof val === 'string' && !val.trim());
  });
}

/**
 * @param {object} stage
 * @param {object} state
 */
function validateRequiredArtifacts(stage, state) {
  const required = Array.isArray(stage.requiredArtifacts) ? stage.requiredArtifacts : [];
  if (!required.length) return [];

  const missing = [];
  for (const key of required) {
    let found = false;
    for (const out of Object.values(state.stageOutputs ?? {})) {
      if (out && typeof out === 'object' && out[key] != null) {
        found = true;
        break;
      }
    }
    if (!found) missing.push(key);
  }
  return missing;
}

async function runFactoryStage(stage, state, definition) {
  const envelope = {
    intent: state.intent,
    context: state.context,
    stageOutputs: state.stageOutputs,
    missionId: state.missionId,
    userId: state.userId,
  };

  const ownedCtx = markRuntimeOwnedContext(
    {
      missionId: state.missionId,
      userId: state.userId,
      storeId: state.context?.storeId ?? null,
      source: `factory:${state.factoryId}`,
      runtimeOwned: true,
      performerRuntimeOwned: true,
      factoryId: state.factoryId,
      stageId: stage.stageId,
    },
    `factory:${state.executionId}:${stage.stageId}`,
  );

  if (stage.stageId === definition.artifactPolicy?.finalizeStageId || stage.stageId === 'artifact_finalize') {
    return finalizeFactoryArtifactFromPolicy(stage, state, definition);
  }

  if (stage.builtinStage) {
    const handler = getFactoryStageHandler(state.factoryId, stage.stageId);
    if (!handler) {
      return {
        ok: false,
        error: {
          code: 'builtin_handler_missing',
          message: `No stage handler registered for ${state.factoryId}:${stage.stageId}`,
        },
      };
    }
    return handler(stage, state, definition, ownedCtx);
  }

  if (stage.skillName) {
    return {
      ok: false,
      error: { code: 'skill_not_supported_v1', message: `Skill stages not yet supported: ${stage.skillName}` },
    };
  }

  if (!stage.toolName) {
    return { ok: true, output: {} };
  }

  const toolInput = resolveInputMapping(stage.inputMapping ?? {}, envelope);
  const maxAttempts = stage.retryPolicy?.maxAttempts ?? 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await dispatchTool(stage.toolName, toolInput, ownedCtx);
    if (result?.status === 'ok') {
      const rawOutput = result.output ?? {};
      const mapped = applyOutputMapping(rawOutput, stage.outputMapping);
      return { ok: true, output: { ...rawOutput, ...mapped } };
    }
    lastError = result?.error ?? { message: `Tool ${stage.toolName} failed` };
    if (attempt < maxAttempts && stage.retryPolicy?.backoffMs) {
      await sleep(stage.retryPolicy.backoffMs);
    }
  }

  return {
    ok: false,
    error: {
      code: lastError?.code ?? 'tool_failed',
      message: lastError?.message ?? `Stage ${stage.stageId} failed`,
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} stage
 */
function resolveApprovalPauseStatus(stage) {
  if (stage.approvalKind === 'final_asset') {
    return FACTORY_STATUS_AWAITING_FINAL_ASSET_APPROVAL;
  }
  return FACTORY_STATUS_AWAITING_APPROVAL;
}
