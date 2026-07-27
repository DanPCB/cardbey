/**
 * Unified mission execution engine — thin facade over existing runners.
 * All execution modes route through here; unifiedDispatch is the HTTP/intake entry.
 */

import { EXECUTION_MODES } from './executionTypes.js';
import { dispatchCreateStoreViaKernel, dispatchCreateCampaignViaKernel } from './kernelPipelineDispatch.js';
import { runMissionUntilBlocked } from '../missionPipelineOrchestrator.js';
import { executeMissionStep } from '../runtime/performerRuntimeKernel.js';
import { respondMissionCheckpointAndResume } from './missionCheckpointRespond.js';
import { emitExecutionNotification, EXECUTION_EVENT_TYPES } from './executionNotificationEmitter.js';

/**
 * @param {object} input
 * @param {import('./executionTypes.js').ExecutionMode} input.mode
 * @param {string} [input.missionId]
 * @param {import('../prisma.js').PrismaClient} [input.prisma]
 * @param {object} [input.user]
 * @param {object} [input.body]
 * @param {string} [input.auditSource]
 * @param {string} [input.source]
 * @param {number} [input.stepNumber]
 * @param {object} [input.proactiveBody]
 * @param {string} [input.stepId]
 * @param {unknown} [input.response]
 * @param {object} [input.data]
 */
export async function executeMission(input = {}) {
  const mode = String(input.mode ?? '').trim();
  const source = String(input.source ?? input.auditSource ?? 'mission_execution_engine').trim();

  if (mode === EXECUTION_MODES.CHECKPOINT_PIPELINE || mode === 'checkpoint_pipeline') {
    const result = await dispatchCreateStoreViaKernel({
      prisma: input.prisma,
      user: input.user,
      missionId: input.missionId,
      body: input.body ?? {},
      auditSource: input.auditSource ?? source,
      source,
    });

    if (result.ok) {
      await emitExecutionNotification(
        EXECUTION_EVENT_TYPES.STARTED,
        { missionId: result.missionId, mode: result.mode, dispatchedVia: 'runtime_kernel' },
        { missionId: result.missionId, source, executionPath: 'kernel_dispatch' },
      );
    }

    return { ...result, executionPath: 'kernel_dispatch', executionMode: mode };
  }

  if (
    mode === EXECUTION_MODES.CAMPAIGN_CHECKPOINT_PIPELINE ||
    mode === 'campaign_checkpoint_pipeline'
  ) {
    const result = await dispatchCreateCampaignViaKernel({
      prisma: input.prisma,
      user: input.user,
      missionId: input.missionId,
      body: input.body ?? {},
      auditSource: input.auditSource ?? source,
      source,
      storeId: input.body?.storeId ?? null,
    });

    if (result.ok) {
      await emitExecutionNotification(
        EXECUTION_EVENT_TYPES.STARTED,
        { missionId: result.missionId, mode: result.mode, dispatchedVia: 'runtime_kernel' },
        { missionId: result.missionId, source, executionPath: 'kernel_dispatch' },
      );
    }

    return { ...result, executionPath: 'kernel_dispatch', executionMode: mode };
  }

  if (mode === EXECUTION_MODES.RUN_PIPELINE || mode === 'run_pipeline') {
    const missionId = String(input.missionId ?? '').trim();
    if (!missionId) {
      return { ok: false, error: 'MISSION_REQUIRED', message: 'run_pipeline requires missionId' };
    }

    await emitExecutionNotification(
      EXECUTION_EVENT_TYPES.STARTED,
      { missionId },
      { missionId, source, executionPath: 'kernel_dispatch' },
    );

    const orchestration = await runMissionUntilBlocked(missionId, input.body?.orchestratorOptions ?? {});
    return {
      ok: orchestration?.ok !== false,
      missionId,
      orchestration,
      executionPath: 'kernel_dispatch',
      executionMode: mode,
    };
  }

  if (mode === EXECUTION_MODES.PROACTIVE_STEP || mode === 'proactive_step') {
    const stepResult = await executeMissionStep(input.proactiveBody ?? input.body ?? {}, {
      source: source || 'mission_execution_engine',
    });
    return {
      ...stepResult,
      executionPath: 'proactive_step',
      executionMode: mode,
    };
  }

  if (mode === 'respond_checkpoint') {
    const prisma = input.prisma;
    if (!prisma) {
      return { ok: false, error: 'PRISMA_REQUIRED', message: 'respond_checkpoint requires prisma' };
    }
    return respondMissionCheckpointAndResume(
      prisma,
      input.missionId,
      input.stepId,
      input.response,
      input.data ?? {},
      { source },
    );
  }

  return {
    ok: false,
    error: 'UNKNOWN_EXECUTION_MODE',
    message: `Unknown execution mode: ${mode}`,
  };
}
