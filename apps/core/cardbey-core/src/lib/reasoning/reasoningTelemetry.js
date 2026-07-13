/**
 * Phase 2 reasoning loop — in-process telemetry for soak and rollout monitoring.
 */

import { Features } from '../../config/features.js';
import { isReasoningEnabledForMission } from './reasoningRollout.js';
import { listReasoningCapabilities } from './reasoningCapabilityRegistry.js';

/** @type {Record<string, number>} */
const metrics = {
  stepsTotal: 0,
  stepsSkipped: 0,
  stepsFailed: 0,
  observationsTriggered: 0,
  replansTriggered: 0,
  capabilitiesExecuted: 0,
  topologyDeferred: 0,
  verificationFailed: 0,
  terminalResolved: 0,
  needsInputBlocked: 0,
};

/** @type {Array<Record<string, unknown>>} */
const recentSteps = [];
const MAX_RECENT = 50;

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} result
 */
export function recordReasoningStep(missionId, result = {}) {
  if (!Features.phase2.telemetry) return;

  metrics.stepsTotal += 1;
  if (result.skipped) metrics.stepsSkipped += 1;
  if (result.ok === false) metrics.stepsFailed += 1;
  if (result.action === 'observe') metrics.observationsTriggered += 1;
  if (result.replanned) metrics.replansTriggered += 1;
  if (result.deferTopology) metrics.topologyDeferred += 1;
  if (result.verification?.ok === false) metrics.verificationFailed += 1;
  if (result.terminalOutcome) metrics.terminalResolved += 1;
  if (result.actionResult?.status === 'needs_input') metrics.needsInputBlocked += 1;
  if (result.actionResult?.status === 'ok' && result.nextPlan?.capabilityId) {
    metrics.capabilitiesExecuted += 1;
  }

  recentSteps.push({
    at: new Date().toISOString(),
    missionId,
    ok: result.ok ?? null,
    phase: result.graph?.phase ?? null,
    capabilityId: result.nextPlan?.capabilityId ?? null,
    verificationOk: result.verification?.ok ?? null,
    replanned: result.replanned === true,
    deferTopology: result.deferTopology === true,
  });
  if (recentSteps.length > MAX_RECENT) recentSteps.shift();

  if (Features.phase2.reasoningStepLog && process.env.NODE_ENV !== 'production') {
    console.info('[ReasoningTelemetry] step', recentSteps[recentSteps.length - 1]);
  }
}

export function getReasoningMetrics() {
  return { ...metrics };
}

export function getRecentReasoningSteps(limit = 20) {
  return recentSteps.slice(-Math.max(1, Math.min(limit, MAX_RECENT)));
}

export function resetReasoningTelemetryForTests() {
  for (const key of Object.keys(metrics)) {
    metrics[key] = 0;
  }
  recentSteps.length = 0;
}

/**
 * Snapshot for GET /api/broker/phase2-reasoning and mission status routes.
 *
 * @param {string} [missionId]
 */
export function getPhase2ReasoningSnapshot(missionId = '') {
  const rollout = missionId ? isReasoningEnabledForMission(missionId) : null;
  return {
    ok: true,
    flags: {
      activeReasoning: Features.phase2.activeReasoning,
      topologyAsSnapshot: Features.phase2.topologyAsSnapshot,
      stagingOnly: Features.phase2.stagingOnly,
      rolloutPercent: Features.phase2.rolloutPercent,
      telemetry: Features.phase2.telemetry,
      reasoningStepLog: Features.phase2.reasoningStepLog,
    },
    metrics: getReasoningMetrics(),
    recentSteps: getRecentReasoningSteps(15),
    capabilities: listReasoningCapabilities(),
    missionRollout: rollout,
  };
}
