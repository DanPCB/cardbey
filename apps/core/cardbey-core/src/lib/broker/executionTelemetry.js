/**
 * Agent Execution Broker — execution telemetry standard (Phase 1).
 * Persists via emitHealthProbe tag `broker.execution` (TelemetryProbe table).
 */

import { randomUUID } from 'node:crypto';
import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { isBrokerExecutionTelemetryEnabled, isBrokerTelemetryRequired } from './brokerFlags.js';

/**
 * @typedef {'started' | 'completed' | 'failed' | 'blocked' | 'retrying'} ExecutionTelemetryStatus
 */

/**
 * @typedef {object} ExecutionTelemetryRecord
 * @property {string} executionId
 * @property {string|null} [missionId]
 * @property {string|null} [intentId]
 * @property {string|null} [pipelineStepId]
 * @property {string} actionId
 * @property {string|null} [capabilityFamily]
 * @property {string|null} [agentId]
 * @property {string|null} [toolName]
 * @property {ExecutionTelemetryStatus} status
 * @property {string} startedAt
 * @property {string|null} [completedAt]
 * @property {number|null} [durationMs]
 * @property {object|null} [cost]
 * @property {number|null} [outputQuality]
 * @property {string|null} [downstreamOutcome]
 * @property {string|null} [failureCode]
 * @property {number} [retryCount]
 * @property {boolean|null} [userAccepted]
 * @property {string|null} [conversionSignal]
 * @property {string} source
 * @property {string|null} [routingStrategy]
 * @property {string|null} [runtimeId]
 * @property {string|null} [executionSource]
 * @property {string|null} [capabilityId]
 */

const TELEMETRY_TAG = 'broker.execution';

/**
 * @param {string} toolName
 * @returns {string}
 */
export function actionIdForTool(toolName) {
  const name = typeof toolName === 'string' ? toolName.trim() : '';
  return name ? `tool:${name}` : 'tool:unknown';
}

/**
 * @param {Partial<ExecutionTelemetryRecord> & { actionId: string; source: string; status: ExecutionTelemetryStatus }} fields
 */
export function recordExecutionTelemetry(fields) {
  if (!isBrokerExecutionTelemetryEnabled()) {
    if (isBrokerTelemetryRequired()) {
      throw new Error('[Broker] BROKER_TELEMETRY_REQUIRED but telemetry disabled');
    }
    return null;
  }

  const executionId =
    typeof fields.executionId === 'string' && fields.executionId.trim()
      ? fields.executionId.trim()
      : randomUUID();

  const status = fields.status || 'completed';
  const probeStatus =
    status === 'failed' ? 'fail' : status === 'blocked' ? 'warn' : 'pass';

  const payload = {
    executionId,
    missionId: fields.missionId ?? null,
    intentId: fields.intentId ?? null,
    pipelineStepId: fields.pipelineStepId ?? null,
    actionId: fields.actionId,
    capabilityFamily: fields.capabilityFamily ?? null,
    agentId: fields.agentId ?? null,
    toolName: fields.toolName ?? null,
    status,
    startedAt: fields.startedAt ?? new Date().toISOString(),
    completedAt: fields.completedAt ?? null,
    durationMs: fields.durationMs ?? null,
    cost: fields.cost ?? null,
    outputQuality: fields.outputQuality ?? null,
    downstreamOutcome: fields.downstreamOutcome ?? null,
    failureCode: fields.failureCode ?? null,
    retryCount: fields.retryCount ?? 0,
    userAccepted: fields.userAccepted ?? null,
    conversionSignal: fields.conversionSignal ?? null,
    source: fields.source,
    routingStrategy: fields.routingStrategy ?? null,
    runtimeId: fields.runtimeId ?? null,
    executionSource: fields.executionSource ?? null,
    capabilityId: fields.capabilityId ?? fields.capabilityFamily ?? null,
  };

  emitHealthProbe(TELEMETRY_TAG, {
    status: probeStatus,
    missionId: payload.missionId,
    ...payload,
  });

  return executionId;
}

/**
 * Wrap async execution with started/completed telemetry.
 *
 * @template T
 * @param {{
 *   actionId: string;
 *   source: string;
 *   toolName?: string;
 *   missionId?: string|null;
 *   intentId?: string|null;
 *   capabilityFamily?: string|null;
 *   routingStrategy?: string|null;
 *   run: () => Promise<T>;
 *   mapResult?: (result: T) => { status: ExecutionTelemetryStatus; failureCode?: string|null };
 * }} opts
 * @returns {Promise<T>}
 */
export async function withExecutionTelemetry(opts) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const executionId = randomUUID();

  recordExecutionTelemetry({
    executionId,
    actionId: opts.actionId,
    source: opts.source,
    toolName: opts.toolName ?? null,
    missionId: opts.missionId ?? null,
    intentId: opts.intentId ?? null,
    capabilityFamily: opts.capabilityFamily ?? null,
    routingStrategy: opts.routingStrategy ?? null,
    status: 'started',
    startedAt,
  });

  try {
    const result = await opts.run();
    const mapped = opts.mapResult
      ? opts.mapResult(result)
      : { status: /** @type {ExecutionTelemetryStatus} */ ('completed') };
    recordExecutionTelemetry({
      executionId,
      actionId: opts.actionId,
      source: opts.source,
      toolName: opts.toolName ?? null,
      missionId: opts.missionId ?? null,
      intentId: opts.intentId ?? null,
      capabilityFamily: opts.capabilityFamily ?? null,
      routingStrategy: opts.routingStrategy ?? null,
      status: mapped.status,
      failureCode: mapped.failureCode ?? null,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
    });
    return result;
  } catch (err) {
    recordExecutionTelemetry({
      executionId,
      actionId: opts.actionId,
      source: opts.source,
      toolName: opts.toolName ?? null,
      missionId: opts.missionId ?? null,
      intentId: opts.intentId ?? null,
      status: 'failed',
      failureCode: err?.code ? String(err.code) : 'EXECUTION_ERROR',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
    });
    throw err;
  }
}
