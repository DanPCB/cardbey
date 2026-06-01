/**
 * In-process runtime memory for orchestration waves (V1 / PHASE_B).
 * Not durable — mission pipeline persists outputs to MissionPipeline.outputsJson.
 */

const stores = new Map();

const DEFAULT_BUDGET = {
  maxTokens: 120_000,
  usedTokens: 0,
  warnAt: 0.85,
};

function getOrCreate(missionId) {
  const id = String(missionId ?? '').trim();
  if (!id) return null;
  return stores.get(id) ?? null;
}

/**
 * @param {string} missionId
 * @param {string} tenantKey
 * @param {string} [orchestrationKind]
 */
export function createStore(missionId, tenantKey, orchestrationKind = 'default') {
  const id = String(missionId ?? '').trim();
  if (!id) throw new Error('runtime_memory_missing_mission_id');
  if (stores.has(id)) {
    const err = new Error('runtime_memory_store_exists');
    err.code = 'RUNTIME_MEMORY_STORE_EXISTS';
    throw err;
  }
  stores.set(id, {
    missionId: id,
    tenantKey: tenantKey ?? 'default',
    orchestrationKind: orchestrationKind ?? 'default',
    wave: 0,
    agents: {},
    tokenBudget: { ...DEFAULT_BUDGET },
    createdAt: Date.now(),
  });
}

/** @param {string} missionId */
export function getStore(missionId) {
  return getOrCreate(missionId);
}

/** @param {string} missionId */
export function toBlackboardSnapshot(missionId) {
  const store = getOrCreate(missionId);
  if (!store) return null;
  return {
    missionId: store.missionId,
    orchestrationKind: store.orchestrationKind,
    wave: store.wave,
    agentStates: { ...store.agents },
    tokenBudget: { ...store.tokenBudget },
  };
}

/**
 * @param {string} missionId
 * @param {string} taskId
 * @param {'running'|'completed'|'failed'} status
 * @param {object} [meta]
 */
export function tickAgent(missionId, taskId, status, meta = {}) {
  const store = getOrCreate(missionId);
  if (!store) return;
  const tid = String(taskId ?? '').trim();
  if (!tid) return;
  store.agents[tid] = {
    ...(store.agents[tid] ?? {}),
    status,
    ...meta,
    updatedAt: Date.now(),
  };
}

/** @param {string} missionId @param {string[]} taskIds */
export function advanceWave(missionId, taskIds = []) {
  const store = getOrCreate(missionId);
  if (!store) return;
  store.wave += 1;
  store.lastWaveTaskIds = [...taskIds];
}

/** @param {string} missionId */
export function isNearBudget(missionId) {
  const store = getOrCreate(missionId);
  if (!store?.tokenBudget) return false;
  const { usedTokens, maxTokens, warnAt } = store.tokenBudget;
  if (!maxTokens) return false;
  return usedTokens / maxTokens >= (warnAt ?? 0.85);
}

/** @param {string} missionId */
export function isOverBudget(missionId) {
  const store = getOrCreate(missionId);
  if (!store?.tokenBudget) return false;
  const { usedTokens, maxTokens } = store.tokenBudget;
  return maxTokens > 0 && usedTokens >= maxTokens;
}

/** Test helper */
export function __clearRuntimeStoresForTests() {
  stores.clear();
}
