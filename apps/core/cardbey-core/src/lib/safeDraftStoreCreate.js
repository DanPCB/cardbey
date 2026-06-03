/**
 * Mission-critical DraftStore.create — authority lane + P1008 retry.
 */

import { isPerformerSqliteRuntimeWriteSerializationEnabled } from './broker/brokerFlags.js';
import { isPrismaSocketTimeoutError, sleep } from './orchestration/orchestrationStabilityMetrics.js';
import { runSqliteAuthorityWrite } from './sqliteWriteLane.js';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 50;

/**
 * @param {import('./prismaClient.js').PrismaClient} prismaClient
 * @param {{ data: object }} args Prisma draftStore.create args
 * @returns {Promise<import('./prismaClient.js').DraftStore>}
 */
export async function safeDraftStoreCreate(prismaClient, args) {
  const runCreate = async () => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        const draft = await prismaClient.draftStore.create(args);
        console.log(`[safeDraftStoreCreate] created draftId=${draft.id}`);
        return draft;
      } catch (err) {
        if (!isPrismaSocketTimeoutError(err) || attempt >= MAX_ATTEMPTS) {
          throw err;
        }
        console.warn(`[safeDraftStoreCreate] retry P1008 attempt=${attempt}`);
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  };

  if (isPerformerSqliteRuntimeWriteSerializationEnabled()) {
    return runSqliteAuthorityWrite(() => runCreate(), 'draftStore.create');
  }
  return runCreate();
}
