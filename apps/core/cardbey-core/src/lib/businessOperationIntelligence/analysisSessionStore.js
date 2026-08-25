/**
 * In-memory analysis session store (Phase C progressive radar).
 * TTL-based; not a durable job system.
 */

const sessions = new Map();
const TTL_MS = 30 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > TTL_MS) sessions.delete(id);
  }
}

/**
 * @param {object} session
 */
export function putAnalysisSession(session) {
  sweep();
  sessions.set(session.analysisId, session);
  return session;
}

/**
 * @param {string} analysisId
 */
export function getAnalysisSession(analysisId) {
  sweep();
  return sessions.get(analysisId) || null;
}

/**
 * @param {string} analysisId
 * @param {object} patch
 */
export function updateAnalysisSession(analysisId, patch) {
  const cur = getAnalysisSession(analysisId);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  sessions.set(analysisId, next);
  return next;
}

/** Test helper */
export function clearAnalysisSessions() {
  sessions.clear();
}
