/**
 * Pairing Session Store (in-memory)
 * --------------------------------
 * We track device‑initiated pairing sessions in memory. Each session represents a temporary
 * 6‑char code displayed on the device while waiting for a dashboard approval.
 *
 * Lifecycle:
 * 1) Tablet calls POST /api/screens/pair/initiate with { fingerprint, model, name?, location? }.
 *    - We create a PairSession, generate a 6‑character code (A–Z 0–9), set status='showing_code',
 *      compute expiresAt = now + ttl (default 5 minutes), and emit SSE events:
 *        - 'pair.code_created' (legacy)
 *        - 'screen.pair_session.created' (legacy)
 *        - 'pairing_started' (new) with { sessionId, code, deviceId, fingerprint, deviceModel, deviceName, location }
 *
 * 2) Dashboard listens on the unified SSE stream and shows a banner (with sound). When an operator
 *    approves and provides a name/location, it calls POST /api/screens/pair/register with either
 *    { sessionId, name, location? } (preferred) or legacy { code, ... }.
 *    - We look up the same PairSession, ensure it's not expired, and create or reuse a Screen,
 *      then mark the session status='bound', set session.screenId and token (device JWT).
 *    - Emit events:
 *        - 'pair.bound' (legacy)
 *        - 'screen:new' (only on first bind)
 *        - 'device.hello' (optional banner)
 *        - 'pairing_completed' (new) with { sessionId, screen: { id, name, location } }
 *
 * 3) Tablet polls GET /api/screens/pair/peek/:code (or by sessionId) to learn its status.
 *    - If expiresAt < now and not bound → mark status='expired'.
 *    - Response includes { status, ttlLeftMs, sessionId, screenId?, deviceJwt? } so
 *      the tablet can proceed to the “waiting for playlist” phase once status='bound'.
 *
 * NOTE: Sessions are stored in memory for development. For production, persist sessions (e.g., DB/Redis).
 */

/**
 * Pairing statuses (superset for backward compatibility)
 * - 'showing_code' (device showing code, waiting for dashboard approval)
 * - 'bound'        (dashboard approved & screen created/linked)
 * - 'expired'      (timed out without being bound)
 * - 'completed'    (legacy, post-bind completion step; retained for compatibility)
 */
/** @typedef {'showing_code'|'bound'|'expired'|'completed'} PairStatus */
/** @typedef {'device'|'dashboard'} PairOrigin */

/**
 * @typedef {Object} PairSession
 * @property {string} sessionId
 * @property {string} code
 * @property {number} expiresAt - Unix timestamp in milliseconds
 * @property {PairStatus} status
 * @property {PairOrigin} [origin]
 * @property {string} [deviceId]
 * @property {string|null} [fingerprint]
 * @property {string|null} [model]
 * @property {string|null} [name] // deprecated; use proposedName
 * @property {string|null} [proposedName]
 * @property {string} [screenId]
 * @property {string} [token]
 */

// 6-char code: A–Z & 0–9 (avoid ambiguous chars if needed)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

/**
 * Generate a random 6-character code
 * @returns {string}
 */
function randomCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Normalize code to uppercase
 * @param {string} code
 * @returns {string}
 */
function normaliseCode(code) {
  return (code || '').trim().toUpperCase();
}

/** @type {Map<string, PairSession>} */
const store = new Map();

// Track session creation time for cleanup and dedup
export const sessionCreatedAt = new Map(); // sessionId -> timestamp

/**
 * Put a session into the store
 * @param {PairSession} session
 */
export function putPairSession(session) {
  if (!session || !session.sessionId) {
    throw new Error('Invalid session: missing sessionId');
  }
  store.set(session.sessionId, { ...session });
  if (!sessionCreatedAt.has(session.sessionId)) {
    sessionCreatedAt.set(session.sessionId, Date.now());
  }
}

/**
 * Get a session by sessionId
 * @param {string} sessionId
 * @returns {PairSession | null}
 */
export function getPairSession(sessionId) {
  if (!sessionId) return null;
  const session = store.get(sessionId);
  if (!session) return null;
  
  // Check if expired
  const now = Date.now();
  if (session.expiresAt <= now && session.status !== 'expired' && session.status !== 'completed') {
    session.status = 'expired';
    store.set(sessionId, session);
  }
  
  return { ...session };
}

/**
 * Find a session by code
 * @param {string} code
 * @returns {PairSession | null}
 */
export function findByCode(code) {
  const normalized = normaliseCode(code);
  for (const session of store.values()) {
    if (normaliseCode(session.code) === normalized) {
      // Check if expired
      const now = Date.now();
      if (session.expiresAt <= now && session.status !== 'expired' && session.status !== 'completed') {
        session.status = 'expired';
        store.set(session.sessionId, session);
      }
      return { ...session };
    }
  }
  return null;
}

/**
 * Mark a session as completed (idempotent)
 * @param {string} sessionId
 * @returns {PairSession | null}
 */
export function completePairSession(sessionId) {
  const session = store.get(sessionId);
  if (!session) return null;
  
  // If already completed, return as-is (idempotent)
  if (session.status === 'completed') {
    return { ...session };
  }
  
  // Only allow completion if status is 'bound'
  if (session.status !== 'bound') {
    return { ...session }; // Return current state without changing it
  }
  
  session.status = 'completed';
  store.set(sessionId, session);
  return { ...session };
}

/**
 * Expire all sessions that have passed their expiry time
 * @param {number} [now] - Current timestamp in milliseconds (defaults to Date.now())
 */
export function expireSessions(now = Date.now()) {
  for (const session of store.values()) {
    if (session.expiresAt <= now && session.status !== 'expired' && session.status !== 'completed') {
      session.status = 'expired';
      store.set(session.sessionId, session);
    }
  }
}

/**
 * Allocate a unique code that is not already in use
 * @returns {string}
 */
function allocateUniqueCode() {
  for (let i = 0; i < 25; i += 1) {
    const candidate = randomCode();
    const existing = findByCode(candidate);
    if (!existing || existing.status === 'expired') {
      return candidate;
    }
  }
  throw new Error('PAIR_SESSION_CODE_EXHAUSTED');
}

/**
 * Create a new pairing session
 * @param {{ ttlSec?: number, origin?: PairOrigin, deviceId?: string, fingerprint?: string|null, model?: string|null, proposedName?: string|null, name?: string|null }} [options]
 * @returns {PairSession}
 */
export function createPairSession(options = {}) {
  const ttlSec = Number(options.ttlSec) || 300;
  const expiresAt = Date.now() + (ttlSec * 1000);
  const code = allocateUniqueCode();
  const sessionId = `pair_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  const session = {
    sessionId,
    code,
    expiresAt,
    status: 'showing_code',
    origin: options.origin,
    deviceId: options.deviceId,
    fingerprint: options.fingerprint ?? null,
    model: options.model ?? null,
    name: options.name ?? null,
    proposedName: options.proposedName ?? options.name ?? null,
  };
  
  putPairSession(session);
  return { ...session };
}

/**
 * Update a session's status and optional fields
 * @param {string} sessionId
 * @param {PairStatus} status
 * @param {{ screenId?: string, token?: string, origin?: PairOrigin, deviceId?: string, fingerprint?: string|null, model?: string|null, proposedName?: string|null, name?: string|null }} [updates]
 * @returns {PairSession | null}
 */
export function updatePairSession(sessionId, status, updates = {}) {
  const session = store.get(sessionId);
  if (!session) return null;
  
  session.status = status;
  if (updates.screenId !== undefined) {
    session.screenId = updates.screenId;
  }
  if (updates.token !== undefined) {
    session.token = updates.token;
  }
  if (updates.origin !== undefined) session.origin = updates.origin;
  if (updates.deviceId !== undefined) session.deviceId = updates.deviceId;
  if (updates.fingerprint !== undefined) session.fingerprint = updates.fingerprint;
  if (updates.model !== undefined) session.model = updates.model;
  if (updates.name !== undefined) session.name = updates.name;
  if (updates.proposedName !== undefined) session.proposedName = updates.proposedName;
  
  store.set(sessionId, session);
  return { ...session };
}

/**
 * Get all active (non-expired, non-completed) sessions
 * @returns {PairSession[]}
 */
export function getAllActiveSessions() {
  expireSessions();
  const now = Date.now();
  const active = [];
  for (const session of store.values()) {
    if (session.expiresAt > now && session.status !== 'expired' && session.status !== 'completed') {
      active.push({ ...session });
    }
  }
  return active;
}

/**
 * Clear pair sessions for a given screenId (revoke device tokens)
 * This clears the screenId reference from sessions, effectively revoking the device token
 * @param {string} screenId
 * @returns {number} Number of sessions cleared
 */
export function clearPairSessionsByScreenId(screenId) {
  let clearedCount = 0;
  for (const session of store.values()) {
    if (session.screenId === screenId) {
      // Clear the screenId reference (revoke token)
      session.screenId = undefined;
      delete session.screenId;
      store.set(session.sessionId, session);
      clearedCount++;
    }
  }
  return clearedCount;
}

/**
 * Clean up old completed sessions
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 * @returns {number} Number of sessions removed
 */
export function cleanupOldSessions(maxAgeMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;
  
  for (const [sessionId, createdAt] of sessionCreatedAt.entries()) {
    const session = store.get(sessionId);
    if (!session) {
      sessionCreatedAt.delete(sessionId);
      continue;
    }
    
    // Remove old completed or expired sessions
    if ((session.status === 'completed' || session.status === 'expired') && (now - createdAt) > maxAgeMs) {
      store.delete(sessionId);
      sessionCreatedAt.delete(sessionId);
      removed++;
    }
  }
  
  return removed;
}

/**
 * Get count of active sessions
 * @returns {number}
 */
export function getActiveSessionCount() {
  expireSessions();
  return getAllActiveSessions().length;
}

/**
 * Get the most recently created active session (for dedup logic)
 * @returns {PairSession | null}
 */
export function getMostRecentActiveSession() {
  expireSessions();
  const active = getAllActiveSessions();
  if (active.length === 0) return null;
  
  // Sort by creation time (most recent first)
  active.sort((a, b) => {
    const aTime = sessionCreatedAt.get(a.sessionId) || 0;
    const bTime = sessionCreatedAt.get(b.sessionId) || 0;
    return bTime - aTime;
  });
  
  return active[0];
}

/**
 * Reset store for testing
 */
export function resetStoreForTest() {
  store.clear();
  sessionCreatedAt.clear();
}
