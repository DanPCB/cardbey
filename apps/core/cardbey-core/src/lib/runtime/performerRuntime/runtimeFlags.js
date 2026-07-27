/**
 * Performer Runtime — feature flags (Phase 1.5).
 * Execution authority flags delegate to executionMode.js (Phase 9).
 */

import {
  isRuntimeStepExecutionEnabled,
  isPerformerRuntimeKernelEnabled,
  isSharedRuntimeToolRegistryEnabled,
  isPerformerRuntimeEnabled as executionModePerformerRuntimeEnabled,
  isPerformerRuntimePipelineFacadeEnabled as executionModePipelineFacadeEnabled,
} from '../executionMode.js';

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Route Performer execution through performerRuntime.execute(). */
export function isPerformerRuntimeEnabled() {
  return executionModePerformerRuntimeEnabled();
}

/** Route mission pipeline steps through runtime facade (orchestrator always uses kernel since Phase F). */
export function isPerformerRuntimePipelineFacadeEnabled() {
  return executionModePipelineFacadeEnabled();
}

/** Emit runtime.* stream events to blackboard + SSE. */
export function isPerformerRuntimeUnifiedStreamEnabled() {
  return envTruthy('PERFORMER_RUNTIME_UNIFIED_STREAM', true);
}

/** Probe orphan executions (dispatch outside runtime ownership). */
export function isPerformerRuntimeOwnershipWarnEnabled() {
  return envTruthy('PERFORMER_RUNTIME_OWNERSHIP_WARN', true);
}

/** Block dispatch when runtime ownership missing. */
export function isPerformerRuntimeOwnershipBlockEnabled() {
  return envTruthy('PERFORMER_RUNTIME_OWNERSHIP_BLOCK', false);
}

/** Persist runtime snapshot into Mission.context.performerRuntime. */
export function isPerformerRuntimeStatePersistEnabled() {
  return envTruthy('PERFORMER_RUNTIME_STATE_PERSIST', true);
}

/** Persist canonical execution records into Mission.context.performerExecutionRecords. */
export function isPerformerExecutionRecordsPersistEnabled() {
  return envTruthy('PERFORMER_EXECUTION_RECORDS_PERSIST', true);
}

/** Route proactive mission steps through performerRuntimeKernel.executeMissionStep. */
export { isRuntimeStepExecutionEnabled };

/** Use shared runtimeToolRegistry for tool validation. */
export { isSharedRuntimeToolRegistryEnabled };

/** Master switch for Runtime Kernel step authority layer. */
export { isPerformerRuntimeKernelEnabled };
