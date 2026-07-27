/**
 * Critical SQLite writes — authority lane + transient lock/timeout retry.
 */

import { isPerformerSqliteRuntimeWriteSerializationEnabled } from './broker/brokerFlags.js';
import {
  isPrismaSocketTimeoutError,
  isSqliteBusyError,
  isTransientSqliteWriteError,
  sleep,
} from './orchestration/orchestrationStabilityMetrics.js';
import {
  emitSqliteWriteRetry,
  emitSqliteWriteTimeout,
} from './sqliteWriteObservability.js';
import { runSqliteAuthorityWrite } from './sqliteWriteLane.js';

const DEFAULT_P1008_MAX_ATTEMPTS = 3;
const P1008_BASE_BACKOFF_MS = 50;

/**
 * @param {() => Promise<T>} fn
 * @param {{ label?: string; maxAttempts?: number; logPrefix?: string; retryLog?: (attempt: number) => string; missionId?: string | null }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
export async function runCriticalSqliteWriteWithP1008Retry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_P1008_MAX_ATTEMPTS;
  const logPrefix = opts.logPrefix ?? '[criticalSqliteWrite]';
  const label = opts.label ?? 'critical';
  const missionId = opts.missionId ?? null;

  const runWithRetry = async () => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        return await fn();
      } catch (err) {
        if (!isTransientSqliteWriteError(err) || attempt >= maxAttempts) {
          if (isPrismaSocketTimeoutError(err) || isSqliteBusyError(err)) {
            emitSqliteWriteTimeout({
              operation: label,
              missionId,
              attempt,
              code: err?.code ?? (isSqliteBusyError(err) ? 'SQLITE_BUSY' : 'P1008'),
            });
          }
          throw err;
        }
        emitSqliteWriteRetry({
          operation: label,
          missionId,
          attempt,
          code: err?.code ?? (isSqliteBusyError(err) ? 'SQLITE_BUSY' : 'P1008'),
        });
        const msg =
          typeof opts.retryLog === 'function'
            ? opts.retryLog(attempt)
            : `${logPrefix} retry attempt=${attempt} label=${label}`;
        console.warn(msg);
        await sleep(P1008_BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  };

  if (isPerformerSqliteRuntimeWriteSerializationEnabled()) {
    return runSqliteAuthorityWrite(() => runWithRetry(), label, { missionId });
  }
  return runWithRetry();
}

/**
 * @param {() => Promise<T>} fn
 * @param {string} [label]
 * @param {{ missionId?: string | null }} [trace]
 * @returns {Promise<T>}
 * @template T
 */
export function runCriticalSqliteWrite(fn, label = 'critical', trace = {}) {
  if (isPerformerSqliteRuntimeWriteSerializationEnabled()) {
    return runSqliteAuthorityWrite(fn, label, trace);
  }
  return fn();
}
