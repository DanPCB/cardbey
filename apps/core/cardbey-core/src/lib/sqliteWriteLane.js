/**
 * Phase 2.3-F — FIFO authority write lane (SQLite critical writes).
 */

import { isPerformerSqliteRuntimeWriteSerializationEnabled } from './broker/brokerFlags.js';
import {
  emitSqliteCriticalWriteCompleted,
  emitSqliteCriticalWriteStarted,
  emitSqliteWriteWait,
} from './sqliteWriteObservability.js';

/** @type {Promise<void>} */
let tail = Promise.resolve();

let authorityInFlight = false;
/** Writes waiting on tail (includes the one about to run). */
let queuedDepth = 0;

/** @returns {boolean} */
export function isSqliteAuthorityWriteInFlight() {
  return authorityInFlight;
}

/**
 * @param {() => Promise<T>} fn
 * @param {string} [label]
 * @param {{ missionId?: string | null }} [trace]
 * @returns {Promise<T>}
 * @template T
 */
export function runSqliteAuthorityWrite(fn, label = 'authority', trace = {}) {
  if (!isPerformerSqliteRuntimeWriteSerializationEnabled()) {
    return fn();
  }
  if (authorityInFlight) {
    emitSqliteWriteWait({
      operation: label,
      missionId: trace.missionId ?? null,
      reason: 'nested_inline',
    });
    return fn();
  }

  queuedDepth += 1;
  if (queuedDepth > 1) {
    emitSqliteWriteWait({
      operation: label,
      missionId: trace.missionId ?? null,
      reason: 'queued',
      queueDepth: queuedDepth,
    });
  }

  const run = tail.then(async () => {
    queuedDepth = Math.max(0, queuedDepth - 1);
    const startedAt = Date.now();
    emitSqliteCriticalWriteStarted({ operation: label, missionId: trace.missionId ?? null });
    authorityInFlight = true;
    try {
      return await fn();
    } finally {
      authorityInFlight = false;
      emitSqliteCriticalWriteCompleted({
        operation: label,
        missionId: trace.missionId ?? null,
        ms: Date.now() - startedAt,
      });
    }
  });
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** @internal tests */
export function resetSqliteWriteLaneForTests() {
  tail = Promise.resolve();
  authorityInFlight = false;
  queuedDepth = 0;
}
