/**
 * Bounded retry layer for genuinely transient database infrastructure errors.
 *
 * Reuse this helper instead of adding ad-hoc retries. It classifies only
 * PostgreSQL/Prisma connection and recovery-mode conditions as transient and
 * refuses to retry normal application or schema errors.
 */

function getDefaultDelaysMs() {
  const env = process.env.CARDBEY_TEST_DB_RETRY_DELAYS_MS;
  if (env) {
    return env.split(',').map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
  }
  return [500, 1000, 2000, 4000, 8000];
}

/** Prisma codes that represent infrastructure/connection transience. */
const TRANSIENT_PRISMA_CODES = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server was reached but timed out
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching connection from pool
]);

/** Case-insensitive transient Postgres/Prisma message fragments. */
const TRANSIENT_MESSAGE_FRAGMENTS = [
  'database system is in recovery mode',
  'cannot connect now',
  'server closed the connection unexpectedly',
  'connection terminated unexpectedly',
  'connection closed',
  'connection has not been opened',
  'database is closed',
  'timed out fetching a new connection',
  'socket timeout',
];

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * @param {unknown} err
 * @returns {string | null} A short classification label, or null if not transient.
 */
export function classifyTransientDbError(err) {
  if (!err || typeof err !== 'object') return null;

  const code = /** @type {{ code?: string; errorCode?: string }} */ (err).code
    || /** @type {{ code?: string; errorCode?: string }} */ (err).errorCode;
  const name = /** @type {{ name?: string }} */ (err).name;
  const message = String(/** @type {{ message?: string }} */ (err).message ?? '').toLowerCase();

  if (name === 'PrismaClientInitializationError') {
    return 'prisma_initialization';
  }

  if (code && TRANSIENT_PRISMA_CODES.has(code)) {
    if (code === 'P1001') return 'db_unreachable';
    if (code === 'P1002') return 'db_timeout';
    if (code === 'P1008') return 'operation_timeout';
    if (code === 'P1017') return 'connection_closed';
    if (code === 'P2024') return 'pool_timeout';
    return 'prisma_transient';
  }

  for (const fragment of TRANSIENT_MESSAGE_FRAGMENTS) {
    if (message.includes(fragment)) {
      if (fragment.includes('recovery')) return 'postgres_recovery';
      if (fragment.includes('cannot connect now')) return 'postgres_cannot_connect';
      if (fragment.includes('closed')) return 'connection_closed';
      if (fragment.includes('terminated')) return 'connection_terminated';
      if (fragment.includes('timeout')) return 'timeout';
      return 'connection_transient';
    }
  }

  return null;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientDbError(err) {
  return classifyTransientDbError(err) !== null;
}

/**
 * Retryable application error surfaced when the transient retry budget is
 * exhausted. The global error handler will convert this to a 503 response.
 */
export class DatabaseTemporarilyUnavailableError extends Error {
  /**
   * @param {string} operation
   * @param {number} attempts
   * @param {unknown} [cause]
   */
  constructor(operation, attempts, cause) {
    super('Cardbey is temporarily reconnecting to the database. Your progress has been preserved. Please try again shortly.');
    this.name = 'DatabaseTemporarilyUnavailableError';
    this.code = 'DATABASE_TEMPORARILY_UNAVAILABLE';
    this.status = 503;
    this.statusCode = 503;
    this.retryable = true;
    this.operation = operation;
    this.attempts = attempts;
    this.cause = cause;
  }
}

/**
 * Execute a database operation with bounded exponential backoff for transient
 * infrastructure errors only.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ operation?: string, delaysMs?: number[], maxRetries?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withTransientDbRetry(fn, options = {}) {
  const operation = options.operation ?? 'db.operation';
  const delaysMs = options.delaysMs ?? getDefaultDelaysMs();
  const maxRetries = options.maxRetries ?? delaysMs.length;
  const maxAttempts = maxRetries + 1;

  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(`[DB_TRANSIENT_RETRY] operation=${operation} attempts=${attempt} state=recovered`);
      }
      return result;
    } catch (err) {
      lastError = err;
      const reason = classifyTransientDbError(err);

      if (!reason || attempt >= maxAttempts) {
        if (reason) {
          console.warn(`[DB_TRANSIENT_RETRY] operation=${operation} attempt=${attempt} state=exhausted reason=${reason}`);
          throw new DatabaseTemporarilyUnavailableError(operation, attempt, err);
        }
        throw err;
      }

      const delayMs = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1] ?? 1000;
      console.warn(`[DB_TRANSIENT_RETRY] operation=${operation} attempt=${attempt} delayMs=${delayMs} reason=${reason}`);
      await sleep(delayMs);
    }
  }

  // Unreachable — kept for type safety.
  throw lastError ?? new DatabaseTemporarilyUnavailableError(operation, attempt, undefined);
}
