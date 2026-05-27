/**
 * Agent orchestrator (Phase 2): OpenClaw vs dispatchTool routing; mission loop stays on MissionPipeline.
 * Full sequential execution remains runMissionUntilBlocked + missionPipelineRunner; this module is the extension point.
 */

import { executeMissionAction } from '../execution/executeMissionAction.js';
import { actionIdForTool, withExecutionTelemetry } from '../broker/executionTelemetry.js';

/**
 * @param {string} toolName
 * @param {object} input
 * @param {object} [context]
 * @returns {Promise<import('../toolDispatcher.js').DispatchResult>}
 */
export async function dispatchOpenClawTask(toolName, input = {}, context = undefined) {
  const ctx = context && typeof context === 'object' ? context : {};
  const missionId = ctx.missionId ?? ctx.activeMissionId ?? null;
  try {
    const out = await withExecutionTelemetry({
      actionId: actionIdForTool(toolName),
      toolName,
      source: 'openclaw_bridge',
      missionId,
      run: async () => {
        const { spawnChildAgentForMissionTask } = await import('../agents/childAgentBridge.js');
        return spawnChildAgentForMissionTask({ toolName, input, context: ctx });
      },
      mapResult: (r) => ({
        status: r?.status === 'blocked' ? 'blocked' : r?.status === 'failed' ? 'failed' : 'completed',
        failureCode: r?.error?.code ?? null,
      }),
    });
    if (out?.status === 'ok' || out?.status === 'blocked' || out?.status === 'failed') {
      return out;
    }
    return {
      status: 'failed',
      error: { code: 'OPENCLAW_UNEXPECTED', message: 'OpenClaw bridge returned no status' },
    };
  } catch (e) {
    const message = e?.message || String(e);
    return {
      status: 'failed',
      error: { code: 'OPENCLAW_ERROR', message },
    };
  }
}

/**
 * @param {string} toolName
 * @param {object} input
 * @param {object} [context]
 * @returns {Promise<import('../toolDispatcher.js').DispatchResult>}
 */
export async function dispatchTaskWithAgentHint(toolName, input = {}, context = undefined) {
  const hint = input && typeof input === 'object' && input._agentHint;
  const cleanInput =
    hint && typeof input === 'object'
      ? Object.fromEntries(Object.entries(input).filter(([k]) => k !== '_agentHint'))
      : input;
  const ctx = context && typeof context === 'object' ? { ...context, agentHint: hint } : { agentHint: hint };
  if (hint === 'openclaw') {
    return dispatchOpenClawTask(toolName, cleanInput, ctx);
  }
  if (hint === 'langchain') {
    try {
      const out = await withExecutionTelemetry({
        actionId: actionIdForTool(toolName),
        toolName,
        source: 'langchain_executor',
        missionId: ctx?.missionId ?? null,
        run: async () => {
          const { executeLangChain } = await import('./langchainExecutor.js');
          return executeLangChain({ ...cleanInput, toolName }, ctx);
        },
        mapResult: (r) => ({
          status: r?.status === 'ok' ? 'completed' : 'failed',
          failureCode: r?.error?.code ?? null,
        }),
      });
      if (out?.status === 'ok') return out;
      return {
        status: 'failed',
        error:
          out?.error ?? {
            code: 'LANGCHAIN_FAILED',
            message: 'LangChain executor returned non-ok status',
          },
      };
    } catch (e) {
      return {
        status: 'failed',
        error: { code: 'LANGCHAIN_IMPORT', message: e?.message || String(e) },
      };
    }
  }
  const r = await executeMissionAction({
    actionType: 'dispatch_tool',
    source: 'mission_pipeline',
    missionId: ctx?.missionId ?? null,
    stepId: ctx?.stepId ?? null,
    tenantId: ctx?.tenantId ?? null,
    tenantKey: ctx?.tenantId ?? null,
    userId: ctx?.userId ?? null,
    storeId: ctx?.storeId ?? null,
    intentId: ctx?.intentId ?? null,
    payload: { toolName, input: cleanInput, context: ctx },
  });
  return {
    status: r.status,
    ...(r.output !== undefined && { output: r.output }),
    ...(r.error !== undefined && { error: r.error }),
    ...(r.blocker !== undefined && { blocker: r.blocker }),
  };
}

/**
 * Same contract as runMissionUntilBlocked; dynamic import avoids a runner ↔ orchestrator cycle.
 *
 * @param {string} missionId
 * @param {{ maxSteps?: number }} [options]
 */
export async function runAgentOrchestratedMissionUntilBlocked(missionId, options = {}) {
  const { runMissionUntilBlocked } = await import('../missionPipelineOrchestrator.js');
  return runMissionUntilBlocked(missionId, options);
}
