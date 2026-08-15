/**
 * Process-local mutex for claim/OTP critical sections (SQLite / single-node).
 * Postgres uses SELECT FOR UPDATE inside transactions instead (or in addition).
 */

/** @type {Map<string, Promise<void>>} */
const tails = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClaimLock(key, fn) {
  const k = String(key || 'default');
  const prev = tails.get(k) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const next = prev.then(() => gate);
  tails.set(k, next.finally(() => {
    if (tails.get(k) === next) tails.delete(k);
  }));
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

export function otpLockKey(seedId, email) {
  return `otp:${seedId}:${String(email || '').toLowerCase()}`;
}

export function seedClaimLockKey(seedId) {
  return `seed-claim:${seedId}`;
}
