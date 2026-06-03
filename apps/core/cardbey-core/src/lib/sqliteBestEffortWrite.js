/**
 * Best-effort SQLite writes — low-priority queue; never throw; log P1008 warnings only.
 */

import {
  isPerformerMissionPipelineWriteIsolationEnabled,
  isPerformerSqliteRuntimeWriteSerializationEnabled,
} from './broker/brokerFlags.js';
import { isPrismaSocketTimeoutError, isSqliteBusyError } from './orchestration/orchestrationStabilityMetrics.js';
import { enqueueWrite, enqueueWriteAwait } from './sqliteWriteQueue.js';

/**
 * @returns {boolean}
 */
export function isSqliteBestEffortLaneEnabled() {
  return (
    isPerformerMissionPipelineWriteIsolationEnabled() ||
    isPerformerSqliteRuntimeWriteSerializationEnabled()
  );
}

/**
 * @param {unknown} err
 * @param {string} label
 */
function logBestEffortWriteFailure(err, label) {
  if (isPrismaSocketTimeoutError(err)) {
    console.warn(`[sqliteBestEffortWrite] P1008 label=${label}: ${err?.message || err}`);
    return;
  }
  if (isSqliteBusyError(err)) {
    console.warn(`[sqliteBestEffortWrite] SQLITE_BUSY label=${label}: ${err?.message || err}`);
    return;
  }
  const msg = err?.message ?? String(err);
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[sqliteBestEffortWrite] failed label=${label}:`, msg);
  }
}

/**
 * Fire-and-forget best-effort write (never throws).
 *
 * @param {() => Promise<unknown>} fn
 * @param {string} [label]
 */
export function runBestEffortSqliteWrite(fn, label = 'bestEffort') {
  const run = async () => {
    try {
      await fn();
    } catch (err) {
      logBestEffortWriteFailure(err, label);
    }
  };

  if (isSqliteBestEffortLaneEnabled()) {
    enqueueWrite(run, label);
    return;
  }
  void run();
}

/**
 * Await best-effort write (still never throws to caller; returns null on failure).
 *
 * @param {() => Promise<T>} fn
 * @param {string} [label]
 * @returns {Promise<T|null>}
 * @template T
 */
export async function runBestEffortSqliteWriteAwait(fn, label = 'bestEffort') {
  const run = async () => {
    try {
      return await fn();
    } catch (err) {
      logBestEffortWriteFailure(err, label);
      return null;
    }
  };

  if (isSqliteBestEffortLaneEnabled()) {
    const result = await enqueueWriteAwait(run, label);
    return result ?? null;
  }
  return run();
}
