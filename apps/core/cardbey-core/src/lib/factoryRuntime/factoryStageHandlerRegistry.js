/**
 * Factory stage handler registry — builtin stages without executor coupling.
 */

/** @type {Map<string, Map<string, Function>>} */
const handlersByFactory = new Map();

function factoryKey(factoryId) {
  return String(factoryId ?? '').trim();
}

function stageKey(stageId) {
  return String(stageId ?? '').trim();
}

/**
 * @param {string} factoryId
 * @param {string} stageId
 * @param {(stage: object, state: object, definition: object, ctx: object) => Promise<{ ok: boolean; output?: object; error?: object; artifactRef?: string }>} handler
 */
export function registerFactoryStageHandler(factoryId, stageId, handler) {
  const fid = factoryKey(factoryId);
  const sid = stageKey(stageId);
  if (!fid || !sid || typeof handler !== 'function') {
    throw new Error('[factoryStageHandlerRegistry] factoryId, stageId, and handler are required');
  }
  if (!handlersByFactory.has(fid)) {
    handlersByFactory.set(fid, new Map());
  }
  handlersByFactory.get(fid).set(sid, handler);
}

/**
 * @param {string} factoryId
 * @param {string} stageId
 */
export function getFactoryStageHandler(factoryId, stageId) {
  const fid = factoryKey(factoryId);
  const sid = stageKey(stageId);
  return handlersByFactory.get(fid)?.get(sid) ?? null;
}

/**
 * @param {string} factoryId
 */
export function listFactoryStageHandlers(factoryId) {
  const fid = factoryKey(factoryId);
  const map = handlersByFactory.get(fid);
  if (!map) return [];
  return [...map.entries()].map(([stageId, handler]) => ({ stageId, handler }));
}

export function clearFactoryStageHandlersForTests() {
  handlersByFactory.clear();
}
