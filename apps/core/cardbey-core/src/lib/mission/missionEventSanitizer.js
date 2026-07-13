/**
 * Strip heavy binary payloads from mission event records before API serialization.
 */

const HEAVY_KEYS = new Set([
  'imageDataUrl',
  'dataUrl',
  'previewDataUrl',
  'pendingImageDataUrl',
  'base64',
  'rawBytes',
  'fileData',
]);

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function sanitizeMissionEventPayload(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.startsWith('data:image/') && s.length > 200) {
      return '[stripped:image]';
    }
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeMissionEventPayload(entry, depth + 1));
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (HEAVY_KEYS.has(key)) continue;
    out[key] = sanitizeMissionEventPayload(child, depth + 1);
  }
  return out;
}

/**
 * @param {Array<{ id: string; missionId: string; intentId?: string | null; agent?: string | null; type: string; payload: unknown; createdAt: Date | string }>} rows
 */
export function compactMissionEvents(rows) {
  return rows.map((e) => ({
    id: e.id,
    missionId: e.missionId,
    intentId: e.intentId,
    agent: e.agent,
    type: e.type,
    payload: sanitizeMissionEventPayload(e.payload),
    createdAt: e.createdAt,
  }));
}
