/**
 * V1 spawn policy — no dynamic spawn/retry graph (PHASE_B only).
 * @param {object[]} _waveResults
 * @param {Map} _resultsMap
 * @param {object} [_opts]
 * @returns {{ action: 'continue'|'halt'|'retry'|'spawn', reason?: string, task?: object }[]}
 */
export function evaluateWave(_waveResults, _resultsMap, _opts = {}) {
  return [];
}
