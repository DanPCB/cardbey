/**
 * Durable proactive step status on MissionPipeline.metadataJson.
 */

/** @typedef {'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'rejected'} ProactiveStepStatus */

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * @param {unknown} metadataJson
 * @returns {Record<string, object>}
 */
export function readProactiveStepStatusMap(metadataJson) {
  const meta = asObject(metadataJson);
  const map = asObject(meta.proactiveStepStatus);
  return map;
}

/**
 * @param {unknown} metadataJson
 * @param {number} stepNumber
 * @returns {object|null}
 */
export function getProactiveStepRecord(metadataJson, stepNumber) {
  const n = Math.floor(Number(stepNumber));
  if (!Number.isFinite(n) || n < 1) return null;
  const map = readProactiveStepStatusMap(metadataJson);
  const row = map[String(n)];
  return row && typeof row === 'object' ? row : null;
}

/**
 * @param {unknown} metadataJson
 * @param {number} stepNumber
 * @returns {ProactiveStepStatus|null}
 */
export function getProactiveStepStatus(metadataJson, stepNumber) {
  const row = getProactiveStepRecord(metadataJson, stepNumber);
  const st = String(row?.status ?? '').trim().toLowerCase();
  if (st === 'pending' || st === 'running' || st === 'completed' || st === 'failed' || st === 'skipped' || st === 'rejected') {
    return st;
  }
  return null;
}

/**
 * @param {unknown} metadataJson
 * @returns {number[]}
 */
export function hydrateCompletedStepNumbers(metadataJson) {
  const map = readProactiveStepStatusMap(metadataJson);
  const out = [];
  for (const [key, row] of Object.entries(map)) {
    if (!row || typeof row !== 'object') continue;
    if (String(row.status ?? '').toLowerCase() === 'completed') {
      const n = Math.floor(Number(key));
      if (Number.isFinite(n) && n >= 1) out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * @param {unknown} metadataJson
 * @param {number} stepNumber
 * @returns {boolean}
 */
export function isProactiveStepCompleted(metadataJson, stepNumber) {
  return getProactiveStepStatus(metadataJson, stepNumber) === 'completed';
}

/**
 * @param {object} metadataJson
 * @param {number} stepNumber
 * @param {object} patch
 * @returns {object}
 */
export function mergeProactiveStepStatus(metadataJson, stepNumber, patch) {
  const meta = asObject(metadataJson);
  const n = Math.floor(Number(stepNumber));
  const map = { ...readProactiveStepStatusMap(meta) };
  const prev = asObject(map[String(n)]);
  map[String(n)] = {
    ...prev,
    ...patch,
    stepNumber: n,
    updatedAt: new Date().toISOString(),
  };
  return { ...meta, proactiveStepStatus: map };
}
