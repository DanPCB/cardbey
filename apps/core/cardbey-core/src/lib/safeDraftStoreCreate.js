/**
 * Mission-critical DraftStore.create — authority lane + transient SQLite retry.
 */

import { isPerformerSqliteRuntimeWriteSerializationEnabled } from './broker/brokerFlags.js';
import {
  isPrismaSocketTimeoutError,
  isSqliteBusyError,
  isTransientSqliteWriteError,
  sleep,
} from './orchestration/orchestrationStabilityMetrics.js';
import {
  emitSqliteCriticalWriteCompleted,
  emitSqliteCriticalWriteStarted,
  emitSqliteWriteRetry,
  emitSqliteWriteTimeout,
} from './sqliteWriteObservability.js';
import { runSqliteAuthorityWrite } from './sqliteWriteLane.js';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 50;

/**
 * @param {import('./prismaClient.js').PrismaClient} prismaClient
 * @param {{ data: object; missionId?: string | null; operation?: string }} args
 * @returns {Promise<import('./prismaClient.js').DraftStore>}
 */
export async function safeDraftStoreCreate(prismaClient, args) {
  const operation = args.operation ?? 'draftStore.create';
  const missionId = args.missionId ?? null;
  const prismaCreateArgs = { data: args.data };
  const laneEnabled = isPerformerSqliteRuntimeWriteSerializationEnabled();

  const runCreate = async () => {
    const startedAt = Date.now();
    if (!laneEnabled) {
      emitSqliteCriticalWriteStarted({ operation, missionId });
    }
    try {
      let attempt = 0;
      while (true) {
        attempt += 1;
        try {
          const draft = await prismaClient.draftStore.create(prismaCreateArgs);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[safeDraftStoreCreate] created draftId=${draft.id} operation=${operation}`);
          }
          return draft;
        } catch (err) {
          if (!isTransientSqliteWriteError(err) || attempt >= MAX_ATTEMPTS) {
            if (isPrismaSocketTimeoutError(err) || isSqliteBusyError(err)) {
              emitSqliteWriteTimeout({
                operation,
                missionId,
                attempt,
                code: err?.code ?? (isSqliteBusyError(err) ? 'SQLITE_BUSY' : 'P1008'),
              });
            }
            throw err;
          }
          emitSqliteWriteRetry({
            operation,
            missionId,
            attempt,
            code: err?.code ?? (isSqliteBusyError(err) ? 'SQLITE_BUSY' : 'P1008'),
          });
          await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        }
      }
    } finally {
      if (!laneEnabled) {
        emitSqliteCriticalWriteCompleted({ operation, missionId, ms: Date.now() - startedAt });
      }
    }
  };

  if (laneEnabled) {
    return runSqliteAuthorityWrite(() => runCreate(), operation, { missionId });
  }
  return runCreate();
}
