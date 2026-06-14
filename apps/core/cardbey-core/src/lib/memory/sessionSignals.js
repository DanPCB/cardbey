/**
 * Session signal extraction from client PIL event hints.
 */

/**
 * @param {string[]} recentEventTypes
 * @param {string | null} sessionId
 */
export function extractSessionSignalsFromHints(recentEventTypes = [], sessionId = null) {
  const types = Array.isArray(recentEventTypes)
    ? recentEventTypes.map((t) => String(t ?? '').trim()).filter(Boolean)
    : [];
  const unique = types.filter((t, i, arr) => arr.lastIndexOf(t) === i).slice(-5);
  return {
    learnedSignals: unique,
    recentTypes: types.slice(-10),
    sessionId: sessionId ? String(sessionId) : null,
  };
}

/**
 * @param {import('./memoryTypes.js').UserMemory | null} user
 */
export function toLegacyUserMemory(user) {
  if (!user) return null;
  return {
    previousVisits: user.visitCount ?? 0,
    visitCount: user.visitCount ?? 0,
    lastAction: user.lastAction,
    lastActionAt: user.lastActionAt,
    abandonedTasks: user.abandonedTasks ?? [],
    completedTasks: user.completedTasks ?? [],
    preferences: Array.isArray(user.preferences)
      ? user.preferences
      : user.preferences && typeof user.preferences === 'object'
        ? Object.keys(user.preferences)
        : [],
    recentVisits: user.recentVisits ?? [],
    savedItems: user.savedItems ?? [],
  };
}

/**
 * @param {import('./memoryTypes.js').SessionMemory | null} session
 */
export function toLegacySessionSignals(session) {
  if (!session) {
    return { learnedSignals: [], recentTypes: [], sessionId: null, source: 'none' };
  }
  return {
    learnedSignals: session.learnedSignals ?? [],
    recentTypes: session.recentTypes ?? [],
    sessionId: session.sessionId ?? null,
    source: session.source ?? 'none',
  };
}
