/**
 * Performer Runtime — feature flags (Phase 1.5).
 * All blocking flags default OFF; warn/stream defaults ON.
 */

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
  return envTruthy('PERFORMER_RUNTIME_ENABLED', false);
}

/** Route mission pipeline steps through runtime facade. */
export function isPerformerRuntimePipelineFacadeEnabled() {
  return envTruthy('PERFORMER_RUNTIME_PIPELINE_FACADE', false);
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
