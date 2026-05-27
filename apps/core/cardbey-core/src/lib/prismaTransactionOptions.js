/**
 * Shared Prisma interactive transaction options.
 * Default Prisma timeout is 5s — too low for SQLite under concurrent draft generation + blackboard writes.
 */

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_WAIT_MS = 15_000;
const DEFAULT_BATCH_TIMEOUT_MS = 20_000;
const DEFAULT_BATCH_MAX_WAIT_MS = 10_000;

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @returns {{ maxWait: number, timeout: number }}
 */
export function getPrismaInteractiveTransactionOptions() {
  return {
    maxWait: parsePositiveInt(process.env.PRISMA_TRANSACTION_MAX_WAIT_MS, DEFAULT_MAX_WAIT_MS),
    timeout: parsePositiveInt(process.env.PRISMA_TRANSACTION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

/** Short-lived txs for catalog createMany batches (commitDraft / publishDraft). */
export function getPrismaCatalogBatchTransactionOptions() {
  return {
    maxWait: parsePositiveInt(process.env.PRISMA_CATALOG_BATCH_MAX_WAIT_MS, DEFAULT_BATCH_MAX_WAIT_MS),
    timeout: parsePositiveInt(process.env.PRISMA_CATALOG_BATCH_TIMEOUT_MS, DEFAULT_BATCH_TIMEOUT_MS),
  };
}
