/**
 * Mission 001 Gate 8 — canonical pipeline timing (in-memory per draft/mission).
 */

/** @type {Map<string, Record<string, number>>} */
const runs = new Map();

function keyFor(scope) {
  return String(scope?.missionId ?? scope?.draftId ?? 'anonymous');
}

/**
 * @param {Record<string, number>|null|undefined} base
 * @param {Record<string, number>|null|undefined} patch
 */
export function mergePipelineTiming(base, patch) {
  if (!patch || typeof patch !== 'object') return base ? { ...base } : null;
  return { ...(base && typeof base === 'object' ? base : {}), ...patch };
}

/**
 * @param {object} scope
 * @param {Record<string, number>} patch
 */
export function recordPipelineTiming(scope = {}, patch = {}) {
  const key = keyFor(scope);
  const prev = runs.get(key) ?? {};
  const next = mergePipelineTiming(prev, patch);
  if (next) runs.set(key, next);
  return next;
}

/**
 * @param {object} scope
 * @returns {{ mark: (stage: string) => void, finish: () => Record<string, number> }}
 */
export function createPipelineTiming(scope = {}) {
  const key = keyFor(scope);
  const startedAt = Date.now();
  const stages = { _startedAt: startedAt };
  let lastMark = startedAt;

  return {
    mark(stage) {
      const now = Date.now();
      stages[stage] = now - lastMark;
      lastMark = now;
    },
    finish() {
      stages.totalMs = Date.now() - startedAt;
      runs.set(key, { ...stages });
      return { ...stages };
    },
  };
}

export function getPipelineTiming(scope = {}) {
  return runs.get(keyFor(scope)) ?? null;
}

export function clearPipelineTimingForTests() {
  runs.clear();
}
