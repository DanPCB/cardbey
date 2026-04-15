/**
 * Wave 3.1 — controlled wrapper for Performer-originated execution (tool dispatch / confirm-phase work).
 *
 * This module does **not** introduce new execution authority: it only structures the call and optionally
 * records additive telemetry when `PERFORMER_EXECUTION_TELEMETRY=true`.
 *
 * @see docs/PERFORMER_EXECUTION_AUTHORITY.md
 */

import { recordExecutionDispatchEvent } from './missionConsoleTelemetryStore.js';

/**
 * @typedef {object} DispatchExecutionPayload
 * @property {'performer'} source Execution entry surface (Wave 3.1: performer only).
 * @property {string} executionType Logical type, e.g. `proactive_step` | `proactive_confirm`.
 * @property {string} missionId Mission pipeline id.
 * @property {string} action Tool or operation name (dispatch name or service entry).
 * @property {Record<string, unknown>} [context] Non-PII hints (step numbers, keys).
 * @property {string|null} [correlationId] Defaults to missionId when omitted.
 * @property {string} [legacySource] Pipeline-write audit `source` string this dispatch aligns with.
 */

/**
 * Run a Performer-originated execution behind a single entry point. Behavior is identical to calling `run`
 * directly; optional telemetry is opt-in via env (see missionConsoleTelemetryStore).
 *
 * @param {DispatchExecutionPayload} payload
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 * @template T
 */
export async function dispatchExecution(payload, run) {
  if (typeof run !== 'function') {
    throw new TypeError('dispatchExecution: run must be a function');
  }

  recordExecutionDispatchEvent({
    source: payload.source,
    executionType: payload.executionType,
    missionId: payload.missionId,
    action: payload.action,
    context: payload.context,
    correlationId: payload.correlationId,
    legacySource: payload.legacySource,
  });

  return run();
}
