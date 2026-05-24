/**
 * Agent Execution Broker — feature flags (Phase 1).
 * Blocking flags default OFF; telemetry defaults ON (additive).
 */

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Record execution telemetry on dispatch_tool / executeMissionAction paths. */
export function isBrokerExecutionTelemetryEnabled() {
  return envTruthy('BROKER_EXECUTION_TELEMETRY', true);
}

/** Route Performer direct_action through executeMissionAction facade. */
export function isBrokerDirectViaFacadeEnabled() {
  return envTruthy('BROKER_DIRECT_VIA_FACADE', false);
}

/** Reject Performer direct_action tool dispatch (use IntentRequest / pipeline). */
export function isBrokerBlockDirectActionEnabled() {
  return envTruthy('BROKER_BLOCK_DIRECT_ACTION', false);
}

/** Reject POST /api/mi/orchestra/start when request body includes missionId. */
export function isBrokerBlockOrchestraWithMissionEnabled() {
  return envTruthy('BROKER_BLOCK_ORCHESTRA_WITH_MISSION', false);
}

/** Dev/test: throw if telemetry hook was skipped. */
export function isBrokerTelemetryRequired() {
  return envTruthy('BROKER_TELEMETRY_REQUIRED', false);
}
