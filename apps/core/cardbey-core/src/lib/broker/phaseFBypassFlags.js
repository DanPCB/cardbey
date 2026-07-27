/**
 * Phase F — legacy bypass closure flags (default OFF for blocking; telemetry ON).
 * @see docs/IMPACT_REPORT_PHASE_F_LEGACY_BYPASS.md
 */

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Record bypass hits on guarded surfaces (additive; no behavior change). Default: true */
export function isPhaseFBypassTelemetryEnabled() {
  return envTruthy('PHASE_F_BYPASS_TELEMETRY', true);
}

/** Block MCP dispatchTool when context is not runtime-owned. Default: false */
export function isPhaseFBlockMcpDirectDispatchEnabled() {
  return envTruthy('PHASE_F_BLOCK_MCP_DIRECT_DISPATCH', false);
}

/** Route MCP tool calls through executeMissionAction facade. Default: true (Sprint 3) */
export function isPhaseFRouteMcpViaFacadeEnabled() {
  return envTruthy('PHASE_F_ROUTE_MCP_VIA_FACADE', true);
}

/** Block proactive-step legacy fallback (requires ENABLE_RUNTIME_STEP_EXECUTION). Default: false */
export function isPhaseFBlockProactiveStepLegacyEnabled() {
  return envTruthy('PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY', false);
}

/** Block draft-store runway mutations without mission context (future). Default: false */
export function isPhaseFBlockDraftStoreRunwayEnabled() {
  return envTruthy('PHASE_F_BLOCK_DRAFT_STORE_RUNWAY', false);
}

/** Route Intake V1 tool calls through executeMissionAction facade. Default: true (Sprint 3) */
export function isPhaseFRouteIntakeV1ViaFacadeEnabled() {
  return envTruthy('PHASE_F_ROUTE_INTAKE_V1_VIA_FACADE', true);
}

/** Block Intake V1 direct dispatchTool. Default: true (Sprint 3) */
export function isPhaseFBlockIntakeV1DirectDispatchEnabled() {
  return envTruthy('PHASE_F_BLOCK_INTAKE_V1_DIRECT_DISPATCH', true);
}
