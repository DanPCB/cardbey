/**
 * Phase 2.3-F — FIFO authority write lane (SQLite critical writes).
 *
 * Serializes critical Prisma writes when PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION
 * (or SQLITE_RUNTIME_WRITE_SERIALIZATION_ENABLED) is ON. Non-critical fire-and-forget
 * writes should use sqliteWriteQueue.js instead.
 */

import { isPerformerSqliteRuntimeWriteSerializationEnabled } from './broker/brokerFlags.js';

/** @type {Promise<void>} */
let tail = Promise.resolve();

/** True while any authority-lane write is in flight (defers best-effort queue drain). */
let authorityInFlight = false;

/** @returns {boolean} */
export function isSqliteAuthorityWriteInFlight() {
  return authorityInFlight;
}

/**
 * @param {() => Promise<T>} fn
 * @param {string} [_label]
 * @returns {Promise<T>}
 * @template T
 */
export function runSqliteAuthorityWrite(fn, _label = 'authority') {
  if (!isPerformerSqliteRuntimeWriteSerializationEnabled()) {
    return fn();
  }
  const run = tail.then(async () => {
    authorityInFlight = true;
    try {
      return await fn();
    } finally {
      authorityInFlight = false;
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
}
