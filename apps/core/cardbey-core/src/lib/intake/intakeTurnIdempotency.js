/**
 * One-shot intake response guard — prevents retry storms on identical turns.
 */

const DEFAULT_TTL_MS = 30_000;

/** @type {Map<string, { expiresAt: number, payload: object }>} */
const recentResponses = new Map();

function normalizeMessage(message) {
  return String(message ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @param {{
 *   actorKey?: string | null;
 *   missionId?: string | null;
 *   sessionKey?: string | null;
 *   userMessage?: string | null;
 *   clientRequestId?: string | null;
 *   activeStoreId?: string | null;
 * }} opts
 */
export function buildIntakeTurnIdempotencyKey(opts = {}) {
  const actor = String(opts.actorKey ?? '').trim() || '_';
  const mission = String(opts.missionId ?? '').trim() || '_';
  const session = String(opts.sessionKey ?? '').trim() || '_';
  const store = String(opts.activeStoreId ?? '').trim() || '_';
  const msg = normalizeMessage(opts.userMessage);
  const clientId = String(opts.clientRequestId ?? '').trim();
  if (clientId) return `${actor}\x1f${mission}\x1f${session}\x1f${store}\x1f${clientId}`;
  return `${actor}\x1f${mission}\x1f${session}\x1f${store}\x1f${msg}`;
}

/**
 * Clarify / store-picker turns must not be cached — context (store selection) may change on retry.
 * @param {object | null | undefined} payload
 * @returns {boolean}
 */
export function shouldCacheIntakeTurnIdempotentResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.action === 'clarify') return false;
  if (payload.clarifyType === 'store_picker') return false;
  return true;
}

/**
 * @param {string} key
 * @returns {object | null}
 */
export function peekIntakeTurnIdempotentResponse(key) {
  const row = recentResponses.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    recentResponses.delete(key);
    return null;
  }
  return row.payload ?? null;
}

/**
 * @param {string} key
 * @param {object} payload
 * @param {number} [ttlMs]
 */
export function recordIntakeTurnIdempotentResponse(key, payload, ttlMs = DEFAULT_TTL_MS) {
  if (!key || !payload || typeof payload !== 'object') return;
  if (!shouldCacheIntakeTurnIdempotentResponse(payload)) return;
  recentResponses.set(key, {
    expiresAt: Date.now() + ttlMs,
    payload,
  });
}

/** @internal tests */
export function clearIntakeTurnIdempotencyForTests() {
  recentResponses.clear();
}
