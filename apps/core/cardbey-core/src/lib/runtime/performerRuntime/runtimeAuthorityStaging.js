/**
 * Runtime authority staging — rollout diagnostics, bypass metrics, ownership probes.
 * Read-only / additive; does not change execution outcomes unless flags already enabled.
 */

import {
  isBrokerBlockDirectActionEnabled,
  isBrokerBlockOrchestraWithMissionEnabled,
  isBrokerDirectViaFacadeEnabled,
  isBrokerExecutionTelemetryEnabled,
  isBrokerTelemetryRequired,
} from '../../broker/brokerFlags.js';
import { getExecutionMode, getExecutionModeProfile } from '../executionMode.js';
import {
  isPerformerRuntimeEnabled,
  isPerformerRuntimeOwnershipBlockEnabled,
  isPerformerRuntimeOwnershipWarnEnabled,
  isPerformerRuntimePipelineFacadeEnabled,
  isPerformerRuntimeStatePersistEnabled,
  isPerformerRuntimeUnifiedStreamEnabled,
  isPerformerExecutionRecordsPersistEnabled,
} from './runtimeFlags.js';
import { emitHealthProbe } from '../../telemetry/healthProbes.js';

const AUTHORITY_PROBE_TAG = 'broker.runtime.authority';
const BYPASS_PROBE_TAG = 'broker.runtime.bypass';
const DUPLICATION_PROBE_TAG = 'broker.runtime.duplication';

/** @typedef {'A'|'B'|'C'|'D'|'E'|'BASE'} RolloutStage */

/**
 * Recommended rollout sequence (staging → production).
 * @returns {RolloutStage}
 */
export function getRuntimeAuthorityRolloutStage() {
  if (isPerformerRuntimeOwnershipBlockEnabled()) return 'E';
  if (isBrokerBlockDirectActionEnabled()) return 'D';
  if (isPerformerRuntimePipelineFacadeEnabled()) return 'C';
  if (isPerformerRuntimeEnabled()) return 'B';
  if (isBrokerDirectViaFacadeEnabled()) return 'A';
  return 'BASE';
}

/** In-process counters (reset on process restart). */
const metrics = {
  bypassDirectDispatch: 0,
  bypassFacade: 0,
  bypassRuntimeKernel: 0,
  orphanWarnings: 0,
  ownershipBlocks: 0,
  duplicationWarnings: 0,
  telemetryEmitted: 0,
  telemetrySkippedNested: 0,
  authorityProbes: 0,
  directFacadeExecutions: 0,
  executionFailures: 0,
  runtimeAuthorityPathUsed: 0,
  runtimeAuthorityBypass: 0,
};

/**
 * @param {keyof typeof metrics} key
 * @param {number} [delta]
 */
export function incrementRuntimeAuthorityMetric(key, delta = 1) {
  if (typeof metrics[key] !== 'number') return;
  metrics[key] += delta;
}

/**
 * @returns {typeof metrics}
 */
export function getRuntimeAuthorityMetrics() {
  return { ...metrics };
}

/**
 * Reset metrics (tests only).
 */
export function resetRuntimeAuthorityMetrics() {
  for (const k of Object.keys(metrics)) {
    metrics[/** @type {keyof typeof metrics} */ (k)] = 0;
  }
}

/**
 * @param {string} bypassKind
 * @param {Record<string, unknown>} [details]
 */
export function recordRuntimeBypass(bypassKind, details = {}) {
  const kind = typeof bypassKind === 'string' ? bypassKind.trim() : 'unknown';
  if (kind === 'direct_dispatch') incrementRuntimeAuthorityMetric('bypassDirectDispatch');
  else if (kind === 'legacy_intake') incrementRuntimeAuthorityMetric('bypassFacade');
  else if (kind === 'no_runtime_kernel') incrementRuntimeAuthorityMetric('bypassRuntimeKernel');

  emitHealthProbe(BYPASS_PROBE_TAG, {
    status: 'warn',
    bypassKind: kind,
    rolloutStage: getRuntimeAuthorityRolloutStage(),
    ...details,
  });
}

/**
 * @param {Record<string, unknown>} snapshot
 */
export function emitRuntimeAuthorityProbe(snapshot) {
  incrementRuntimeAuthorityMetric('authorityProbes');
  emitHealthProbe(AUTHORITY_PROBE_TAG, {
    status: 'pass',
    rolloutStage: getRuntimeAuthorityRolloutStage(),
    ...snapshot,
  });
}

/**
 * Snapshot of env flags + metrics for staging dashboards and GET /api/broker/runtime-authority.
 */
export function getRuntimeAuthoritySnapshot() {
  const stage = getRuntimeAuthorityRolloutStage();
  const execution = getExecutionModeProfile();
  return {
    ok: true,
    rolloutStage: stage,
    executionMode: getExecutionMode(),
    executionModeSource: execution.source,
    rawEnv: {
      EXECUTION_MODE: process.env.EXECUTION_MODE ?? null,
      BROKER_DIRECT_VIA_FACADE: process.env.BROKER_DIRECT_VIA_FACADE ?? null,
      BROKER_EXECUTION_TELEMETRY: process.env.BROKER_EXECUTION_TELEMETRY ?? null,
      BROKER_BLOCK_DIRECT_ACTION: process.env.BROKER_BLOCK_DIRECT_ACTION ?? null,
      PERFORMER_RUNTIME_PIPELINE_FACADE: process.env.PERFORMER_RUNTIME_PIPELINE_FACADE ?? null,
    },
    rolloutSequence: {
      A: 'BROKER_DIRECT_VIA_FACADE=true',
      B: 'PERFORMER_RUNTIME_ENABLED=true',
      C: 'PERFORMER_RUNTIME_PIPELINE_FACADE=true',
      D: 'BROKER_BLOCK_DIRECT_ACTION=true',
      E: 'PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true',
    },
    flags: {
      broker: {
        executionTelemetry: isBrokerExecutionTelemetryEnabled(),
        telemetryRequired: isBrokerTelemetryRequired(),
        directViaFacade: isBrokerDirectViaFacadeEnabled(),
        blockDirectAction: isBrokerBlockDirectActionEnabled(),
        blockOrchestraWithMission: isBrokerBlockOrchestraWithMissionEnabled(),
      },
      performerRuntime: {
        enabled: isPerformerRuntimeEnabled(),
        pipelineFacade: isPerformerRuntimePipelineFacadeEnabled(),
        unifiedStream: isPerformerRuntimeUnifiedStreamEnabled(),
        ownershipWarn: isPerformerRuntimeOwnershipWarnEnabled(),
        ownershipBlock: isPerformerRuntimeOwnershipBlockEnabled(),
        statePersist: isPerformerRuntimeStatePersistEnabled(),
        executionRecordsPersist: isPerformerExecutionRecordsPersistEnabled(),
        duplicationDetect: isPerformerRuntimeDuplicationDetectEnabled(),
      },
    },
    metrics: getRuntimeAuthorityMetrics(),
    recommendations: buildRolloutRecommendations(stage),
  };
}

/**
 * @param {RolloutStage} stage
 */
function buildRolloutRecommendations(stage) {
  const next =
    stage === 'BASE'
      ? 'Enable Stage A: BROKER_DIRECT_VIA_FACADE=true in staging; verify broker.execution on intake direct tools.'
      : stage === 'A'
        ? 'Enable Stage B: PERFORMER_RUNTIME_ENABLED=true; confirm performerRuntime.execute wraps intake dispatch.'
        : stage === 'B'
          ? 'Enable Stage C: PERFORMER_RUNTIME_PIPELINE_FACADE=true; run mission pipeline smoke tests.'
          : stage === 'C'
            ? 'Enable Stage D: BROKER_BLOCK_DIRECT_ACTION=true after orphan map is empty in staging logs.'
            : stage === 'D'
              ? 'Enable Stage E: PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true; rollback if production workflows block.'
              : 'Single runway enforcement active; monitor broker.runtime.violation and duplication probes.';

  return {
    currentStage: stage,
    nextStep: next,
    rollback:
      'Unset enforcement flags in reverse order (E→D→C→B→A); keep BROKER_EXECUTION_TELEMETRY=true for visibility.',
  };
}

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Detect duplicate tool dispatch within a short window (staging only). */
export function isPerformerRuntimeDuplicationDetectEnabled() {
  return envTruthy('PERFORMER_RUNTIME_DUPLICATION_DETECT', true);
}

/** @type {Map<string, { count: number, firstAt: number, lastAt: number }>} */
const recentExecutionKeys = new Map();

const DUPLICATION_WINDOW_MS = 15_000;
const DUPLICATION_MAX_KEYS = 500;

/**
 * @param {{
 *   missionId?: string|null;
 *   toolName?: string|null;
 *   actionId?: string|null;
 *   source?: string|null;
 *   executionId?: string|null;
 * }} fields
 * @returns {{ duplicate: boolean, key?: string, priorCount?: number }}
 */
export function detectExecutionDuplication(fields) {
  if (!isPerformerRuntimeDuplicationDetectEnabled()) {
    return { duplicate: false };
  }

  const missionId =
    typeof fields.missionId === 'string' && fields.missionId.trim() ? fields.missionId.trim() : '';
  const toolName =
    typeof fields.toolName === 'string' && fields.toolName.trim() ? fields.toolName.trim() : '';
  const actionId =
    typeof fields.actionId === 'string' && fields.actionId.trim() ? fields.actionId.trim() : '';
  const source = typeof fields.source === 'string' ? fields.source.trim() : 'unknown';

  if (!missionId && !toolName && !actionId) {
    return { duplicate: false };
  }

  const key = `${missionId || 'no-mission'}|${toolName || actionId || 'unknown'}|${source}`;
  const now = Date.now();
  pruneDuplicationKeys(now);

  const existing = recentExecutionKeys.get(key);
  if (existing && now - existing.firstAt < DUPLICATION_WINDOW_MS) {
    existing.count += 1;
    existing.lastAt = now;
    incrementRuntimeAuthorityMetric('duplicationWarnings');
    emitHealthProbe(DUPLICATION_PROBE_TAG, {
      status: 'warn',
      key,
      priorCount: existing.count,
      missionId: missionId || null,
      toolName: toolName || null,
      actionId: actionId || null,
      source,
      executionId: fields.executionId ?? null,
    });
    return { duplicate: true, key, priorCount: existing.count };
  }

  recentExecutionKeys.set(key, { count: 1, firstAt: now, lastAt: now });
  return { duplicate: false, key };
}

/**
 * @param {number} now
 */
function pruneDuplicationKeys(now) {
  if (recentExecutionKeys.size <= DUPLICATION_MAX_KEYS) {
    for (const [k, v] of recentExecutionKeys) {
      if (now - v.lastAt > DUPLICATION_WINDOW_MS) recentExecutionKeys.delete(k);
    }
    return;
  }
  const sorted = [...recentExecutionKeys.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt);
  const remove = sorted.slice(0, Math.floor(DUPLICATION_MAX_KEYS / 2));
  for (const [k] of remove) recentExecutionKeys.delete(k);
}

/**
 * Reset duplication map (tests only).
 */
export function resetExecutionDuplicationState() {
  recentExecutionKeys.clear();
}
