/**
 * Phase F bypass staging — in-process metrics + snapshot for soak/audit.
 */

import {
  isPhaseFBypassTelemetryEnabled,
  isPhaseFBlockDraftStoreRunwayEnabled,
  isPhaseFBlockMcpDirectDispatchEnabled,
  isPhaseFBlockProactiveStepLegacyEnabled,
  isPhaseFRouteMcpViaFacadeEnabled,
} from './phaseFBypassFlags.js';
import {
  isBrokerBlockOrchestraWithMissionEnabled,
} from './brokerFlags.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';

const PROBE_TAG = 'broker.phase_f.bypass';

/** @type {Record<string, number>} */
const metrics = {
  orchestraStartWithMission: 0,
  orchestraStartBlocked: 0,
  mcpDirectDispatch: 0,
  mcpFacadeDispatch: 0,
  mcpDispatchBlocked: 0,
  proactiveStepLegacy: 0,
  proactiveStepLegacyBlocked: 0,
  draftStoreDirectMutation: 0,
  draftStoreRunwayBlocked: 0,
};

/**
 * @param {keyof typeof metrics} key
 * @param {number} [delta]
 */
export function incrementPhaseFBypassMetric(key, delta = 1) {
  if (typeof metrics[key] !== 'number') return;
  metrics[key] += delta;
}

/** @returns {typeof metrics} */
export function getPhaseFBypassMetrics() {
  return { ...metrics };
}

/** Reset metrics (tests only). */
export function resetPhaseFBypassMetrics() {
  for (const k of Object.keys(metrics)) {
    metrics[k] = 0;
  }
}

/**
 * @param {string} surface
 * @param {Record<string, unknown>} [details]
 */
export function recordPhaseFBypass(surface, details = {}) {
  if (!isPhaseFBypassTelemetryEnabled()) return;

  const kind = typeof surface === 'string' ? surface.trim() : 'unknown';
  if (kind === 'orchestra_start_with_mission') incrementPhaseFBypassMetric('orchestraStartWithMission');
  else if (kind === 'orchestra_start_blocked') incrementPhaseFBypassMetric('orchestraStartBlocked');
  else if (kind === 'mcp_direct_dispatch') incrementPhaseFBypassMetric('mcpDirectDispatch');
  else if (kind === 'mcp_facade_dispatch') incrementPhaseFBypassMetric('mcpFacadeDispatch');
  else if (kind === 'mcp_dispatch_blocked') incrementPhaseFBypassMetric('mcpDispatchBlocked');
  else if (kind === 'proactive_step_legacy') incrementPhaseFBypassMetric('proactiveStepLegacy');
  else if (kind === 'proactive_step_legacy_blocked') incrementPhaseFBypassMetric('proactiveStepLegacyBlocked');
  else if (kind === 'draft_store_direct_mutation') incrementPhaseFBypassMetric('draftStoreDirectMutation');
  else if (kind === 'draft_store_runway_blocked') incrementPhaseFBypassMetric('draftStoreRunwayBlocked');

  emitHealthProbe(PROBE_TAG, {
    status: 'warn',
    surface: kind,
    ...details,
  });
}

/**
 * Snapshot for GET /api/broker/phase-f-bypass and audit scripts.
 */
export function getPhaseFBypassSnapshot() {
  return {
    ok: true,
    phase: 'F',
    status: 'in_progress',
    telemetryEnabled: isPhaseFBypassTelemetryEnabled(),
    flags: {
      brokerBlockOrchestraWithMission: isBrokerBlockOrchestraWithMissionEnabled(),
      blockMcpDirectDispatch: isPhaseFBlockMcpDirectDispatchEnabled(),
      routeMcpViaFacade: isPhaseFRouteMcpViaFacadeEnabled(),
      blockProactiveStepLegacy: isPhaseFBlockProactiveStepLegacyEnabled(),
      blockDraftStoreRunway: isPhaseFBlockDraftStoreRunwayEnabled(),
    },
    metrics: getPhaseFBypassMetrics(),
    recommendations: {
      measure: 'Keep PHASE_F_BYPASS_TELEMETRY=true; block flags OFF until baseline captured.',
      nextClosure: 'Enable BROKER_BLOCK_ORCHESTRA_WITH_MISSION in staging after orchestra baseline.',
      rollback: 'Unset Phase F block flags; keep telemetry for visibility.',
    },
  };
}
