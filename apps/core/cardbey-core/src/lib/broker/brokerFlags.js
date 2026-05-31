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

/** Phase 2.3-A: agent governance read-only APIs. Default OFF. */
export function isPerformerAgentGovernanceEnabled() {
  return envTruthy('PERFORMER_AGENT_GOVERNANCE', false);
}

/** Phase 2.3-B: orchestration stability metrics + safeMissionUpdate retries. Default OFF. */
export function isPerformerOrchestrationStabilityEnabled() {
  return envTruthy('PERFORMER_ORCHESTRATION_STABILITY', false);
}

/** Phase 2.3-B: critical MissionPipeline / MissionPipelineStep write hardening. Default OFF. */
export function isPerformerPipelineWriteHardeningEnabled() {
  return envTruthy('PERFORMER_PIPELINE_WRITE_HARDENING', false);
}

/** Phase 2.3-C: stream-first runtime observability. Default OFF. */
export function isPerformerStreamFirstRuntimeEnabled() {
  return envTruthy('PERFORMER_STREAM_FIRST_RUNTIME', false);
}

/** Phase 2.3-C: in-memory runtime snapshot cache. Default OFF. */
export function isPerformerRuntimeSnapshotCacheEnabled() {
  return envTruthy('PERFORMER_RUNTIME_SNAPSHOT_CACHE', false);
}

/** Phase 2.3-C: adaptive polling guidance. Default OFF. */
export function isPerformerAdaptivePollingEnabled() {
  return envTruthy('PERFORMER_ADAPTIVE_POLLING', false);
}

/** Phase 2.3-E: mission pipeline write isolation umbrella. Default OFF. */
export function isPerformerMissionPipelineWriteIsolationEnabled() {
  return envTruthy('PERFORMER_MISSION_PIPELINE_WRITE_ISOLATION', false);
}

/** Phase 2.3-F: SQLite authority write serialization lane. Default OFF. */
export function isPerformerSqliteRuntimeWriteSerializationEnabled() {
  return envTruthy('PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION', false);
}

/** Phase 2.3-F2: mission create burst hardening. Default OFF. */
export function isPerformerMissionCreateBurstHardeningEnabled() {
  return envTruthy('PERFORMER_MISSION_CREATE_BURST_HARDENING', false);
}
