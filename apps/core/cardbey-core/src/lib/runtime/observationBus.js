/**
 * Observation Bus — mandatory structured event emission for runtime executions.
 * Every kernel execution records an observation for learning and copilot pattern detection.
 */

import { getPrismaClient } from '../prisma.js';
import {
  isRealExecution,
  isSloSuccessState,
  resolveExecutionState,
} from '../telemetry/executionStates.js';

/** @type {Array<object>} */
const observationRing = [];
const MAX_RING = 500;
const MAX_STORED_LATENCY_MS = 120_000;
const SLO_WARN_LATENCY_MS = 5_000;

/** Action types excluded from latency SLO (long-running orchestration, not per-request API). */
export const SLO_EXCLUDED_ACTION_TYPES = new Set([
  'run_pipeline_step',
  'orchestra_start',
  'mission_pipeline',
]);

const SLO_EXCLUDED_ACTION_PREFIXES = ['pipeline:', 'mission_pipeline'];

/**
 * Whether an observation should count toward API latency SLO.
 * @param {{ actionType?: string; intentType?: string; contextSnapshot?: unknown; latency?: number|null }} row
 */
export function isObservationSloEligible(row) {
  const snap =
    row?.contextSnapshot && typeof row.contextSnapshot === 'object' ? row.contextSnapshot : {};
  if (snap.sloEligible === false) return false;

  const action = String(row?.actionType ?? '').trim();
  const intent = String(row?.intentType ?? '').trim();

  if (SLO_EXCLUDED_ACTION_TYPES.has(action) || SLO_EXCLUDED_ACTION_TYPES.has(intent)) {
    return false;
  }

  for (const prefix of SLO_EXCLUDED_ACTION_PREFIXES) {
    if (action.startsWith(prefix) || intent.startsWith(prefix)) return false;
  }

  if (snap.source === 'mission_pipeline' || snap.source === 'orchestra_start') {
    return false;
  }

  return true;
}

/**
 * Failures from circuit breaker / agent health / bulkhead saturation — not user API errors.
 * @param {string | null | undefined} error
 */
export function isInfrastructureSloFailure(error) {
  const msg = String(error ?? '').toLowerCase();
  if (!msg) return false;
  if (msg.includes('circuit ') && msg.includes('is open')) return true;
  if (msg.includes('is not healthy')) return true;
  if (msg.includes('bulkhead ') && msg.includes('queue full')) return true;
  if (msg.includes('bulkhead ') && msg.includes('timeout')) return true;
  return false;
}

/**
 * Permission-hook / smoke-probe failures — not representative user API errors.
 * @param {string | null | undefined} error
 */
export function isPermissionHookFailure(error) {
  const msg = String(error ?? '').toLowerCase();
  if (!msg) return false;
  if (msg.includes('validate_permissions')) return true;
  if (msg.includes('does not have access to store')) return true;
  if (msg.includes('critical hook') && msg.includes('store id required')) return true;
  if (msg.includes('user id required') && msg.includes('critical hook')) return true;
  return false;
}

/**
 * @param {unknown} contextSnapshot
 */
export function isProbeObservationContext(contextSnapshot) {
  const snap =
    contextSnapshot && typeof contextSnapshot === 'object' ? contextSnapshot : {};
  const userId = String(snap.userId ?? '').trim();
  const source = String(snap.source ?? '').trim().toLowerCase();
  if (userId === 'dev-admin' || userId === 'test-user') return true;
  if (source.includes('hook_test') || source === 'slo_probe' || source === 'smoke_test') {
    return true;
  }
  return false;
}

/**
 * Whether an observation counts toward API success-rate SLO.
 * @param {{ outcome?: string; actionType?: string; intentType?: string; contextSnapshot?: unknown; error?: string | null; executionState?: string; isRealExecution?: boolean }} row
 */
export function isObservationSuccessRateEligible(row) {
  if (!isObservationSloEligible(row)) return false;

  const executionState = String(row.executionState ?? '').trim();
  if (row.isRealExecution === false) return false;
  if (executionState && !isRealExecution(executionState)) return false;

  if (row.outcome === 'success') {
    return executionState ? isSloSuccessState(executionState) : true;
  }
  if (isInfrastructureSloFailure(row.error)) return false;
  if (isPermissionHookFailure(row.error)) return false;
  if (isProbeObservationContext(row.contextSnapshot)) return false;
  const snap =
    row?.contextSnapshot && typeof row.contextSnapshot === 'object' ? row.contextSnapshot : {};
  if (snap.sloEligible === false) return false;
  return true;
}

/**
 * Normalize per-request latency in milliseconds (never cumulative skill duration).
 * @param {Record<string, unknown>} [metadata]
 * @returns {number|null}
 */
export function normalizeObservationLatencyMs(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const raw =
    typeof meta.latency === 'number'
      ? meta.latency
      : typeof meta.latencyMs === 'number'
        ? meta.latencyMs
        : typeof meta.durationMs === 'number'
          ? meta.durationMs
          : null;

  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;

  const ms = Math.round(raw);
  if (ms > SLO_WARN_LATENCY_MS) {
    console.warn(`[ObservationBus] Slow execution: ${ms}ms`);
  }
  return Math.min(ms, MAX_STORED_LATENCY_MS);
}

/** @type {Map<string, { success: number; failure: number }>} */
const learningWeights = new Map();

/** Skip PatternWeight DB writes when table is missing (staging / pending migration). */
let patternWeightTableMissing = false;
let patternWeightTableMissingWarned = false;

function isMissingPatternWeightTableError(err) {
  const msg = err?.message || String(err || '');
  return (
    err?.code === 'P2021' ||
    (msg.includes('PatternWeight') && (msg.includes('does not exist') || msg.includes('no such table')))
  );
}

function weightKey(intentType, actionType) {
  return `${String(intentType ?? 'unknown')}:${String(actionType ?? 'unknown')}`;
}

/**
 * @param {object} execution
 * @param {string|null} [execution.missionId]
 * @param {{ type?: string }} [execution.intent]
 * @param {string} [execution.action]
 * @param {{ success?: boolean; error?: string|null }} [execution.result]
 * @param {Record<string, unknown>} [execution.metadata]
 */
export class ObservationBus {
  async emit(execution) {
    const intentType = String(execution?.intent?.type ?? 'unknown').trim() || 'unknown';
    const actionType = String(execution?.action ?? intentType).trim() || intentType;
    const success = execution?.result?.success !== false;
    const outcome = success ? 'success' : 'failure';
    const metadata = execution?.metadata && typeof execution.metadata === 'object' ? execution.metadata : {};
    const latency = normalizeObservationLatencyMs(metadata);
    const executionState = resolveExecutionState({
      metadata,
      result: execution?.result,
      actionType,
    });
    const realExecution = isRealExecution(executionState);

    const row = {
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      missionId: execution?.missionId ? String(execution.missionId) : null,
      intentType,
      actionType,
      executionState,
      isRealExecution: realExecution,
      outcome,
      error: execution?.result?.error ? String(execution.result.error) : null,
      latency,
      tokensUsed: typeof metadata.tokens === 'number' ? metadata.tokens : null,
      cost: typeof metadata.cost === 'number' ? metadata.cost : null,
      confidence: typeof metadata.confidence === 'number' ? metadata.confidence : null,
      contextSnapshot: {
        signals: Array.isArray(metadata.activeSignals) ? metadata.activeSignals : [],
        storeId: metadata.storeId ?? null,
        userId: metadata.userId ?? null,
        userType: metadata.actorType ?? null,
        source: metadata.source ?? null,
        executionState,
        isRealExecution: realExecution,
        sloEligible: isObservationSloEligible({
          actionType,
          intentType,
          contextSnapshot: null,
          latency,
          executionState,
          isRealExecution: realExecution,
        }) && metadata.sloEligible !== false,
      },
      createdAt: new Date().toISOString(),
    };

    observationRing.push(row);
    if (observationRing.length > MAX_RING) observationRing.shift();

    await this.updateLearningWeights(row);

    try {
      const prisma = getPrismaClient();
      if (prisma?.observation?.create) {
        const created = await prisma.observation.create({
          data: {
            missionId: row.missionId,
            intentType: row.intentType,
            actionType: row.actionType,
            executionState: row.executionState,
            isRealExecution: row.isRealExecution,
            outcome: row.outcome,
            error: row.error,
            latency: row.latency,
            tokensUsed: row.tokensUsed,
            cost: row.cost,
            confidence: row.confidence,
            contextSnapshot: row.contextSnapshot,
          },
        });
        row.id = created.id;
        return created;
      }
    } catch (error) {
      console.error('[ObservationBus] Failed to persist observation:', error?.message || error);
      console.warn('[ObservationBus] CRITICAL: Learning data may be lost (in-memory ring retained)');
    }

    return row;
  }

  /**
   * @param {object} observation
   */
  async updateLearningWeights(observation) {
    if (observation.isRealExecution === false) return;
    const key = weightKey(observation.intentType, observation.actionType);
    const current = learningWeights.get(key) ?? { success: 0, failure: 0 };
    if (observation.outcome === 'success') current.success += 1;
    else current.failure += 1;
    learningWeights.set(key, current);

    if (patternWeightTableMissing) return;

    try {
      const prisma = getPrismaClient();
      if (!prisma?.patternWeight?.upsert) return;

      const patternId = `obs:${key}`;
      const total = current.success + current.failure;
      const weight = total > 0 ? current.success / total : 1;

      await prisma.patternWeight.upsert({
        where: { patternId },
        create: {
          patternId,
          intent: observation.intentType,
          matchedSkill: observation.actionType,
          weight,
          adjustmentHistory: [
            {
              at: new Date().toISOString(),
              outcome: observation.outcome,
              weight,
            },
          ],
        },
        update: {
          weight,
          lastAdjusted: new Date(),
        },
      });
    } catch (err) {
      if (isMissingPatternWeightTableError(err)) {
        patternWeightTableMissing = true;
        if (!patternWeightTableMissingWarned) {
          patternWeightTableMissingWarned = true;
          console.warn(
            '[ObservationBus] PatternWeight table missing — skipping DB weight persistence (run prisma migrate deploy).',
          );
        }
        return;
      }
      /* non-fatal — in-memory weights still updated */
    }
  }

  async getLatest(limit = 20) {
    try {
      const prisma = getPrismaClient();
      if (prisma?.observation?.findMany) {
        return prisma.observation.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
      }
    } catch {
      /* fall through */
    }
    return [...observationRing].slice(-limit).reverse();
  }

  getLearningWeightsForTests() {
    return new Map(learningWeights);
  }

  resetForTests() {
    observationRing.length = 0;
    learningWeights.clear();
    patternWeightTableMissing = false;
    patternWeightTableMissingWarned = false;
  }
}

const observationBus = new ObservationBus();
export default observationBus;

export function getObservationRingForTests() {
  return [...observationRing];
}
